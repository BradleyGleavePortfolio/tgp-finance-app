// Home — Command Center screen — BULLETPROOF
import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedCounter } from '../../src/components/ui/AnimatedCounter';
import { VitalSigns } from '../../src/components/home/VitalSigns';
import { TimeToFreedom } from '../../src/components/home/TimeToFreedom';
import { PriorityCard } from '../../src/components/home/PriorityCard';
import { InterestBleedTicker } from '../../src/components/home/InterestBleedTicker';
import { QuickActions } from '../../src/components/home/QuickActions';
import { CelebrationModal } from '../../src/components/milestones/CelebrationModal';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { Button } from '../../src/components/ui/Button';
import { ScreenErrorBoundary } from '../../src/components/ui/ScreenErrorBoundary';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
import { useAccountsStore } from '../../src/stores/accountsStore';
import { useNetWorthStore } from '../../src/stores/networthStore';
import { usePriorityStore } from '../../src/stores/priorityStore';
import { useMilestonesStore } from '../../src/stores/milestonesStore';
import { useEODStore } from '../../src/stores/eodStore';
import { NetWorthChart } from '../../src/components/charts/NetWorthChart';
import { formatChange, getGreeting } from '../../src/utils/formatters';
import { computeDTI, computeSavingsRate } from '../../src/utils/financial';

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile } = useAuthStore();
  const { accounts, netWorth, totalDebt, dailyInterest, fetchAccounts, isLoading } = useAccountsStore();
  const { history: nwHistory, currentNetWorth, previousNetWorth, fetchHistory } = useNetWorthStore();
  const { currentPriority, fetchCurrent } = usePriorityStore();
  const { pendingCelebration, dismissCelebration } = useMilestonesStore();
  const { todaySubmission, fetchToday } = useEODStore();

  useEffect(() => {
    fetchAccounts();
    fetchHistory();
    fetchCurrent();
    fetchToday();
  }, []);

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAccounts(), fetchHistory(), fetchCurrent(), fetchToday()]);
    setRefreshing(false);
  };

  // BULLETPROOF: Safe array & numeric guards
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const safeNetWorth = isFinite(netWorth) ? netWorth : 0;
  const safeCurrent = isFinite(currentNetWorth) ? currentNetWorth : 0;
  const safePrevious = isFinite(previousNetWorth) ? previousNetWorth : 0;
  const safeDailyInterest = isFinite(dailyInterest) ? dailyInterest : 0;

  const displayNetWorth = safeCurrent || safeNetWorth;
  const { text: changeText, isPositive } = formatChange(displayNetWorth - safePrevious);
  const monthlyGross = isFinite(profile?.monthly_income_gross as number) ? (profile?.monthly_income_gross || 0) : 0;
  const dti = computeDTI(safeAccounts, monthlyGross);
  const savingsRate = computeSavingsRate(monthlyGross * 0.75);
  const monthlyIncome = monthlyGross * 0.75;
  const monthlyDebts = safeAccounts.filter(a => a?.is_debt).reduce((s, a) => s + (Number(a?.minimum_payment) || 0), 0);
  const cashFlow = isFinite(monthlyIncome - monthlyDebts) ? monthlyIncome - monthlyDebts : 0;

  // Compute Time to Freedom metrics from actual financial data
  const totalDebtVal = safeAccounts.filter(a => a?.is_debt).reduce((s, a) => s + (Number(a?.balance) || 0), 0);
  const debtFreeMonths = totalDebtVal > 0 && monthlyDebts > 0
    ? Math.ceil(totalDebtVal / monthlyDebts)
    : totalDebtVal <= 0 ? 0 : undefined;
  const totalCash = safeAccounts
    .filter(a => !a?.is_debt && ['checking', 'savings'].includes(a?.account_type))
    .reduce((s, a) => s + (Number(a?.balance) || 0), 0);
  const emergencyTarget = monthlyIncome > 0 ? monthlyIncome * 3 : 10000;
  const emergencyGap = Math.max(0, emergencyTarget - totalCash);
  const monthlySurplus = Math.max(0, cashFlow - monthlyDebts);
  const emergencyFundMonths = emergencyGap <= 0 ? 0
    : monthlySurplus > 0 ? Math.ceil(emergencyGap / monthlySurplus) : undefined;
  const dreamCost = isFinite(profile?.dream_lifestyle_cost_mo as number) ? (profile?.dream_lifestyle_cost_mo || 5000) : 5000;
  const fiNumber = (dreamCost * 12 / 0.04) * 1.20; // +20% inflation buffer
  const fiGap = Math.max(0, fiNumber - Math.max(0, displayNetWorth));
  const annualSavings = monthlySurplus * 12;
  const dreamLifestyleMonths = fiGap <= 0 ? 0
    : annualSavings > 0 ? Math.ceil(fiGap / annualSavings * 12) : undefined;

  if (isLoading && safeAccounts.length === 0) {
    return <LoadingSpinner fullScreen text="Loading your command center..." />;
  }

  return (
    <ScreenErrorBoundary screenName="Command Center" onRetry={onRefresh}>
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accentGold}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()}, {user?.name?.split(' ')[0] || 'there'}</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        </View>

        {/* Hero Net Worth */}
        <View style={styles.heroSection}>
          <Text style={styles.netWorthLabel}>NET WORTH</Text>
          <AnimatedCounter
            value={displayNetWorth}
            previousValue={safePrevious}
            style={styles.heroNumber}
            decimals={0}
          />
          <Text style={[styles.changeText, { color: isPositive ? Colors.profitGreen : Colors.debtCrimson }]}>
            {changeText}
          </Text>
        </View>

        {/* Net Worth 90-Day Chart */}
        {Array.isArray(nwHistory) && nwHistory.length > 0 && (
          <View style={styles.section}>
            <NetWorthChart history={nwHistory} height={180} showIndicator />
          </View>
        )}

        {/* Financial Vital Signs */}
        <View style={styles.section}>
          <VitalSigns
            netWorth={displayNetWorth}
            cashFlow={cashFlow}
            dti={dti}
            savingsRate={savingsRate}
          />
        </View>

        {/* Time to Freedom */}
        <View style={styles.section}>
          <TimeToFreedom
            debtFreeMonths={debtFreeMonths}
            emergencyFundMonths={emergencyFundMonths}
            dreamLifestyleMonths={dreamLifestyleMonths}
          />
        </View>

        {/* Current Priority */}
        <View style={styles.section}>
          <PriorityCard
            priority={currentPriority}
            onNextStep={() => router.push('/whatif')}
            onViewAll={() => router.push('/(tabs)/goals')}
          />
        </View>

        {/* Payday Deploy CTA */}
        <View style={styles.section}>
          <Button
            title="💰 Deploy Paycheck"
            onPress={() => router.push('/payday')}
            variant="primary"
            fullWidth
            size="lg"
          />
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <QuickActions
            onEOD={() => router.push('/eod')}
            onWhatIf={() => router.push('/whatif')}
            onAddAccount={() => router.push('/accounts/add')}
            onAICoach={() => router.push('/(tabs)/coach')}
          />
        </View>

        {/* EOD status */}
        {todaySubmission && (
          <View style={styles.eodDone}>
            <Text style={styles.eodDoneText}>✓ Check-in done today</Text>
          </View>
        )}

        {/* Interest Bleed Ticker */}
        <View style={styles.tickerSection}>
          <InterestBleedTicker
            dailyInterest={safeDailyInterest}
            onPress={() => router.push('/interest-bleed')}
          />
        </View>
      </ScrollView>

      {/* Milestone celebration modal */}
      <CelebrationModal
        milestone={pendingCelebration}
        onDismiss={dismissCelebration}
      />
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  scroll: { flex: 1 },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxxl },
  header: { marginBottom: Spacing.xl },
  greeting: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleLarge, color: Colors.frostWhite },
  date: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, marginTop: 2 },
  heroSection: { alignItems: 'center', paddingVertical: Spacing.xl, marginBottom: Spacing.base },
  netWorthLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray, letterSpacing: 2, marginBottom: Spacing.sm },
  heroNumber: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.heroNumber, color: Colors.accentGold, textAlign: 'center' },
  changeText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodyMedium, marginTop: Spacing.sm },
  section: { marginBottom: Spacing.base },
  eodDone: { alignItems: 'center', paddingVertical: Spacing.sm },
  eodDoneText: { fontFamily: 'Inter_500Medium', fontSize: Typography.bodySmall, color: Colors.profitGreen },
  tickerSection: { marginTop: Spacing.base, paddingBottom: Spacing.base },
});
