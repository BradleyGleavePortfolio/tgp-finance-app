// Income Gap Analyzer screen
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { ProgressBar } from '../src/components/ui/ProgressBar';
import { Colors, Typography, Spacing } from '../src/theme/finance';
import { useAuthStore } from '../src/stores/authStore';
import { formatCurrency, formatMonths } from '../src/utils/formatters';

export default function IncomeGapScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();

  const dreamCost = profile?.dream_lifestyle_cost_mo || 0;
  const currentTakeHome = (profile?.monthly_income_gross || 0) * 0.75;
  const gap = Math.max(0, dreamCost - currentTakeHome);
  const gapProgress = dreamCost > 0 ? Math.min(100, (currentTakeHome / dreamCost) * 100) : 0;

  // Time to close gap at 5% annual income growth
  const monthsToClose = gap > 0
    ? Math.ceil(Math.log(dreamCost / currentTakeHome) / Math.log(1 + 0.05 / 12))
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Income Gap</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.mainCard}>
          <Text style={styles.cardLabel}>INCOME GAP TO DREAM LIFESTYLE</Text>
          <Text style={[styles.gapAmount, { color: gap > 0 ? Colors.debtCrimson : Colors.profitGreen }]}>
            {gap > 0 ? `-${formatCurrency(gap)}/mo` : 'Gap closed!'}
          </Text>

          <View style={styles.comparison}>
            <View style={styles.compItem}>
              <Text style={styles.compLabel}>Current Take-Home</Text>
              <Text style={styles.compValue}>{formatCurrency(currentTakeHome)}/mo</Text>
            </View>
            <View style={styles.compArrow}>
              <Text style={styles.arrowText}>→</Text>
            </View>
            <View style={styles.compItem}>
              <Text style={styles.compLabel}>Dream Lifestyle</Text>
              <Text style={styles.compValue}>{formatCurrency(dreamCost)}/mo</Text>
            </View>
          </View>

          <ProgressBar
            progress={gapProgress}
            height={8}
            variant="savings"
            showLabel
            label={`${gapProgress.toFixed(0)}% to dream`}
          />
        </Card>

        {gap > 0 && (
          <Card style={styles.timelineCard}>
            <Text style={styles.timelineLabel}>At 5% annual income growth:</Text>
            <Text style={styles.timelineValue}>{formatMonths(monthsToClose)}</Text>
            <Text style={styles.timelineSub}>to close the gap at current trajectory</Text>
          </Card>
        )}

        <Text style={styles.strategiesTitle}>Strategies to Close the Gap</Text>

        {[
          { action: 'Negotiate a 15% raise', impact: 'Closes 40% of gap immediately', type: 'income' },
          { action: 'Add $1,500/mo freelance income', impact: 'Closes gap significantly faster', type: 'income' },
          { action: 'Relocate to lower-cost city', impact: 'Reduces required dream income', type: 'location' },
        ].map((strategy, i) => (
          <Card key={i} style={styles.strategyCard}>
            <Text style={styles.strategyAction}>{strategy.action}</Text>
            <Text style={styles.strategyImpact}>{strategy.impact}</Text>
          </Card>
        ))}

        <Button
          title="Model a Salary Raise →"
          onPress={() => router.push('/whatif/salary_negotiation')}
          variant="primary"
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
  mainCard: { padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.base, gap: Spacing.md },
  cardLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.microLabel, color: Colors.slateGray, letterSpacing: 1.5, textAlign: 'center' },
  gapAmount: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.displayMedium, textAlign: 'center' },
  comparison: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, width: '100%', justifyContent: 'space-between' },
  compItem: { flex: 1, alignItems: 'center' },
  compLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, textAlign: 'center' },
  compValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.frostWhite, textAlign: 'center' },
  compArrow: { paddingHorizontal: Spacing.sm },
  arrowText: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleSmall, color: Colors.accentGold },
  timelineCard: { padding: Spacing.base, alignItems: 'center', marginBottom: Spacing.xl, gap: Spacing.xs },
  timelineLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  timelineValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.titleMedium, color: Colors.accentGold },
  timelineSub: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  strategiesTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  strategyCard: { padding: Spacing.md, marginBottom: Spacing.sm, gap: 4 },
  strategyAction: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  strategyImpact: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.profitGreen },
  ctaBtn: { marginTop: Spacing.base },
});
