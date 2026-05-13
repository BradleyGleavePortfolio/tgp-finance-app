// Notification preferences screen
// UX Psychology Report #3: success haptic on save
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { notificationsApi } from '../../src/services/api';
import {
  scheduleEODReminder,
  requestAndRegisterPushTokenInteractive,
} from '../../src/services/notifications';
import type { NotificationPreferences } from '../../src/types';

export default function NotificationsScreen() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Partial<NotificationPreferences>>({
    eod_reminder_enabled: true,
    eod_reminder_time: '20:00',
    milestone_alerts: true,
    coach_messages: true,
    red_flag_alerts: true,
    future_self_letter_enabled: true,
    priority_levelup_alerts: true,
    spending_dna_alerts: true,
    timezone: 'America/Los_Angeles',
  });
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined' | 'unknown'>(
    'unknown',
  );

  const refreshPermission = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted' || status === 'denied' || status === 'undetermined') {
        setPermission(status);
      } else {
        setPermission('unknown');
      }
    } catch {
      setPermission('unknown');
    }
  };

  useEffect(() => {
    // Read-only fetch: fall back to the local defaults if the server call fails.
    notificationsApi.getPreferences().then(({ data }) => {
      if (data) setPrefs(data.preferences || data);
    }).catch(() => {});
    refreshPermission();
  }, []);

  const handleEnableNotifications = async () => {
    if (permission === 'denied') {
      // OS won't show the prompt again — kick the user into the Settings app.
      Linking.openSettings().catch(() => undefined);
      return;
    }
    const token = await requestAndRegisterPushTokenInteractive();
    await refreshPermission();
    if (!token) {
      Alert.alert(
        'Notifications off',
        Platform.OS === 'ios'
          ? 'You can turn them on later in iOS Settings > TGP Finance > Notifications.'
          : 'You can turn them on later in your device Settings.',
      );
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await notificationsApi.updatePreferences(prefs);
      if (prefs.eod_reminder_enabled && prefs.eod_reminder_time) {
        await scheduleEODReminder(prefs.eod_reminder_time, prefs.timezone || 'UTC');
      }
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* ignore */ }
      Alert.alert('Saved', 'Notification preferences updated.');
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  const togglePref = (key: keyof NotificationPreferences) => {
    setPrefs((p) => ({ ...p, [key]: !(p as Record<string, any>)[key as string] }));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {permission !== 'granted' ? (
          <View style={styles.recoveryCard}>
            <Text style={styles.recoveryTitle}>System notifications are off</Text>
            <Text style={styles.recoveryDesc}>
              {permission === 'denied'
                ? 'Open Settings to allow notifications for TGP Finance.'
                : "We'll only ask once. Enable to receive check-in reminders and milestone alerts."}
            </Text>
            <Button
              title={permission === 'denied' ? 'Open Settings' : 'Turn on notifications'}
              onPress={handleEnableNotifications}
              variant="primary"
              fullWidth
              size="md"
              style={styles.recoveryBtn}
            />
          </View>
        ) : null}
        {[
          { key: 'eod_reminder_enabled', label: 'EOD Reminder', desc: 'Daily check-in reminder at your configured time' },
          { key: 'milestone_alerts', label: 'Milestones', desc: 'When you reach a financial milestone' },
          { key: 'priority_levelup_alerts', label: 'Priority Level-Up', desc: 'When you advance to the next Priority Waterfall stage' },
          { key: 'future_self_letter_enabled', label: 'Future-Self Letter', desc: 'Delivered 90 days after you write it during onboarding' },
          { key: 'spending_dna_alerts', label: 'Spending DNA Alerts', desc: 'Get a heads-up when your spending pattern looks unusual.' },
          { key: 'coach_messages', label: 'Coach Messages', desc: 'When your coach leaves a note or update' },
        ].map((item) => (
          <View key={item.key} style={styles.prefRow}>
            <View style={styles.prefInfo}>
              <Text style={styles.prefLabel}>{item.label}</Text>
              <Text style={styles.prefDesc}>{item.desc}</Text>
            </View>
            <Switch
              value={prefs[item.key as keyof NotificationPreferences] as boolean}
              onValueChange={() => togglePref(item.key as keyof NotificationPreferences)}
              trackColor={{ false: Colors.graphiteBorder, true: Colors.accentGold }}
              thumbColor={Colors.backgroundDeepNavy}
            />
          </View>
        ))}

        <Button title="Save Preferences" onPress={handleSave} loading={saving} variant="primary" fullWidth size="lg" style={styles.saveBtn} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  content: { padding: Spacing.base, paddingBottom: 100 },
  prefRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.graphiteBorder },
  prefInfo: { flex: 1, paddingRight: Spacing.md },
  prefLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  prefDesc: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, marginTop: 2 },
  saveBtn: { marginTop: Spacing.xxl },
  recoveryCard: {
    padding: Spacing.base,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.amberWarning ?? Colors.accentGold,
    backgroundColor: Colors.cardSurfaceNavy,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  recoveryTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  recoveryDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    lineHeight: 18,
  },
  recoveryBtn: { marginTop: Spacing.xs },
});
