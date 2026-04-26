// Profile & Settings screen
// UX Psychology Report #3: light haptic on nav rows, warning on sign out
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../src/components/ui/Card';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { StreakBadge, VelocityBadge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
import { useAccountsStore } from '../../src/stores/accountsStore';
import { signOut } from '../../src/lib/signOut';
import { formatCurrency } from '../../src/utils/formatters';
import { computeFINumber } from '../../src/utils/financial';
import { ScreenErrorBoundary } from '../../src/components/ui/ScreenErrorBoundary';
import { IdentityBadge } from '../../src/components/IdentityBadge';
import { resolveIdentityTitle } from '../../src/lib/identityTitle';
import { usersApi } from '../../src/services/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile } = useAuthStore();
  const { accounts, netWorth, totalDebt, totalAssets } = useAccountsStore();
  const [foundingData, setFoundingData] = React.useState<{
    rank: number; total: number; isFoundingMember: boolean;
  } | null>(null);

  React.useEffect(() => {
    usersApi.getFoundingNumber().then(r => setFoundingData(r.data?.data ?? r.data)).catch(() => {});
  }, []);

  const handleNavRow = (route: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    router.push(route as any);
  };

  const handleLogout = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch { /* ignore */ }
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          // Central helper resets every Zustand store so the next user never
          // sees the previous user's data on a shared device.
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const weeksSinceJoin = React.useMemo(() => {
    if (!profile?.created_at) return 0;
    const ms = Date.now() - new Date(profile.created_at as any).getTime();
    return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
  }, [profile?.created_at]);

  const identityTitle = React.useMemo(() => resolveIdentityTitle({
    primaryGoal: profile?.primary_goal,
    streak: profile?.streak_days ?? 0,
    weeksSinceJoin,
    isFoundingMember: foundingData?.isFoundingMember ?? false,
  }), [profile?.primary_goal, profile?.streak_days, weeksSinceJoin, foundingData]);

  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const safeNetWorth = isFinite(netWorth) ? netWorth : 0;
  const dreamCost = isFinite(profile?.dream_lifestyle_cost_mo as number) ? (profile?.dream_lifestyle_cost_mo || 0) : 0;
  const fiNumber = dreamCost > 0 ? computeFINumber(dreamCost) : 0;
  const fiProgress = fiNumber > 0 ? Math.max(0, Math.min(100, (safeNetWorth / fiNumber) * 100)) : 0;
  const debtAccounts = safeAccounts.filter(a => a?.is_debt).length;
  const totalAccounts = safeAccounts.length;

  const settingsItems = [
    // UX Psychology Report #4: Preference-Controlled Personalization
    { icon: 'color-palette-outline', label: 'Personalization', route: '/preferences' },
    { icon: 'notifications-outline', label: 'Notification Preferences', route: '/settings/notifications' },
    { icon: 'shield-checkmark-outline', label: 'Account & Security', route: '/settings/security' },
    // UX Psychology Report #2: Trust as Emotion
    { icon: 'lock-closed-outline', label: 'Trust Center', route: '/trust-center' },
    { icon: 'mail-outline', label: 'Future Self Letter', route: '/future-letter' },
    { icon: 'analytics-outline', label: 'Spending DNA', route: '/spending-dna' },
    { icon: 'trending-up-outline', label: 'Income Gap', route: '/income-gap' },
    { icon: 'people-circle-outline', label: 'Accountability Partner', route: '/accountability' },
    ...(user?.role === 'coach' ? [{ icon: 'people-outline', label: 'Coach Panel', route: '/(tabs)/coach' }] : []),
  ];

  return (
    <ScreenErrorBoundary screenName="Profile">
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Avatar + name */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || 'U').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.role === 'coach' && <Text style={styles.roleTag}>COACH</Text>}
          {/* Identity reinforcement — UX Psych Report #3 */}
          <Text style={styles.identityTitleText}>{identityTitle}</Text>
          {foundingData && foundingData.rank > 0 && (
            <IdentityBadge
              rank={foundingData.rank}
              isFoundingMember={foundingData.isFoundingMember}
              style={styles.identityBadgeStyle}
            />
          )}
        </View>

        {/* Stats */}
        <Card style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatCurrency(netWorth, { compact: true })}</Text>
              <Text style={styles.statLabel}>Net Worth</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <StreakBadge streak={profile?.streak_days || 0} />
              <Text style={styles.statLabel}>Streak</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalAccounts}</Text>
              <Text style={styles.statLabel}>Accounts</Text>
            </View>
          </View>

          {profile?.wealth_velocity_score !== undefined && (
            <View style={styles.velocitySection}>
              <VelocityBadge score={profile.wealth_velocity_score} />
              <ProgressBar
                progress={profile.wealth_velocity_score}
                height={4}
                variant="gold"
                style={styles.velocityBar}
              />
            </View>
          )}
        </Card>

        {/* FI Progress */}
        {fiNumber > 0 && (
          <Card style={styles.fiCard}>
            <Text style={styles.fiLabel}>Financial Independence Progress</Text>
            <Text style={styles.fiTarget}>{formatCurrency(fiNumber, { compact: true })} FI Number</Text>
            <ProgressBar progress={fiProgress} height={8} variant="gold" showLabel label={`${fiProgress.toFixed(1)}% there`} />
          </Card>
        )}

        {/* Location */}
        {(profile?.city || profile?.country) && (
          <Card style={styles.locationCard}>
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color={Colors.slateGray} />
              <Text style={styles.locationText}>
                {[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}
              </Text>
            </View>
          </Card>
        )}

        {/* Goals */}
        {profile?.primary_goal && (
          <Card style={styles.goalsCard}>
            <Text style={styles.goalsTitle}>Primary Goal</Text>
            <Text style={styles.goalsValue}>{profile.primary_goal}</Text>
            {profile.dream_description && (
              <>
                <Text style={styles.goalsTitle}>Dream Lifestyle</Text>
                <Text style={styles.dreamText}>{profile.dream_description}</Text>
              </>
            )}
          </Card>
        )}

        {/* Settings navigation */}
        <View style={styles.settingsSection}>
          <Text style={styles.settingsTitle}>Settings</Text>
          {settingsItems.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.settingsRow}
              onPress={() => handleNavRow(item.route)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon as any} size={20} color={Colors.slateGray} />
              <Text style={styles.settingsLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.slateGray} />
            </TouchableOpacity>
          ))}
        </View>

        <Button
          title="Log Out"
          onPress={handleLogout}
          variant="ghost"
          style={styles.logoutBtn}
        />

        <Text style={styles.disclaimer}>
          This app provides financial education and tracking tools for informational purposes only.
          Nothing in this app constitutes financial, tax, or investment advice.
          Consult a licensed financial professional before making financial decisions.
        </Text>
      </ScrollView>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  content: { padding: Spacing.base, paddingBottom: 100 },
  profileHeader: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.accentGold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 36, color: Colors.backgroundDeepNavy },
  name: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleMedium, color: Colors.frostWhite },
  email: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  roleTag: { fontFamily: 'Inter_700Bold', fontSize: Typography.microLabel, color: Colors.accentGold, letterSpacing: 2, borderWidth: 1, borderColor: Colors.accentGold, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  statsCard: { padding: Spacing.base, marginBottom: Spacing.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  stat: { alignItems: 'center', gap: 4 },
  statValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.titleSmall, color: Colors.accentGold },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  statDivider: { width: 1, height: 40, backgroundColor: Colors.graphiteBorder },
  velocitySection: { marginTop: Spacing.md, gap: Spacing.sm },
  velocityBar: { marginTop: Spacing.xs },
  fiCard: { padding: Spacing.base, marginBottom: Spacing.md, gap: Spacing.sm },
  fiLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray },
  fiTarget: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodyMedium, color: Colors.accentGold },
  locationCard: { padding: Spacing.md, marginBottom: Spacing.md },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  locationText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  goalsCard: { padding: Spacing.base, marginBottom: Spacing.md, gap: Spacing.sm },
  goalsTitle: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray, letterSpacing: 0.5 },
  goalsValue: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  dreamText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, lineHeight: 20 },
  settingsSection: { marginTop: Spacing.md },
  settingsTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.graphiteBorder },
  settingsLabel: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  logoutBtn: { marginTop: Spacing.xl, marginBottom: Spacing.base },
  disclaimer: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, textAlign: 'center', lineHeight: 16, paddingBottom: Spacing.base },
  // Identity (UX Psych Report #3)
  identityTitleText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyLarge,
    color: Colors.frostWhite,
    letterSpacing: 0.3,
    marginTop: Spacing.xs,
  },
  identityBadgeStyle: {
    alignSelf: 'center',
    marginTop: Spacing.xs,
  },
});
