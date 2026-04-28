// Daily interest detail — a quiet breakdown of what each debt costs per day,
// month, and year. The previous version surfaced a live "BLEEDING RIGHT NOW"
// counter and a pulsing crimson dot; both were removed for Wave 5 to match
// `mobile/DESIGN.md` §4 (no gamification, no anxiety theatre).
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { Colors, Typography, Spacing } from '../src/theme/finance';
import { useAccountsStore } from '../src/stores/accountsStore';
import { computeInterestBreakdown } from '../src/utils/financial';
import { formatCurrency } from '../src/utils/formatters';

export default function InterestDetailScreen() {
  const router = useRouter();
  const { accounts } = useAccountsStore();

  const breakdown = computeInterestBreakdown(accounts);
  const totalDaily = breakdown.reduce((s, b) => s + b.daily, 0);
  const totalMonthly = totalDaily * 30;
  const totalAnnual = totalDaily * 365;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Interest cost</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <Text style={styles.heroEyebrow}>DAILY INTEREST</Text>
          <Text style={styles.heroValue}>{formatCurrency(totalDaily, { decimals: 2 })}</Text>
          <Text style={styles.heroSub}>
            What your current debt accrues, per day, at today's APRs.
          </Text>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: 'Per day', value: formatCurrency(totalDaily, { decimals: 2 }) },
            { label: 'Per month', value: formatCurrency(totalMonthly, { compact: true }) },
            { label: 'Per year', value: formatCurrency(totalAnnual, { compact: true }) },
          ].map((stat) => (
            <Card key={stat.label} style={styles.statCard}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Card>
          ))}
        </View>

        <Text style={styles.sectionTitle}>By account</Text>
        {breakdown.map((b) => (
          <Card key={b.account.id} style={styles.breakdownCard}>
            <View style={styles.breakdownRow}>
              <View>
                <Text style={styles.accountName}>{b.account.name}</Text>
                <Text style={styles.accountAPR}>{b.account.apr_percent}% APR</Text>
              </View>
              <View style={styles.breakdownValues}>
                <Text style={styles.dailyCost}>
                  {formatCurrency(b.daily, { decimals: 2 })}/day
                </Text>
                <Text style={styles.annualCost}>
                  {formatCurrency(b.annual, { compact: true })}/yr
                </Text>
              </View>
            </View>
          </Card>
        ))}

        <Button
          title="Model an early payoff"
          onPress={() => router.push('/whatif/pay_off_debt_early')}
          variant="outline"
          fullWidth
          style={styles.ctaBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
  },
  back: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  title: {
    fontFamily: Typography.fontSerif,
    fontSize: Typography.titleMedium,
    color: Colors.frostWhite,
  },
  content: { padding: Spacing.base, paddingBottom: 100 },
  heroSection: { alignItems: 'center', paddingVertical: Spacing.xxxl },
  heroEyebrow: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    color: Colors.slateGray,
    marginBottom: Spacing.md,
  },
  heroValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 36,
    color: Colors.frostWhite,
    marginBottom: Spacing.sm,
  },
  heroSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    lineHeight: 20,
  },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xl },
  statCard: { flex: 1, padding: Spacing.md, alignItems: 'center', gap: 4 },
  statValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
    marginBottom: Spacing.md,
  },
  breakdownCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  accountAPR: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  breakdownValues: { alignItems: 'flex-end' },
  dailyCost: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.bodySmall,
    color: Colors.frostWhite,
  },
  annualCost: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
  },
  ctaBtn: { marginTop: Spacing.xl },
});
