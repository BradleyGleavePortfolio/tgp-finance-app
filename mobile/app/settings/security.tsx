// Account & Security screen
// UX Psychology Report #3: light on back, medium on password reset
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
import { sendPasswordResetEmail } from '../../src/services/supabase';

export default function SecurityScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [resetSent, setResetSent] = useState(false);

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* ignore */ }
    try {
      await sendPasswordResetEmail(user.email);
      setResetSent(true);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* ignore */ }
      Alert.alert('Password Reset', `Reset email sent to ${user.email}. Check your inbox.`);
    } catch {
      Alert.alert('Error', 'Failed to send reset email.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ } router.back(); }} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Account & Security</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>{user?.role}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Password</Text>
          <Text style={styles.desc}>We'll send a password reset link to your email address.</Text>
          <Button
            title={resetSent ? '✓ Reset Email Sent' : 'Change Password'}
            onPress={handlePasswordReset}
            variant={resetSent ? 'secondary' : 'outline'}
            disabled={resetSent}
          />
        </View>

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
  section: { marginBottom: Spacing.xxl },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.graphiteBorder },
  infoLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray },
  infoValue: { fontFamily: 'Inter_500Medium', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  desc: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, marginBottom: Spacing.md, lineHeight: 20 },
});
