// Mock the Expo SDK before importing the service — the service constructs
// `new Expo(...)` at instantiation time, so the mock must already be in
// place when we `new PushSenderService(...)`.
jest.mock('expo-server-sdk', () => {
  const chunkPushNotifications = jest.fn((msgs: any[]) => [msgs]);
  const chunkPushNotificationReceiptIds = jest.fn((ids: any[]) => [ids]);
  const sendPushNotificationsAsync = jest.fn();
  const getPushNotificationReceiptsAsync = jest.fn().mockResolvedValue({});

  class Expo {
    static isExpoPushToken(token: unknown): boolean {
      // Match both ExponentPushToken[...] and ExpoPushToken[...] wrappers.
      return typeof token === 'string' && /^Exp(onent)?PushToken\[/.test(token);
    }
    chunkPushNotifications = chunkPushNotifications;
    chunkPushNotificationReceiptIds = chunkPushNotificationReceiptIds;
    sendPushNotificationsAsync = sendPushNotificationsAsync;
    getPushNotificationReceiptsAsync = getPushNotificationReceiptsAsync;
  }

  return {
    __esModule: true,
    Expo,
    // Re-export the jest mocks so tests can assert on them.
    __mocks__: {
      sendPushNotificationsAsync,
      getPushNotificationReceiptsAsync,
      chunkPushNotifications,
    },
  };
});

import { PushSenderService } from '../src/push/push-sender.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const expoMockModule = require('expo-server-sdk');
const { sendPushNotificationsAsync } = (expoMockModule as any).__mocks__;

const validToken = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxx]';

function makePrismaStub(overrides: any = {}): any {
  return {
    notificationPreferences: {
      findUnique: jest.fn().mockResolvedValue({
        user_id: 'u1',
        expo_push_token: validToken,
        eod_reminder_enabled: true,
        milestone_alerts: true,
        priority_levelup_alerts: true,
        future_self_letter_enabled: true,
        spending_dna_alerts: true,
        ...(overrides.prefs ?? {}),
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    pushLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      ...(overrides.pushLog ?? {}),
    },
  };
}

describe('PushSenderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendPushNotificationsAsync.mockResolvedValue([{ status: 'ok', id: 'receipt-1' }]);
  });

  it('sends a message with the correct shape', async () => {
    const prisma = makePrismaStub();
    const svc = new PushSenderService(prisma);

    const result = await svc.send('u1', 'eod_reminder', {
      title: 'Hi',
      body: 'Log EOD',
      data: { screen: 'EOD' },
    });

    expect(result).toEqual({ sent: true });
    expect(sendPushNotificationsAsync).toHaveBeenCalledTimes(1);
    const [[[msg]]] = sendPushNotificationsAsync.mock.calls;
    expect(msg).toMatchObject({
      to: validToken,
      title: 'Hi',
      body: 'Log EOD',
      data: { screen: 'EOD' },
      sound: 'default',
      priority: 'high',
    });
    expect(prisma.pushLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'u1',
          type: 'eod_reminder',
          title: 'Hi',
          body: 'Log EOD',
          error: null,
        }),
      }),
    );
  });

  it('dedupes a same-type same-day send via PushLog', async () => {
    const prisma = makePrismaStub({
      pushLog: {
        findFirst: jest.fn().mockResolvedValue({ id: 'previous' }),
        create: jest.fn().mockResolvedValue({}),
      },
    });
    const svc = new PushSenderService(prisma);

    const result = await svc.send('u1', 'eod_reminder', { title: 't', body: 'b' });

    expect(result).toEqual({ sent: false, reason: 'duplicate' });
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it('skips when preference is off', async () => {
    const prisma = makePrismaStub({ prefs: { eod_reminder_enabled: false } });
    const svc = new PushSenderService(prisma);

    const result = await svc.send('u1', 'eod_reminder', { title: 't', body: 'b' });

    expect(result).toEqual({ sent: false, reason: 'preference_off' });
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it('skips silently when no token is registered', async () => {
    const prisma = makePrismaStub({ prefs: { expo_push_token: null } });
    const svc = new PushSenderService(prisma);

    const result = await svc.send('u1', 'eod_reminder', { title: 't', body: 'b' });

    expect(result).toEqual({ sent: false, reason: 'no_token' });
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it('clears the token when Expo returns DeviceNotRegistered', async () => {
    sendPushNotificationsAsync.mockResolvedValue([
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    ]);
    const prisma = makePrismaStub();
    const svc = new PushSenderService(prisma);

    const result = await svc.send('u1', 'eod_reminder', { title: 't', body: 'b' });

    expect(result.sent).toBe(false);
    expect(prisma.notificationPreferences.update).toHaveBeenCalledWith({
      where: { user_id: 'u1' },
      data: { expo_push_token: null },
    });
  });

  it('event-dedupes milestone by milestone_key', async () => {
    const prisma = makePrismaStub({
      pushLog: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where.type === 'net_worth_milestone' && where.data?.equals === 'nw_10k') {
            return { id: 'previous' };
          }
          return null;
        }),
        create: jest.fn().mockResolvedValue({}),
      },
    });
    const svc = new PushSenderService(prisma);

    const result = await svc.send('u1', 'net_worth_milestone', {
      title: 't',
      body: 'b',
      data: { milestone_key: 'nw_10k' },
    });

    expect(result).toEqual({ sent: false, reason: 'duplicate' });
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it('bypassDedupe=true ignores duplicate check (for test endpoint)', async () => {
    const prisma = makePrismaStub({
      pushLog: {
        findFirst: jest.fn().mockResolvedValue({ id: 'previous' }),
        create: jest.fn().mockResolvedValue({}),
      },
    });
    const svc = new PushSenderService(prisma);

    const result = await svc.send(
      'u1',
      'eod_reminder',
      { title: 't', body: 'b' },
      { bypassDedupe: true },
    );

    expect(result).toEqual({ sent: true });
    expect(sendPushNotificationsAsync).toHaveBeenCalledTimes(1);
  });
});
