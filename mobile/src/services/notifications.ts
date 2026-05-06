// Expo Push Notifications setup for The Growth Project: Finance
//
// v1 ships five client-scheduled local notifications:
//   1. Daily EOD check-in reminder
//   2. Milestone unlocked (immediate, after EOD submit response)
//   3. Future-Self Letter delivery (day 90, one-shot)
//   4. Priority Waterfall level-up (immediate, when current_priority_index climbs)
//   5. Monthly Spending DNA report ready (foreground poll against /latest)
//
// All scheduling is local via expo-notifications — there is no backend cron or
// Expo push-send path. We still register the push token on startup so a future
// server-push rollout has the wire already in place.
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { notificationsApi, aiApi } from './api';

// Local cache keys — co-located so the suppression / idempotency contracts are
// discoverable from one place.
export const STORAGE_KEYS = {
  lastEodDate: 'notif.last_eod_date',
  lastPriorityIndex: 'notif.last_priority_index',
  lastSpendingDnaMonth: 'notif.last_spending_dna_month',
  futureSelfScheduled: 'notif.future_self_scheduled',
} as const;

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push notifications require a physical device
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    // Push notification permission denied
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'TGP Finance',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F9C74F',
    });

    await Notifications.setNotificationChannelAsync('eod-reminder', {
      name: 'EOD Check-in Reminder',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F9C74F',
    });
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } catch (error) {
    // Failed to get push token
    return null;
  }
}

// ─── #1 Daily EOD reminder ───────────────────────────────────────────────────

/**
 * Schedule daily EOD reminder notification. Idempotent — cancels any existing
 * EOD reminder before rescheduling so saving the preferences screen twice
 * can't leave duplicates queued.
 */
export async function scheduleEODReminder(time: string, _timezone: string): Promise<void> {
  await cancelEODReminders();

  const [hours, minutes] = time.split(':').map(Number);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Daily check-in.',
      body: 'Two minutes. Know your number.',
      data: { type: 'eod_reminder', screen: '/eod' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour: hours,
      minute: minutes,
      repeats: true,
    },
  });
}

export async function cancelEODReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduled) {
    if (notification.content.data?.type === 'eod_reminder') {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
}

// ─── #2 Milestone unlocked ──────────────────────────────────────────────────

/**
 * Fire an immediate milestone-unlocked notification. No guard here — the
 * caller (EOD submit handler) already scopes this to items in
 * `newly_unlocked_milestones`, so each title only arrives once.
 */
export async function sendMilestoneNotification(milestoneTitle: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Milestone achieved.',
      body: `${milestoneTitle}.`,
      data: { type: 'milestone', screen: '/milestones' },
    },
    trigger: null,
  });
}

// ─── #4 Future-Self Letter delivery (day 90) ────────────────────────────────

/**
 * Schedule the Future Self Letter delivery at `accountCreatedAt + 90 days`.
 * Idempotent: the first successful call persists a flag so repeated calls
 * (e.g. from an onboarding re-entry or app restart) don't stack duplicates.
 */
export async function scheduleFutureSelfDelivery(accountCreatedAt: string): Promise<void> {
  const alreadyScheduled = await AsyncStorage.getItem(STORAGE_KEYS.futureSelfScheduled);
  if (alreadyScheduled === accountCreatedAt) return;

  // Defensive cleanup: drop any previously scheduled future_self pings so we
  // don't end up with two deliveries if `accountCreatedAt` ever changes
  // (migration, re-seed, etc.).
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.type === 'future_self') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  const createdDate = new Date(accountCreatedAt);
  const deliveryDate = new Date(createdDate.getTime() + 90 * 24 * 60 * 60 * 1000);

  if (deliveryDate > new Date()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Ninety days.',
        body: 'Your past self left you a message.',
        data: { type: 'future_self', screen: '/future-letter' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: deliveryDate,
      },
    });
  }

  await AsyncStorage.setItem(STORAGE_KEYS.futureSelfScheduled, accountCreatedAt);
}

// ─── #5 Priority Waterfall level-up ─────────────────────────────────────────

/**
 * Fire an immediate "priority level-up" notification when the returned
 * `current_priority.index` is higher than the value cached locally from the
 * previous EOD. The first-ever call (no cached value) only primes the cache —
 * we don't pop a celebration for a user who is simply using the app for the
 * first time.
 */
export async function maybeSendPriorityLevelUpNotification(current: {
  index: number;
  title: string;
} | null | undefined): Promise<boolean> {
  if (!current) return false;

  const prevRaw = await AsyncStorage.getItem(STORAGE_KEYS.lastPriorityIndex);
  const prev = prevRaw == null ? null : Number(prevRaw);

  await AsyncStorage.setItem(STORAGE_KEYS.lastPriorityIndex, String(current.index));

  if (prev == null || Number.isNaN(prev)) return false;
  if (current.index <= prev) return false;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Priority advanced.',
      body: `Next: ${current.title}.`,
      data: { type: 'priority_levelup', screen: '/' },
    },
    trigger: null,
  });
  return true;
}

