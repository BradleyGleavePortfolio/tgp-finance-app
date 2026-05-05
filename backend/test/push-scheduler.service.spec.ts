// expo-server-sdk ships ESM-only code that Jest's ts-jest transform can't
// parse. The scheduler only imports the sender (which imports expo), so a
// lightweight module mock is enough.
jest.mock('expo-server-sdk', () => ({
  __esModule: true,
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

import { PushSchedulerService } from '../src/push/push-scheduler.service';

// We exercise the scheduler's per-user window + preference filter by driving
// the hourly ticks against a small synthetic user set and asserting which
// pushes we would have attempted.

type Candidate = {
  user_id: string;
  timezone: string;
  eod_reminder_enabled: boolean;
  future_self_letter_enabled: boolean;
  spending_dna_alerts: boolean;
};

function buildStub(opts: {
  candidates: Candidate[];
  profileByUser: Record<string, any>;
  userByUser: Record<string, { id: string; created_at: Date }>;
  nowFixedIso: string;
}) {
  const prisma: any = {
    notificationPreferences: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          opts.candidates.filter((c) => {
            // Emulate the prefField filter
            for (const k of Object.keys(where)) {
              if (k === 'expo_push_token') continue;
              if (where[k] === true && (c as any)[k] !== true) return false;
            }
            return true;
          }),
        ),
      ),
    },
    financialProfile: {
      findUnique: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(opts.profileByUser[where.user_id] ?? null),
      ),
    },
    user: {
      findUnique: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(opts.userByUser[where.id] ?? null),
      ),
    },
  };
  const pushSender: any = { send: jest.fn().mockResolvedValue({ sent: true }) };
  const svc = new PushSchedulerService(prisma, pushSender);
  jest.useFakeTimers().setSystemTime(new Date(opts.nowFixedIso));
  return { svc, pushSender, prisma };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('PushSchedulerService timezone windows', () => {
  it('EOD reminder fires for a user at 20:30 local (within 21:00 ±30)', async () => {
    // 04:30 UTC is 20:30 America/Los_Angeles (standard time) and 21:30 EST.
    // Pick Jan (no DST surprises). LA is UTC-8 → 04:30 UTC = 20:30 local.
    const { svc, pushSender } = buildStub({
      nowFixedIso: '2026-01-10T04:30:00.000Z',
      candidates: [
        {
          user_id: 'u1',
          timezone: 'America/Los_Angeles',
          eod_reminder_enabled: true,
          future_self_letter_enabled: false,
          spending_dna_alerts: false,
        },
      ],
      profileByUser: { u1: { last_eod_date: null } },
      userByUser: { u1: { id: 'u1', created_at: new Date('2025-01-01T00:00:00Z') } },
    });

    await svc.tickEodReminder();
    expect(pushSender.send).toHaveBeenCalledTimes(1);
    expect(pushSender.send).toHaveBeenCalledWith(
      'u1',
      'eod_reminder',
      expect.objectContaining({ title: expect.stringContaining('daily check-in') }),
    );
  });

  it('EOD reminder does NOT fire for a user at 20:25 local (outside 21:00 ±30)', async () => {
    // 04:25 UTC = 20:25 LA local. Just 35 min before target 21:00, outside window.
    const { svc, pushSender } = buildStub({
      nowFixedIso: '2026-01-10T04:25:00.000Z',
      candidates: [
        {
          user_id: 'u1',
          timezone: 'America/Los_Angeles',
          eod_reminder_enabled: true,
          future_self_letter_enabled: false,
          spending_dna_alerts: false,
        },
      ],
      profileByUser: { u1: { last_eod_date: null } },
      userByUser: { u1: { id: 'u1', created_at: new Date('2025-01-01T00:00:00Z') } },
    });

    await svc.tickEodReminder();
    expect(pushSender.send).not.toHaveBeenCalled();
  });

  it('EOD reminder skips if user already logged today (local)', async () => {
    // 04:30 UTC on Jan 10 → America/Los_Angeles wall clock is Jan 9 20:30.
    // So the user's local day-of-record is Jan 9 — that's the last_eod_date
    // value that means "already logged".
    const { svc, pushSender } = buildStub({
      nowFixedIso: '2026-01-10T04:30:00.000Z',
      candidates: [
        {
          user_id: 'u1',
          timezone: 'America/Los_Angeles',
          eod_reminder_enabled: true,
          future_self_letter_enabled: false,
          spending_dna_alerts: false,
        },
      ],
      profileByUser: {
        u1: { last_eod_date: new Date('2026-01-09T00:00:00Z') },
      },
      userByUser: { u1: { id: 'u1', created_at: new Date('2025-01-01T00:00:00Z') } },
    });

    await svc.tickEodReminder();
    expect(pushSender.send).not.toHaveBeenCalled();
  });

  it('Future-self letter only fires after 90 days AND when letter exists', async () => {
    const base = {
      nowFixedIso: '2026-01-10T16:00:00.000Z', // LA 08:00 = within 08:00 ±30
      candidates: [
        {
          user_id: 'u1',
          timezone: 'America/Los_Angeles',
          eod_reminder_enabled: false,
          future_self_letter_enabled: true,
          spending_dna_alerts: false,
        },
      ],
    };
    // Letter exists, account is 90+ days old → fires.
    {
      const { svc, pushSender } = buildStub({
        ...base,
        profileByUser: { u1: { future_self_letter: 'Hi future me' } },
        userByUser: {
          u1: { id: 'u1', created_at: new Date('2025-09-01T00:00:00Z') },
        },
      });
      await svc.tickFutureSelfLetter();
      expect(pushSender.send).toHaveBeenCalledWith(
        'u1',
        'future_self_letter',
        expect.objectContaining({ title: expect.stringContaining('past self') }),
      );
    }
    // Account <90 days old → no push.
    {
      const { svc, pushSender } = buildStub({
        ...base,
        profileByUser: { u1: { future_self_letter: 'Hi future me' } },
        userByUser: {
          u1: { id: 'u1', created_at: new Date('2025-12-15T00:00:00Z') },
        },
      });
      await svc.tickFutureSelfLetter();
      expect(pushSender.send).not.toHaveBeenCalled();
    }
  });
});
