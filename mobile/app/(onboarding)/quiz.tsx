// Lean onboarding quiz — Stage-1 fix.
//
// Stage-0 shipped a 3-question flow that:
//   - sent income-bucket strings ('under_50k', etc.) that didn't match the
//     backend switch — every user got default 75 000/yr.
//   - hard-coded `risk_tolerance: 'Moderate'` and `investment_horizon:
//     '3-5 years'` in the submit handler — UI never asked.
//   - skipped without calling submitQuiz, leaving the user with no
//     FinancialProfile row.
//
// Stage-1 captures monthly take-home directly (backend already grosses up
// from take-home/0.75), adds explicit risk + horizon screens, and routes
// the skip path through submitQuiz with `SKIP_DEFAULTS` so every user has
// a profile row from minute one. The wire payload is pinned to
// `SubmitQuizAnswers` — see `mobile/src/types/onboarding.ts`.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { onboardingApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { scheduleFutureSelfDelivery } from '../../src/services/notifications';
import { notificationsApi } from '../../src/services/api';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { errorMessage } from '../../src/lib/errorMessage';
import { FirstWinCelebration } from '../../src/components/onboarding/FirstWinCelebration';
import { track } from '../../src/lib/analytics';
import type {
  FinancialGoalWire,
  IncomeRangeWire,
  InvestmentHorizonWire,
  RiskToleranceWire,
  SubmitQuizAnswers,
} from '../../src/types/onboarding';
import { SKIP_DEFAULTS } from '../../src/types/onboarding';

// ---------------------------------------------------------------------------
// Q1 — Primary financial goal
// ---------------------------------------------------------------------------
const GOAL_OPTIONS: {
  id: 'debt' | 'save' | 'invest';
  label: string;
  subtitle: string;
  primaryGoal: FinancialGoalWire;
}[] = [
  { id: 'debt',   label: 'Pay Off Debt', subtitle: 'Out of debt by year three.',          primaryGoal: 'debt payoff' },
  { id: 'save',   label: 'Save More',    subtitle: 'Build a cushion and emergency fund.', primaryGoal: 'save more' },
  { id: 'invest', label: 'Build Wealth', subtitle: 'Invest and grow long-term.',          primaryGoal: 'build wealth' },
];

// ---------------------------------------------------------------------------
// Q2 — Risk tolerance (Stage-1: previously hard-coded to 'Moderate')
// ---------------------------------------------------------------------------
const RISK_OPTIONS: { id: RiskToleranceWire; label: string; subtitle: string }[] = [
  { id: 'Conservative', label: 'Conservative', subtitle: 'Protect what I have. Slow and steady.' },
  { id: 'Moderate',     label: 'Moderate',     subtitle: 'Balanced — some growth, some safety.' },
  { id: 'Aggressive',   label: 'Aggressive',   subtitle: 'Long horizon. Comfortable with swings.' },
];

// ---------------------------------------------------------------------------
// Q3 — Investment horizon (Stage-1: previously hard-coded to '3-5 years')
// ---------------------------------------------------------------------------
const HORIZON_OPTIONS: { id: InvestmentHorizonWire; label: string; subtitle: string }[] = [
  { id: 'Less than 1 year', label: 'Under a year',  subtitle: 'Short term. Cash is the goal.' },
  { id: '1-3 years',        label: '1 — 3 years',   subtitle: 'Near-term goal. Down payment, debt payoff.' },
  { id: '3-5 years',        label: '3 — 5 years',   subtitle: 'Medium horizon. Building.' },
  { id: '5+ years',         label: '5 years or more', subtitle: 'Long horizon. Compounding.' },
];

// Quick-pick chips next to the take-home input — derived from the backend's
// IncomeRangeWire buckets so the chip values map cleanly when the user
// declines to type a number.
const INCOME_QUICK_PICKS: { label: string; bucket: IncomeRangeWire; impliedTakeHome: string }[] = [
  { label: 'Under $50k',  bucket: 'Under $50k',   impliedTakeHome: '2200' },
  { label: '$50–100k',    bucket: '$50k-$100k',   impliedTakeHome: '4700' },
  { label: '$100–200k',   bucket: '$100k-$200k',  impliedTakeHome: '9400' },
  { label: '$200k+',      bucket: '$200k+',       impliedTakeHome: '15600' },
];

