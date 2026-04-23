// Interest Bleed detail screen — live second-by-second counter
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/finance';
import { useAccountsStore } from '../src/stores/accountsStore';
import { computeInterestBreakdown } from '../src/utils/financial';
import { formatCurrency } from '../src/utils/formatters';

export default function InterestBleedScreen() {
  const router = useRouter();
  const { accounts } = useAccountsStore();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const breakdown = computeInterestBreakdown(accounts);
  const totalDaily = breakdown.reduce((s, b) => s + b.daily, 0);
  const totalMonthly = totalDaily * 30;
  const totalAnnual = totalDaily * 365;

  // Running total for today
  const secondsToday = new Date().getHours() * 3600 + new Date().getMinutes() * 60 + new Date().getSeconds() + tick;
  const todayTotal = totalDaily * (secondsToday / 86400);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Interest Bleed</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero counter */}
        <View style={styles.heroSection}>
          <Text style={styles.heroLabel}>BLEEDING RIGHT NOW</Text>
          <Text style={styles.heroValue}>{formatCurrency(todayTotal, { decimals: 4 })}</Text>
          <Text style={styles.heroSub}>today, counting up every second</Text>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: 'Per Day', value: formatCurrency(totalDaily, { decimals: 2 }) },
            { label: 'Per Month', value: formatCurrency(totalMonthly, { compact: true }) },
            { label: 'Per Year', value: formatCurrency(totalAnnual, { compact: true }) },
          ].map((stat) => (
            <Card key={stat.label} style={styles.statCard}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Card>
          ))}
        </View>

        <Text style={styles.callout}>This is money leaving your pocket to banks. Every day you hold this debt.</Text>

        {/* Per-account breakdown */}
        <Text style={styles.sectionTitle}>Breakdown by Account</Text>
        {breakdown.map((b) => (
          <Card key={b.account.id} style={styles.breakdownCard}>
            <View style={styles.breakdownRow}>
              <View>
                <Text style={styles.accountName}>{b.account.name}</Text>
                <Text style={styles.accountAPR}>{b.account.apr_percent}% APR</Text>
              </View>
              <View style={styles.breakdownValues}>
                <Text style={styles.dailyCost}>{formatCurrency(b.daily, { decimals: 4 })}/day</Text>
                <Text style={styles.annualCost}>{formatCurrency(b.annual, { compact: true })}/yr</Text>
              </View>
            </View>
          </Card>
        ))}

        <Button
          title="What if I paid this off?"
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  content: { padding: Spacing.base, paddingBottom: 100 },
  heroSection: { alignItems: 'center', paddingVertical: Spacing.xxxl },
  heroLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray, letterSpacing: 2, marginBottom: Spacing.md },
  heroValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 36, color: Colors.debtCrimson, marginBottom: Spacing.sm },
  heroSub: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xl },
  statCard: { flex: 1, padding: Spacing.md, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.debtCrimson },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  callout: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, textAlign: 'center', marginBottom: Spacing.xl, fontStyle: 'italic' },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  breakdownCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accountName: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  accountAPR: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.amberWarning },
  breakdownValues: { alignItems: 'flex-end' },
  dailyCost: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.debtCrimson },
  annualCost: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  ctaBtn: { marginTop: Spacing.xl },
});
