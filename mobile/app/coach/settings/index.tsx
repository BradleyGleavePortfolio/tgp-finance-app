/**
 * CoachSettingsScreen — coach profile, branding, billing entry points.
 *
 * Stage 2 ships read-only access to the coach's existing /api/users/me data
 * with deep links into the existing settings stack (notifications, security,
 * trust center). Branding, payment links, and calendar integration are
 * explicit "coming soon" rows so coaches see the surface even though the
 * implementation lands in Stage 3.
 */
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius } from '../../../src/theme/tokens';
import { useAuthStore } from '../../../src/stores/authStore';
import { CoachStatusPill } from '../../../src/components/coach/CoachStatusPill';

export default function CoachSettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>SETTINGS</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
        <Text style={styles.headline}>Coach settings.</Text>

        <View style={styles.profileCard}>
          <Text style={styles.profileName}>{user?.name ?? '—'}</Text>
          <Text style={styles.profileEmail}>{user?.email ?? ''}</Text>
          <View style={{ marginTop: spacing.sm, flexDirection: 'row' }}>
            <CoachStatusPill label={user?.role ?? 'unknown'} tone="good" />
          </View>
        </View>

        <Text style={styles.sectionTitle}>PROFILE</Text>
        <View style={styles.list}>
          <Row icon="person-outline" label="Display name & bio" hint="Coming in Stage 3" disabled />
          <Row icon="image-outline" label="Branding & avatar" hint="Coming in Stage 3" disabled />
          <Row
            icon="link-outline"
            label="Public coach link"
            hint="Coming in Stage 3"
            disabled
          />
        </View>

        <Text style={styles.sectionTitle}>PAYMENTS & SCHEDULING</Text>
        <View style={styles.list}>
          <Row icon="card-outline" label="Payment links (Stripe)" hint="Coming in Stage 3" disabled />
          <Row icon="calendar-outline" label="Calendar integration" hint="Coming in Stage 3" disabled />
        </View>

        <Text style={styles.sectionTitle}>APP</Text>
        <View style={styles.list}>
          <Row
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push('/settings/notifications')}
          />
          <Row
            icon="lock-closed-outline"
            label="Security"
            onPress={() => router.push('/settings/security')}
          />
          <Row
            icon="shield-checkmark-outline"
            label="Trust center"
            onPress={() => router.push('/trust-center')}
          />
        </View>

        <Pressable
          onPress={() => logout()}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.logoutText}>SIGN OUT</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  hint,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress ? { opacity: 0.7 } : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Ionicons name={icon} size={20} color={disabled ? colors.stone : colors.charcoal} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, disabled && { color: colors.stone }]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {!disabled ? <Ionicons name="chevron-forward" size={18} color={colors.stone} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bone },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  eyebrow: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  headline: {
    ...typography.scale.h1,
    fontFamily: typography.families.serif,
    color: colors.ink,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  profileCard: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  profileName: {
    fontFamily: typography.families.serif,
    fontSize: 22,
    color: colors.ink,
  },
  profileEmail: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
    marginTop: 4,
  },
  sectionTitle: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.stone,
  },
  rowLabel: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
  },
  rowHint: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
    marginTop: 2,
  },
  logoutBtn: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.oxblood,
    borderRadius: radius.sm,
  },
  logoutText: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.oxblood,
  },
});