// Step ordering — five screens, one decision each.
type Step = 'goal' | 'income' | 'risk' | 'horizon' | 'bank' | 'celebration';

// Total visible steps in the dotted progress bar (celebration is not counted).
const TOTAL_STEPS = 5;

export default function QuizScreen() {
  const router = useRouter();
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [step, setStep] = useState<Step>('goal');

  // Track onboarding start once on mount
  React.useEffect(() => { track('onboarding_started'); }, []);

  const [selectedGoal, setSelectedGoal] = useState<(typeof GOAL_OPTIONS)[number] | null>(null);
  const [takeHomeInput, setTakeHomeInput] = useState('');
  const [incomeBucket, setIncomeBucket] = useState<IncomeRangeWire>('$50k-$100k');
  const [risk, setRisk] = useState<RiskToleranceWire | null>(null);
  const [horizon, setHorizon] = useState<InvestmentHorizonWire | null>(null);
  const [bankConnected, setBankConnected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identityTitle, setIdentityTitle] = useState('Money Architect');
  const [showCelebration, setShowCelebration] = useState(false);

  // ── Q1: Goal selection ────────────────────────────────────────────────────
  const handleGoalSelect = (goal: (typeof GOAL_OPTIONS)[number]) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    setSelectedGoal(goal);
    track('onboarding_step_completed', { step: 'goal', goal: goal.id });
    setTimeout(() => setStep('income'), 200);
  };

  // ── Q2: Income (numeric take-home) ────────────────────────────────────────
  const onTakeHomeChange = (raw: string) => {
    // Allow digits + at most one decimal point. Strip everything else so a
    // pasted "$5,200.00" still becomes "5200.00".
    const cleaned = raw.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    const normalised =
      parts.length <= 1 ? cleaned : `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
    setTakeHomeInput(normalised);
  };

  const handleIncomeContinue = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    track('onboarding_step_completed', { step: 'income' });
    setStep('risk');
  };

  const handleIncomeQuickPick = (qp: (typeof INCOME_QUICK_PICKS)[number]) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    setTakeHomeInput(qp.impliedTakeHome);
    setIncomeBucket(qp.bucket);
  };

  // ── Q3: Risk tolerance ────────────────────────────────────────────────────
  const handleRiskSelect = (value: RiskToleranceWire) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    setRisk(value);
    track('onboarding_step_completed', { step: 'risk', risk: value });
    setTimeout(() => setStep('horizon'), 200);
  };

  // ── Q4: Investment horizon ───────────────────────────────────────────────
  const handleHorizonSelect = (value: InvestmentHorizonWire) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    setHorizon(value);
    track('onboarding_step_completed', { step: 'horizon', horizon: value });
    setTimeout(() => setStep('bank'), 200);
  };

  // ── Q5: Bank step ─────────────────────────────────────────────────────────
  const handleConnectBank = () => {
    setBankConnected(true);
    router.push('/accounts/add');
  };

  const handleSkipBank = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    track('onboarding_step_completed', { step: 'bank', connected: false });
    await submitAndCelebrate(false);
  };

  // ── Resolve identity title from goal ─────────────────────────────────────
  function resolveTitle(goal: (typeof GOAL_OPTIONS)[number] | null): string {
    if (!goal) return 'Money Architect';
    const g = goal.primaryGoal.toLowerCase();
    if (g.includes('debt') || g.includes('payoff') || g.includes('pay off')) return 'The Debt Plan';
    if (g.includes('sav')) return 'Future Builder';
    if (g.includes('invest') || g.includes('build') || g.includes('wealth')) return 'Money Architect';
    return 'Money Architect';
  }

  /**
   * Build the typed `SubmitQuizAnswers` payload from current state. Only
   * sends `monthly_take_home` when the user actually entered a number — the
   * backend service prefers it over the bucket string and runs the gross-up
   * math (take_home / 0.75 → monthly_income_gross). When the field is
   * blank, the bucket the user picked (or the `$50k-$100k` default) drives
   * the backend mapper.
   */
  const buildAnswers = (connected: boolean): SubmitQuizAnswers => {
    const takeHomeNum = parseFloat(takeHomeInput);
    const hasTakeHome = Number.isFinite(takeHomeNum) && takeHomeNum > 0;
    return {
      financial_goal: selectedGoal?.primaryGoal ?? 'save more',
      income_range: incomeBucket,
      risk_tolerance: risk ?? 'Moderate',
      investment_horizon: horizon ?? '3-5 years',
      bank_connected: connected ? 'yes' : 'no',
      ...(hasTakeHome ? { monthly_take_home: takeHomeNum.toFixed(2) } : {}),
    };
  };

  // ── Submit to backend + show celebration ─────────────────────────────────
  const submitAndCelebrate = async (connected: boolean) => {
    setIsSubmitting(true);
    setError(null);

    const answers = buildAnswers(connected);

    try {
      await AsyncStorage.setItem('quiz_answers', JSON.stringify(answers));
      await AsyncStorage.setItem('hasOnboarded', 'true');

      // Backend submit (best-effort — never block the celebration). The
      // reconciler in `src/lib/onboardingReconcile.ts` retries on next app
      // open if this throws, so a flaky network does not strand the user.
      try {
        await onboardingApi.submitQuiz(answers);
        await refreshUser();
      } catch {
        // Swallow — the local flag is the source of truth for routing,
        // and the reconciler will retry the POST on next open.
      }

      // Schedule future-self letter (idempotent)
      try {
        const createdAt = useAuthStore.getState().user?.created_at;
        const prefs = await notificationsApi.getPreferences().then((r) => r.data).catch(() => null);
        if (createdAt && (!prefs || prefs.future_self_letter_enabled !== false)) {
          await scheduleFutureSelfDelivery(createdAt);
        }
      } catch {
        // best-effort
      }

      const title = resolveTitle(selectedGoal);
      setIdentityTitle(title);

      track('onboarding_completed', {
        goal: selectedGoal?.id,
        bank_connected: connected,
        risk: answers.risk_tolerance,
        horizon: answers.investment_horizon,
        captured_take_home: !!answers.monthly_take_home,
      });

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch { /* ignore */ }

      setShowCelebration(true);
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── After celebration dismiss ────────────────────────────────────────────
  const handleCelebrationDismiss = async () => {
    try {
      await AsyncStorage.setItem('firstWinDone', 'true');
    } catch { /* ignore */ }
    setShowCelebration(false);
    router.replace('/(tabs)');
  };

  /**
   * Skip-all path. Stage-1 fix: previously this only flipped the local
   * `hasOnboarded` flag and walked away — every skip-cohort user ended up
   * without a `FinancialProfile` row and with `monthly_income_gross || 5000`
   * fallbacks for the rest of their session. Now we POST `SKIP_DEFAULTS`
   * (sane backend-mapped values, `skipped: true` flag for analytics) so
   * every user has a profile from minute one, and the reconciler can
   * detect the skip flag to re-prompt.
   */
  const handleSkipAll = async () => {
    track('onboarding_skipped', { at_step: step });
    setIsSubmitting(true);
    try {
      const answers: SubmitQuizAnswers = { ...SKIP_DEFAULTS };
      await AsyncStorage.setItem('quiz_answers', JSON.stringify(answers));
      await AsyncStorage.setItem('hasOnboarded', 'true');
      try {
        await onboardingApi.submitQuiz(answers);
        await refreshUser();
      } catch {
        // best-effort — reconciler will retry on next open
      }
    } catch { /* ignore */ } finally {
      setIsSubmitting(false);
      router.replace('/(tabs)');
    }
  };

  const stepIndex =
    step === 'goal' ? 0 :
    step === 'income' ? 1 :
    step === 'risk' ? 2 :
    step === 'horizon' ? 3 :
    4;

  if (showCelebration) {
    return (
      <FirstWinCelebration
        identityTitle={identityTitle}
        bankConnected={bankConnected}
        onDismiss={handleCelebrationDismiss}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.backgroundDeepNavy }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>A few questions.</Text>
          <Text style={styles.subtitle}>Five questions. Two minutes.</Text>
        </View>

        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i <= stepIndex && styles.dotActive,
                i < stepIndex && styles.dotCompleted,
              ]}
            />
          ))}
        </View>

        {/* Skip-all (defaults everything) is only offered on the final bank
            step. The earlier screens already let users tap-through quickly,
            and skipping mid-quiz strands them with backend defaults that
            don't match the values they were about to submit. */}
        {step === 'bank' && (
          <TouchableOpacity
            style={styles.skipAll}
            onPress={handleSkipAll}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding entirely"
          >
            <Text style={styles.skipAllText}>Skip all — use defaults</Text>
          </TouchableOpacity>
        )}

        {/* ── Q1: Primary goal ─────────────────────────────────────────────── */}
        {step === 'goal' && (
          <View style={styles.questionContainer}>
            <Text style={styles.stepLabel}>STEP 1 OF {TOTAL_STEPS}</Text>
            <Text style={styles.question}>What is your primary financial goal?</Text>
            {GOAL_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.option,
                  selectedGoal?.id === opt.id && styles.selectedOption,
                ]}
                onPress={() => handleGoalSelect(opt)}
                accessibilityRole="radio"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: selectedGoal?.id === opt.id }}
                activeOpacity={0.8}
              >
                <View style={styles.optionIcon}>
                  <Ionicons name="arrow-forward" size={18} color={Colors.slateGray} />
                </View>
                <View style={styles.optionTextGroup}>
                  <Text
                    style={[
                      styles.optionLabel,
                      selectedGoal?.id === opt.id && styles.selectedOptionLabel,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Q2: Monthly take-home (numeric, with quick-pick fallback) ───── */}
        {step === 'income' && (
          <View style={styles.questionContainer}>
            <Text style={styles.stepLabel}>STEP 2 OF {TOTAL_STEPS}</Text>
            <Text style={styles.question}>What's your take-home each month?</Text>
            <Text style={styles.questionHint}>
              After taxes — what hits the account. We'll convert this to your
              annual figure for projections. Never shared.
            </Text>

            <View style={styles.amountInputRow}>
              <Text style={styles.amountInputPrefix}>$</Text>
              <TextInput
                value={takeHomeInput}
                onChangeText={onTakeHomeChange}
                placeholder="5,200"
                placeholderTextColor={Colors.slateGray}
                keyboardType="decimal-pad"
                maxLength={9}
                style={styles.amountInput}
                accessibilityLabel="Monthly take-home pay in dollars"
              />
              <Text style={styles.amountInputSuffix}>/ mo</Text>
            </View>

            <Text style={styles.quickPickLabel}>Or pick a range</Text>
            <View style={styles.quickPickRow}>
              {INCOME_QUICK_PICKS.map((qp) => (
                <TouchableOpacity
                  key={qp.bucket}
                  style={[
                    styles.quickPickChip,
                    incomeBucket === qp.bucket && styles.quickPickChipSelected,
                  ]}
                  onPress={() => handleIncomeQuickPick(qp)}
                  accessibilityRole="button"
                  accessibilityLabel={`Annual income range ${qp.label}`}
                >
                  <Text
                    style={[
                      styles.quickPickText,
                      incomeBucket === qp.bucket && styles.quickPickTextSelected,
                    ]}
                  >
                    {qp.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.continueBtn}
              onPress={handleIncomeContinue}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Continue"
              activeOpacity={0.85}
            >
              <Text style={styles.continueBtnText}>Continue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backLink}
              onPress={() => setStep('goal')}
              accessibilityRole="button"
              accessibilityLabel="Go back to previous question"
            >
              <Ionicons name="chevron-back" size={16} color={Colors.slateGray} />
              <Text style={styles.backLinkText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Q3: Risk tolerance ───────────────────────────────────────────── */}
        {step === 'risk' && (
          <View style={styles.questionContainer}>
            <Text style={styles.stepLabel}>STEP 3 OF {TOTAL_STEPS}</Text>
            <Text style={styles.question}>How do you feel about risk?</Text>
            <Text style={styles.questionHint}>Shapes how aggressive your projections will be.</Text>
            {RISK_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.option, risk === opt.id && styles.selectedOption]}
                onPress={() => handleRiskSelect(opt.id)}
                accessibilityRole="radio"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: risk === opt.id }}
                activeOpacity={0.8}
              >
                <View style={styles.optionTextGroup}>
                  <Text
                    style={[
                      styles.optionLabel,
                      risk === opt.id && styles.selectedOptionLabel,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.backLink}
              onPress={() => setStep('income')}
              accessibilityRole="button"
              accessibilityLabel="Go back to previous question"
            >
              <Ionicons name="chevron-back" size={16} color={Colors.slateGray} />
              <Text style={styles.backLinkText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Q4: Investment horizon ───────────────────────────────────────── */}
        {step === 'horizon' && (
          <View style={styles.questionContainer}>
            <Text style={styles.stepLabel}>STEP 4 OF {TOTAL_STEPS}</Text>
            <Text style={styles.question}>How far out is your goal?</Text>
            <Text style={styles.questionHint}>Sets the timeline for milestones and projections.</Text>
            {HORIZON_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.option, horizon === opt.id && styles.selectedOption]}
                onPress={() => handleHorizonSelect(opt.id)}
                accessibilityRole="radio"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: horizon === opt.id }}
                activeOpacity={0.8}
              >
                <View style={styles.optionTextGroup}>
                  <Text
                    style={[
                      styles.optionLabel,
                      horizon === opt.id && styles.selectedOptionLabel,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.backLink}
              onPress={() => setStep('risk')}
              accessibilityRole="button"
              accessibilityLabel="Go back to previous question"
            >
              <Ionicons name="chevron-back" size={16} color={Colors.slateGray} />
              <Text style={styles.backLinkText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Q5: Add accounts manually ───────────────────────────────────── */}
        {step === 'bank' && (
          <View style={styles.questionContainer}>
            <Text style={styles.stepLabel}>STEP 5 OF {TOTAL_STEPS}</Text>
            <Text style={styles.question}>Add your accounts.</Text>
            <Text style={styles.questionHint}>
              Enter balances by hand for now — read-only bank linking is coming
              soon. You can update them anytime in the Accounts tab.
            </Text>

            <TouchableOpacity
              style={styles.connectButton}
              onPress={handleConnectBank}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add an account manually"
            >
              <Text style={styles.connectButtonText}>Add manually</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipLink}
              onPress={handleSkipBank}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Skip bank connection and explore app"
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.slateGray} size="small" />
              ) : (
                <Text style={styles.skipText}>Skip — I'll explore</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backLink}
              onPress={() => setStep('horizon')}
              accessibilityRole="button"
              accessibilityLabel="Go back to previous question"
            >
              <Ionicons name="chevron-back" size={16} color={Colors.slateGray} />
              <Text style={styles.backLinkText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundDeepNavy,
  },
  inner: {
    padding: Spacing.xl,
    paddingBottom: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    paddingTop: Spacing.section,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.displaySmall,
    color: Colors.frostWhite,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: Spacing.base,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.graphiteBorder,
  },
  dotActive: {
    backgroundColor: Colors.slateGray,
  },
  dotCompleted: {
    backgroundColor: Colors.accentGold,
  },
  skipAll: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  skipAllText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textDecorationLine: 'underline',
  },
  questionContainer: {
    marginBottom: Spacing.xl,
  },
  stepLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.microLabel,
    color: Colors.accentGold,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  question: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    marginBottom: Spacing.sm,
    lineHeight: 30,
  },
  questionHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    marginBottom: Spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.graphiteBorder,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.cardSurfaceNavy,
    gap: Spacing.md,
  },
  selectedOption: {
    backgroundColor: 'rgba(249,199,79,0.10)',
    borderColor: Colors.accentGold,
  },
  optionIcon: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextGroup: {
    flex: 1,
  },
  optionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  selectedOptionLabel: {
    color: Colors.accentGold,
  },
  optionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    marginTop: 2,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.graphiteBorder,
    backgroundColor: Colors.cardSurfaceNavy,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  amountInputPrefix: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.accentGold,
  },
  amountInput: {
    flex: 1,
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    padding: 0,
  },
  amountInputSuffix: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  quickPickLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  quickPickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  quickPickChip: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    backgroundColor: Colors.cardSurfaceNavy,
  },
  quickPickChipSelected: {
    borderColor: Colors.accentGold,
    backgroundColor: 'rgba(249,199,79,0.10)',
  },
  quickPickText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySmall,
    color: Colors.frostWhite,
  },
  quickPickTextSelected: {
    color: Colors.accentGold,
  },
  continueBtn: {
    backgroundColor: Colors.accentGold,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  continueBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.backgroundDeepNavy,
  },
  connectButton: {
    backgroundColor: Colors.accentGold,
    padding: Spacing.base,
    borderRadius: 0,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  connectButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.backgroundDeepNavy,
  },
  skipLink: {
    alignItems: 'center',
    padding: Spacing.sm,
    marginBottom: Spacing.base,
  },
  skipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    textDecorationLine: 'underline',
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: Spacing.sm,
  },
  backLinkText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  error: {
    fontFamily: 'Inter_400Regular',
    color: Colors.debtCrimson,
    textAlign: 'center',
    marginTop: Spacing.sm,
    fontSize: Typography.bodySmall,
  },
});