// ─── #6 Monthly Spending DNA ready ──────────────────────────────────────────

/**
 * Check the "latest spending DNA" metadata and fire a one-shot notification
 * when a new `month` appears. Safe to call from every app-foreground event —
 * we persist the last-notified `month` locally, so duplicates are impossible
 * until a newer month is generated.
 */
export async function maybeNotifyNewSpendingDnaReport(latest: {
  month: string | null;
  generated_at?: string | null;
}): Promise<boolean> {
  if (!latest?.month) return false;

  const lastNotified = await AsyncStorage.getItem(STORAGE_KEYS.lastSpendingDnaMonth);
  if (lastNotified === latest.month) return false;

  await AsyncStorage.setItem(STORAGE_KEYS.lastSpendingDnaMonth, latest.month);

  // First-run seed: don't surface a notification for an already-generated
  // report the user installed the feature update to find. Only notify when
  // there's a previously-known month AND it's now different.
  if (lastNotified == null) return false;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Spending DNA ready.',
      body: `${formatMonth(latest.month)} report is available.`,
      data: { type: 'spending_dna', screen: '/spending-dna' },
    },
    trigger: null,
  });
  return true;
}

// ─── Foreground sync helpers ────────────────────────────────────────────────

/**
 * One-stop call to run on app foreground / auth-ready. Checks for a newly
 * generated Spending DNA report. Safe to call repeatedly — idempotent.
 */
export async function refreshForegroundNotifications(prefs: {
  spending_dna_alerts?: boolean;
}): Promise<void> {
  // Spending DNA ready
  if (prefs.spending_dna_alerts !== false) {
    try {
      const { data } = await aiApi.getLatestSpendingDna();
      await maybeNotifyNewSpendingDnaReport(data || { month: null });
    } catch {
      // best-effort
    }
  }
}

// ─── EOD submit integration ─────────────────────────────────────────────────

/**
 * Run all post-EOD-submission notification side effects in one pass:
 *   - milestone unlocks (per entry in newly_unlocked_milestones)
 *   - priority level-up (when current_priority.index > cached)
 *   - last_eod_date cache bump
 * Every branch respects its preference toggle.
 */
// Loose envelope for the EOD submit response. Server adds milestone unlocks
// and a current_priority block opportunistically; both are optional.
interface EODSubmitResponse {
  newly_unlocked_milestones?: Array<{ key?: string; title?: string }>;
  current_priority?: { index: number; title: string } | null;
}

export async function handleEodSubmissionNotifications(
  response: EODSubmitResponse | undefined | null,
  prefs: {
    milestone_alerts?: boolean;
    priority_levelup_alerts?: boolean;
  },
): Promise<void> {
  // Cache the fact that the user submitted today so foreground re-checks
  // can stay aligned.
  const today = new Date().toISOString().slice(0, 10);
  await AsyncStorage.setItem(STORAGE_KEYS.lastEodDate, today);

  // Milestone notifications.
  if (prefs.milestone_alerts !== false) {
    const milestones = Array.isArray(response?.newly_unlocked_milestones)
      ? response.newly_unlocked_milestones
      : [];
    for (const m of milestones) {
      if (m?.title) await sendMilestoneNotification(m.title);
    }
  }

  // Priority level-up.
  if (prefs.priority_levelup_alerts !== false) {
    await maybeSendPriorityLevelUpNotification(response?.current_priority ?? null);
  } else if (response?.current_priority?.index != null) {
    // Even with the toggle off, keep the cache in sync so toggling back on
    // doesn't fire a stale level-up.
    await AsyncStorage.setItem(
      STORAGE_KEYS.lastPriorityIndex,
      String(response.current_priority.index),
    );
  }
}

// ─── Misc ───────────────────────────────────────────────────────────────────

export async function registerPushToken(token: string): Promise<void> {
  try {
    await notificationsApi.updatePreferences({ expo_push_token: token });
  } catch (error) {
    // Failed to register push token
  }
}

/**
 * Register the Expo push token on login/app start. We capture the token even
 * though v1 is local-only so that a future server-push rollout has a filled
 * column to target. Silent on devices without granted permission.
 */
export async function registerPushTokenIfGranted(): Promise<void> {
  const token = await registerForPushNotificationsAsync();
  if (token) await registerPushToken(token);
}

function formatMonth(ym: string): string {
  // Input shape is YYYY-MM. Render a human-readable "April 2026" without
  // pulling in a full date lib or touching timezone semantics.
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${MONTHS[m - 1]} ${y}`;
}
