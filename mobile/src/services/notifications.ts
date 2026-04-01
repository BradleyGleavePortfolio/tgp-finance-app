// Expo Push Notifications setup for The Growth Project: Finance
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { notificationsApi } from './api';

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

/**
 * Schedule daily EOD reminder notification
 */
export async function scheduleEODReminder(time: string, timezone: string): Promise<void> {
  // Cancel existing EOD reminders
  await cancelEODReminders();

  const [hours, minutes] = time.split(':').map(Number);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Daily Check-in Time',
      body: 'Daily check-in time. 2 minutes. Know your number.',
      data: { type: 'eod_reminder', screen: '/eod' },
    },
    trigger: {
      type: 'daily',
      hour: hours,
      minute: minutes,
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

/**
 * Schedule streak at-risk reminder (9 PM if not submitted)
 */
export async function scheduleStreakRiskReminder(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Streak at Risk',
      body: "Your streak is at risk. Don't break the chain.",
      data: { type: 'streak_risk', screen: '/eod' },
    },
    trigger: {
      type: 'daily',
      hour: 21,
      minute: 0,
    },
  });
}

/**
 * Send immediate local milestone notification
 */
export async function sendMilestoneNotification(milestoneTitle: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Milestone Achieved!',
      body: `${milestoneTitle} achieved! Open the app to celebrate.`,
      data: { type: 'milestone', screen: '/milestones' },
    },
    trigger: null, // immediate
  });
}

/**
 * Schedule Future Self Letter delivery at day 90
 */
export async function scheduleFutureSelfDelivery(accountCreatedAt: string): Promise<void> {
  const createdDate = new Date(accountCreatedAt);
  const deliveryDate = new Date(createdDate.getTime() + 90 * 24 * 60 * 60 * 1000);

  if (deliveryDate > new Date()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '90 Days Complete',
        body: "It's been 90 days. Your past self left you a message.",
        data: { type: 'future_self', screen: '/future-letter' },
      },
      trigger: {
        type: 'date',
        timestamp: deliveryDate.getTime(),
      },
    });
  }
}

/**
 * Register push token with backend
 */
export async function registerPushToken(token: string): Promise<void> {
  try {
    await notificationsApi.updatePreferences({ expo_push_token: token });
  } catch (error) {
    // Failed to register push token
  }
}
