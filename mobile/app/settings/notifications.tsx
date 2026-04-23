// Notification preferences screen
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { notificationsApi } from '../../src/services/api';
import { scheduleEODReminder } from '../../src/services/notifications';
import type { NotificationPreferences } from '../../src/types';

export default function NotificationsScreen() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Partial<NotificationPreferences>>({
    eod_reminder_enabled: true,
    eod_reminder_time: '20:00',
    streak_alerts_enabled: true,
    milestone_alerts: true,
    coach_messages: true,
    red_flag_alerts: true,
    timezone: 'America/Los_Angeles',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Read-only fetch: fall back to the local defaults if the server call fails.
    notificationsApi.getPreferences().then(({ data }) => {
      if (data) setPrefs(data.preferences || data);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await notificationsApi.updatePreferences(prefs);
      if (prefs.eod_reminder_enabled && prefs.eod_reminder_time) {
        await scheduleEODReminder(prefs.eod_reminder_time, prefs.timezone || 'UTC');
      }
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
        {[
          { key: 'eod_reminder_enabled', label: 'EOD Reminder', desc: 'Daily check-in reminder at your configured time' },
          { key: 'streak_alerts_enabled', label: 'Streak Alerts', desc: 'When your streak hits 7, 14, 30, 90, 365 days' },
          { key: 'milestone_alerts', label: 'Milestone Celebrations', desc: 'When you unlock a financial milestone' },
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
});
