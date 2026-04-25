// Home — Command Center screen — BULLETPROOF
// UX Psychology Report #1: One Dominant Home Action
import React, { useEffect, useMemo } from 'react';
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
import { HeroAction, HeroStatus } from '../../src/components/home/HeroAction';
import { CelebrationModal } from '../../src/components/milestones/CelebrationModal';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { ScreenErrorBoundary } from '../../src/components/ui/ScreenErrorBoundary';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
import { useAccountsStore } from '../../src/stores/accountsStore';
import { useNetWorthStore } from '../../src/stores/networthStore';
import { usePriorityStore } from '../../src/stores/priorityStore';
import { useMilestonesStore } from '../../src/stores/milestonesStore';
import { useEODStore } from '../../src/stores/eodStore';
import { NetWorthChart } from '../../src/components/charts/NetWorthChart';
import { formatChange, formatCurrency, getGreeting } from '../../src/utils/formatters';
import { computeDTI } from '../../src/utils/financial';

// ---------------------------------------------------------------------------
// Hero status computation
// Priority: needs_attention > on_track > no_goals
// ---------------------------------------------------------------------------
function computeHeroStatus(params: {
  isLoading: boolean;
  hasAccounts: boolean;
  hasPriority: boolean;
  cashFlow: number;
  currentPriorityComplete: boolean;
  currentPriorityProgress: number;
}): HeroStatus {
  const {
    isLoading,
    hasAccounts,
    hasPriority,
    cashFlow,
    currentPriorityComplete,
    currentPriorityProgress,
  } = params;

  if (isLoading) return 'loading';

  // No accounts yet → treat as no goals
  if (!hasAccounts) return 'no_goals';

  // If no priority is set, direct to goal creation
  if (!hasPriority) return 'no_goals';

  // Priority completed or negative cash flow → needs attention
  if (currentPriorityComplete) return 'needs_attention';
  if (cashFlow < 0) return 'needs_attention';

  // Priority stalled (<5% progress) → needs attention
  if (currentPriorityProgress < 5) return 'needs_attention';

  // Everything looks healthy
  return 'on_track';
}

// ---------------------------------------------------------------------------
// Week stat string: "$X spent · $Y left in budget"
// Derived from cash flow (proxy for weekly budget status)
// ---------------------------------------------------------------------------
function buildWeekStat(params: {
  cashFlow: number;
  monthlyIncome: number;
  totalDebt: number;
}): string {
  const { cashFlow, monthlyIncome, totalDebt } = params;

  if (monthlyIncome <= 0) return '';

  // Approximate weekly budget = monthly income / 4
  const weeklyBudget = monthlyIncome / 4;
  // Weekly debt obligations
  const weeklyDebtLoad = totalDebt / 4;
  // Weekly spend estimate = debt load (minimum payments as proxy)
  const weeklySpent = Math.max(0, weeklyDebtLoad);
  const weeklyLeft = Math.max(0, weeklyBudget - weeklySpent);

  if (weeklySpent <= 0 && weeklyLeft <= 0) return '';

  const spentStr = formatCurrency(weeklySpent, { decimals: 0 });
  const leftStr = formatCurrency(weeklyLeft, { decimals: 0 });
  return `${spentStr} spent · ${leftStr} left this week`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile } = useAuthStore();
  const { accounts, netWorth, totalDebt, dailyInterest, fetchAccounts, isLoading } = useAccountsStore();
  const { history: nwHistory, currentNetWorth, previousNetWorth, fetchHistory, fetchCurrent: fetchCurrentNetWorth } = useNetWorthStore();
  const { currentPriority, fetchCurrent } = usePriorityStore();
  const { pendingCelebration, dismissCelebration } = useMilestonesStore();
  const { todaySubmission, fetchToday } = useEODStore();

  useEffect(() => {
    fetchAccounts();
    fetchHistory();
    // fetchCurrentNetWorth calls GET /api/networth/current for the server-authoritative
    // net worth snapshot; falls back to client-side history value if offline.
    fetchCurrentNetWorth();
    fetchCurrent();
    fetchToday();
  }, []);

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAccounts(), fetchHistory(), fetchCurrentNetWorth(), fetchCurrent(), fetchToday()]);
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

  // ---------------------------------------------------------------------------
  // Hero status + week stat (memoised — pure computation)
  // ---------------------------------------------------------------------------
  const heroStatus = useMemo<HeroStatus>(() => computeHeroStatus({
    isLoading: isLoading && safeAccounts.length === 0,
    hasAccounts: safeAccounts.length > 0,
    hasPriority: !!currentPriority,
    cashFlow,
    currentPriorityComplete: currentPriority?.isComplete ?? false,
    currentPriorityProgress: currentPriority?.progressPercent ?? 0,
  }), [isLoading, safeAccounts.length, currentPriority, cashFlow]);

  const weekStat = useMemo(() => buildWeekStat({
    cashFlow,
    monthlyIncome,
    totalDebt: monthlyDebts,
  }), [cashFlow, monthlyIncome, monthlyDebts]);

  // Hero CTA navigation — each status routes to the most impactful destination
  const onHeroPress = () => {
    if (heroStatus === 'no_goals') {
      // No goals → start goal creation (onboarding quiz / goals tab)
      router.push('/(tabs)/goals');
    } else if (heroStatus === 'needs_attention') {
      // Needs attention → surface the flagged priority / what-if scenario
      router.push('/whatif');
    } else {
      // On track → review goals & insights
      router.push('/(tabs)/goals');
    }
  };

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

        {/* ═══════════════════════════════════════════════════════════════════
            DOMINANT HERO ACTION — UX Psych Report #1
            One big, unmissable call-to-action surfaces above everything else.
            All secondary content is demoted below the fold.
        ════════════════════════════════════════════════════════════════════ */}
        <HeroAction
          status={heroStatus}
          weekStat={weekStat}
          onPress={onHeroPress}
        />

        {/* ═══════════════════════════════════════════════════════════════
            SECONDARY SECTIONS — demoted, still fully accessible
        ════════════════════════════════════════════════════════════════ */}

        {/* Section divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>YOUR OVERVIEW</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Net Worth (compact — numbers still readable, but not the hero) */}
        <View style={styles.secondaryHero}>
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
            <NetWorthChart history={nwHistory} height={160} showIndicator />
          </View>
        )}

        {/* Financial Vital Signs */}
        <View style={styles.section}>
          <VitalSigns
            netWorth={displayNetWorth}
            cashFlow={cashFlow}
            dti={dti}
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
  header: { marginBottom: Spacing.base },
  greeting: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleLarge, color: Colors.frostWhite },
  date: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, marginTop: 2 },

  // Divider between hero and secondary sections
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.graphiteBorder,
  },
  dividerLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    letterSpacing: 1.5,
  },

  // Secondary (demoted) net worth display — smaller than the original hero
  secondaryHero: {
    alignItems: 'center',
    paddingVertical: Spacing.base,
    marginBottom: Spacing.base,
  },
  netWorthLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  // Demoted: was Typography.heroNumber (48), now displaySmall (24)
  heroNumber: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.displaySmall,
    color: Colors.accentGold,
    textAlign: 'center',
  },
  changeText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.bodySmall,
    marginTop: Spacing.xs,
  },

  section: { marginBottom: Spacing.base },
  eodDone: { alignItems: 'center', paddingVertical: Spacing.sm },
  eodDoneText: { fontFamily: 'Inter_500Medium', fontSize: Typography.bodySmall, color: Colors.profitGreen },
  tickerSection: { marginTop: Spacing.base, paddingBottom: Spacing.base },
});
