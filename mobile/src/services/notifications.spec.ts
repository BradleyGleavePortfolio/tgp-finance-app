// Unit tests for the client-side notification scheduling guards. The
// expo-notifications + AsyncStorage + api modules are mocked so each test
// exercises pure guard logic without touching the platform runtime.

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: { MAX: 5, HIGH: 4 },
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test]' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id-123'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
}));

jest.mock('expo-device', () => ({ isDevice: true }));

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStore[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete mockStore[key];
      return Promise.resolve();
    }),
  },
}));

jest.mock('./api', () => ({
  notificationsApi: {
    updatePreferences: jest.fn().mockResolvedValue({ data: {} }),
    getPreferences: jest.fn().mockResolvedValue({ data: {} }),
  },
  eodApi: {
    getToday: jest.fn().mockResolvedValue({ data: null }),
  },
  aiApi: {
    getLatestSpendingDna: jest.fn().mockResolvedValue({ data: { month: null, generated_at: null } }),
  },
  profileApi: {
    get: jest.fn().mockResolvedValue({ data: null }),
  },
}));

import * as Notifications from 'expo-notifications';
import {
  STORAGE_KEYS,
  scheduleStreakRiskReminder,
  maybeSendPriorityLevelUpNotification,
  maybeNotifyNewSpendingDnaReport,
  scheduleFutureSelfDelivery,
  handleEodSubmissionNotifications,
} from './notifications';

beforeEach(() => {
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
  (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockClear();
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
});

describe('scheduleStreakRiskReminder', () => {
  it('does not schedule when streak is zero', async () => {
    await scheduleStreakRiskReminder({ streakDays: 0 });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does not schedule when EOD already submitted today', async () => {
    const today = new Date().toISOString();
    await scheduleStreakRiskReminder({ streakDays: 5, lastEodDate: today });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules a 21:00 repeating trigger when streak is live and EOD not yet submitted', async () => {
    await scheduleStreakRiskReminder({ streakDays: 5, lastEodDate: null });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.trigger).toEqual({ hour: 21, minute: 0, repeats: true });
    expect(call.content.data.type).toBe('streak_risk');
  });
});

describe('maybeSendPriorityLevelUpNotification', () => {
  it('primes cache without firing on first call', async () => {
    const fired = await maybeSendPriorityLevelUpNotification({ index: 2, title: 'Build 3-Month Emergency Fund' });
    expect(fired).toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockStore[STORAGE_KEYS.lastPriorityIndex]).toBe('2');
  });

  it('fires when index increases from a cached value', async () => {
    mockStore[STORAGE_KEYS.lastPriorityIndex] = '1';
    const fired = await maybeSendPriorityLevelUpNotification({ index: 2, title: 'Build 3-Month Emergency Fund' });
    expect(fired).toBe(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('stays silent when index is unchanged', async () => {
    mockStore[STORAGE_KEYS.lastPriorityIndex] = '3';
    const fired = await maybeSendPriorityLevelUpNotification({ index: 3, title: 'Max Tax-Advantaged Investing' });
    expect(fired).toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('maybeNotifyNewSpendingDnaReport', () => {
  it('no-ops when the API returns null month', async () => {
    const fired = await maybeNotifyNewSpendingDnaReport({ month: null });
    expect(fired).toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('first seen month primes cache without firing', async () => {
    const fired = await maybeNotifyNewSpendingDnaReport({ month: '2026-03' });
    expect(fired).toBe(false);
    expect(mockStore[STORAGE_KEYS.lastSpendingDnaMonth]).toBe('2026-03');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('fires when a newer month appears after one was seen', async () => {
    mockStore[STORAGE_KEYS.lastSpendingDnaMonth] = '2026-02';
    const fired = await maybeNotifyNewSpendingDnaReport({ month: '2026-03' });
    expect(fired).toBe(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toContain('March 2026');
  });

  it('does not re-fire for the same month', async () => {
    mockStore[STORAGE_KEYS.lastSpendingDnaMonth] = '2026-03';
    const fired = await maybeNotifyNewSpendingDnaReport({ month: '2026-03' });
    expect(fired).toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('scheduleFutureSelfDelivery', () => {
  it('schedules once per created_at and is idempotent on repeat call', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    await scheduleFutureSelfDelivery(fiveDaysAgo);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    await scheduleFutureSelfDelivery(fiveDaysAgo);
    // No second schedule — the stored marker blocks it.
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('skips scheduling when the 90-day mark has already passed', async () => {
    const veryOld = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    await scheduleFutureSelfDelivery(veryOld);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    // Still marks as scheduled so we don't re-evaluate on every app start.
    expect(mockStore[STORAGE_KEYS.futureSelfScheduled]).toBe(veryOld);
  });
});

// Doctrine guard: per mobile/DESIGN.md §2 and §5, push titles and bodies
// must be emoji-free, declarative, and end in a period where complete.
// This test reads the actual content the runtime would schedule.
describe('push copy doctrine', () => {
  // Strips Unicode emoji ranges. Allows hairline glyphs (✓, ✕, ★) but in
  // practice push copy doesn't use them either.
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/u;

  it('streak risk notification has no emoji and reads quietly', async () => {
    await scheduleStreakRiskReminder({ streakDays: 3, lastEodDate: null });
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.title).not.toMatch(emojiRegex);
    expect(call.content.body).not.toMatch(emojiRegex);
    expect(call.content.title).not.toMatch(/!|🔥|🎉/);
  });

  it('priority level-up notification has no emoji', async () => {
    mockStore[STORAGE_KEYS.lastPriorityIndex] = '1';
    await maybeSendPriorityLevelUpNotification({ index: 2, title: 'Build 3-Month Emergency Fund' });
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.title).not.toMatch(emojiRegex);
    expect(call.content.body).not.toMatch(emojiRegex);
  });

  it('spending DNA notification has no emoji', async () => {
    mockStore[STORAGE_KEYS.lastSpendingDnaMonth] = '2026-02';
    await maybeNotifyNewSpendingDnaReport({ month: '2026-03' });
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.title).not.toMatch(emojiRegex);
    expect(call.content.body).not.toMatch(emojiRegex);
  });
});

describe('handleEodSubmissionNotifications', () => {
  it('fires a milestone notification for each unlocked entry when toggle is on', async () => {
    await handleEodSubmissionNotifications(
      {
        newly_unlocked_milestones: [
          { key: 'cash_1k', title: 'Starter Pack Achieved' },
          { key: 'streak_7', title: 'Week Warrior' },
        ],
        current_priority: { index: 0, title: 'Build $1,000 Cash Buffer' },
      },
      { milestone_alerts: true, priority_levelup_alerts: true, streak_alerts_enabled: true },
    );
    // Two milestone notifications + priority seed does NOT fire (no prior cache).
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('suppresses milestone notifications when the toggle is off', async () => {
    await handleEodSubmissionNotifications(
      {
        newly_unlocked_milestones: [{ key: 'cash_1k', title: 'Starter Pack Achieved' }],
        current_priority: null,
      },
      { milestone_alerts: false, priority_levelup_alerts: false, streak_alerts_enabled: false },
    );
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
