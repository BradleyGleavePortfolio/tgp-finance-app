// Expo Push Notifications setup for The Growth Project: Finance
//
// v1 ships six client-scheduled local notifications:
//   1. Daily EOD check-in reminder
//   2. Streak-at-risk reminder (21:00 local, only when streak > 0 and no EOD today)
//   3. Milestone unlocked (immediate, after EOD submit response)
//   4. Future-Self Letter delivery (day 90, one-shot)
//   5. Priority Waterfall level-up (immediate, when current_priority_index climbs)
//   6. Monthly Spending DNA report ready (foreground poll against /latest)
//
// All scheduling is local via expo-notifications — there is no backend cron or
// Expo push-send path. We still register the push token on startup so a future
// server-push rollout has the wire already in place.
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { notificationsApi, eodApi, aiApi, profileApi } from './api';

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
      title: 'Daily Check-in Time',
      body: 'Daily check-in time. 2 minutes. Know your number.',
      data: { type: 'eod_reminder', screen: '/eod' },
    },
    trigger: {
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

// ─── #2 Streak-at-risk reminder ──────────────────────────────────────────────

/**
 * Schedule the streak-at-risk reminder at 21:00 local. Only arms the repeating
 * trigger when the user has a live streak and has NOT submitted EOD today —
 * this keeps a cancelled-then-rearmed path clean and avoids nagging users on
 * days the streak isn't in play.
 */
export async function scheduleStreakRiskReminder(opts: {
  streakDays: number;
  lastEodDate?: string | null;
}): Promise<void> {
  await cancelStreakRiskReminders();

  if ((opts.streakDays ?? 0) <= 0) return;
  if (isSameLocalDay(opts.lastEodDate, new Date())) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Streak at Risk',
      body: 'Check in today. The streak holds.',
      data: { type: 'streak_risk', screen: '/eod' },
    },
    trigger: {
      hour: 21,
      minute: 0,
      repeats: true,
    },
  });
}

export async function cancelStreakRiskReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduled) {
    if (notification.content.data?.type === 'streak_risk') {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
}

// ─── #3 Milestone unlocked ──────────────────────────────────────────────────

/**
 * Fire an immediate milestone-unlocked notification. No guard here — the
 * caller (EOD submit handler) already scopes this to items in
 * `newly_unlocked_milestones`, so each title only arrives once.
 */
export async function sendMilestoneNotification(milestoneTitle: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Milestone Achieved.',
      body: `${milestoneTitle} achieved. Open the app to celebrate.`,
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
        title: '90 Days Complete',
        body: "It's been 90 days. Your past self left you a message.",
        data: { type: 'future_self', screen: '/future-letter' },
      },
      trigger: { date: deliveryDate },
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
      title: 'Priority Level-Up',
      body: `Next priority: ${current.title}`,
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
      title: 'Spending DNA ready',
      body: `Your Spending DNA for ${formatMonth(latest.month)} is ready.`,
      data: { type: 'spending_dna', screen: '/spending-dna' },
    },
    trigger: null,
  });
  return true;
}

// ─── Foreground sync helpers ────────────────────────────────────────────────

/**
 * One-stop call to run on app foreground / auth-ready. Re-evaluates the
 * streak-at-risk schedule (using today's EOD state) and checks for a newly
 * generated Spending DNA report. Safe to call repeatedly — every branch is
 * idempotent.
 */
export async function refreshForegroundNotifications(prefs: {
  streak_alerts_enabled?: boolean;
  spending_dna_alerts?: boolean;
}): Promise<void> {
  // Streak-at-risk
  if (prefs.streak_alerts_enabled !== false) {
    try {
      const { data } = await eodApi.getToday();
      const submittedToday = !!(data && (data.id || data?.submission?.id));
      const profile = await safeFetchProfile();
      const streakDays = Number(profile?.streak_days || 0);
      if (submittedToday) {
        await cancelStreakRiskReminders();
      } else {
        await scheduleStreakRiskReminder({
          streakDays,
          lastEodDate: profile?.last_eod_date ?? null,
        });
      }
    } catch {
      // best-effort
    }
  } else {
    await cancelStreakRiskReminders();
  }

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

async function safeFetchProfile(): Promise<any | null> {
  try {
    const { data } = await profileApi.get();
    return data || null;
  } catch {
    return null;
  }
}

// ─── EOD submit integration ─────────────────────────────────────────────────

/**
 * Run all post-EOD-submission notification side effects in one pass:
 *   - milestone unlocks (per entry in newly_unlocked_milestones)
 *   - priority level-up (when current_priority.index > cached)
 *   - streak-at-risk suppression (today was submitted)
 *   - last_eod_date cache bump
 * Every branch respects its preference toggle.
 */
export async function handleEodSubmissionNotifications(
  response: any,
  prefs: {
    milestone_alerts?: boolean;
    priority_levelup_alerts?: boolean;
    streak_alerts_enabled?: boolean;
  },
): Promise<void> {
  // Cache the fact that the user submitted today so foreground re-checks
  // don't re-arm streak-at-risk needlessly.
  const today = new Date().toISOString().slice(0, 10);
  await AsyncStorage.setItem(STORAGE_KEYS.lastEodDate, today);

  // Suppress streak-at-risk for today — they already submitted.
  if (prefs.streak_alerts_enabled !== false) {
    await cancelStreakRiskReminders();
  }

  // Milestone notifications.
  if (prefs.milestone_alerts !== false) {
    const milestones: Array<{ key: string; title: string }> = Array.isArray(
      response?.newly_unlocked_milestones,
    )
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

function isSameLocalDay(a: string | null | undefined, b: Date): boolean {
  if (!a) return false;
  const da = new Date(a);
  return (
    da.getFullYear() === b.getFullYear() &&
    da.getMonth() === b.getMonth() &&
    da.getDate() === b.getDate()
  );
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
