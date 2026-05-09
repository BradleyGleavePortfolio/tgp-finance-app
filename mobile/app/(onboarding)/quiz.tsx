// Lean 3-question onboarding — UX Psychology Report #1: Activation-First Dopamine
// Compresses new-user time-to-first-win to <60 s.
// Original multi-step quiz is preserved; this file routes AROUND it for new users.
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
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

// ---------------------------------------------------------------------------
// Q1 — Primary financial goal
// ---------------------------------------------------------------------------
const GOAL_OPTIONS = [
  {
    id: 'debt',
    label: 'Pay Off Debt',
    subtitle: 'Out of debt by year three.',
    primaryGoal: 'debt payoff',
  },
  {
    id: 'save',
    label: 'Save More',
    subtitle: 'Build a cushion and emergency fund.',
    primaryGoal: 'save more',
  },
  {
    id: 'invest',
    label: 'Build Wealth',
    subtitle: 'Invest and grow long-term.',
    primaryGoal: 'build wealth',
  },
];

// ---------------------------------------------------------------------------
// Q2 — Income range
// ---------------------------------------------------------------------------
const INCOME_OPTIONS = [
  { id: 'under50k', label: 'Under $50k', value: 'under_50k' },
  { id: '50to100k', label: '$50k – $100k', value: '50k_100k' },
  { id: 'over100k', label: '$100k+', value: 'over_100k' },
];

type Step = 'goal' | 'income' | 'bank' | 'celebration';

export default function QuizScreen() {
  const router = useRouter();
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [step, setStep] = useState<Step>('goal');

  // Track onboarding start once on mount
  React.useEffect(() => { track('onboarding_started'); }, []);
  const [selectedGoal, setSelectedGoal] = useState<(typeof GOAL_OPTIONS)[number] | null>(null);
  const [selectedIncome, setSelectedIncome] = useState<string | null>(null);
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
    // Auto-advance after brief pause so the selection registers visually
    setTimeout(() => setStep('income'), 200);
  };

  // ── Q2: Income selection ──────────────────────────────────────────────────
  const handleIncomeSelect = (value: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    setSelectedIncome(value);
    track('onboarding_step_completed', { step: 'income' });
    setTimeout(() => setStep('bank'), 200);
  };

  // ── Q3: Bank step ─────────────────────────────────────────────────────────
  const handleConnectBank = () => {
    // Route into the existing add-account flow; return will re-enter here via deep-link guard
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

  // ── Submit to backend + show celebration ─────────────────────────────────
  const submitAndCelebrate = async (connected: boolean) => {
    setIsSubmitting(true);
    setError(null);

    const answers: Record<string, string> = {
      financial_goal: selectedGoal?.primaryGoal ?? '',
      income_range: selectedIncome ?? '',
      bank_connected: connected ? 'yes' : 'no',
      // Map to existing backend fields so downstream features still work
      risk_tolerance: 'Moderate',
      investment_horizon: '3-5 years',
    };

    try {
      await AsyncStorage.setItem('quiz_answers', JSON.stringify(answers));
      await AsyncStorage.setItem('hasOnboarded', 'true');

      // Backend submit (best-effort — never block the celebration)
      try {
        await onboardingApi.submitQuiz(answers);
        await refreshUser();
      } catch {
        // Keep going — the local flags are the source of truth for routing
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

      // Resolve the identity title based on chosen goal
      const title = resolveTitle(selectedGoal);
      setIdentityTitle(title);

      // Track onboarding completion
      track('onboarding_completed', {
        goal: selectedGoal?.id,
        bank_connected: connected,
      });

      // Celebration!
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
    // Mark first-win done so the celebration never fires again
    try {
      await AsyncStorage.setItem('firstWinDone', 'true');
    } catch { /* ignore */ }
    setShowCelebration(false);
    router.replace('/(tabs)');
  };

  // ── Skip entire onboarding ───────────────────────────────────────────────
  const handleSkipAll = async () => {
    track('onboarding_skipped', { at_step: step });
    try {
      await AsyncStorage.setItem('hasOnboarded', 'true');
      await AsyncStorage.setItem('quiz_answers', JSON.stringify({ skipped: 'true' }));
    } catch { /* ignore */ }
    router.replace('/(tabs)');
  };

  // ── Progress indicator ────────────────────────────────────────────────────
  const stepIndex = step === 'goal' ? 0 : step === 'income' ? 1 : 2;
  const totalSteps = 3;

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
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>A few questions.</Text>
        <Text style={styles.subtitle}>Three questions. Two minutes.</Text>
      </View>

      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {Array.from({ length: totalSteps }).map((_, i) => (
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

      {/* Skip all */}
      <TouchableOpacity
        style={styles.skipAll}
        onPress={handleSkipAll}
        accessibilityRole="button"
        accessibilityLabel="Skip onboarding and explore"
      >
        <Text style={styles.skipAllText}>Skip — I'll explore</Text>
      </TouchableOpacity>

      {/* ── Q1: Primary goal ─────────────────────────────────────────────── */}
      {step === 'goal' && (
        <View style={styles.questionContainer}>
          <Text style={styles.stepLabel}>STEP 1 OF 3</Text>
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

      {/* ── Q2: Income range ─────────────────────────────────────────────── */}
      {step === 'income' && (
        <View style={styles.questionContainer}>
          <Text style={styles.stepLabel}>STEP 2 OF 3</Text>
          <Text style={styles.question}>What's your annual income range?</Text>
          <Text style={styles.questionHint}>Used to personalise your plan — never shared.</Text>
          {INCOME_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.option,
                selectedIncome === opt.value && styles.selectedOption,
              ]}
              onPress={() => handleIncomeSelect(opt.value)}
              accessibilityRole="radio"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: selectedIncome === opt.value }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.optionLabelLarge,
                  selectedIncome === opt.value && styles.selectedOptionLabel,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Back */}
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

      {/* ── Q3: Connect bank ─────────────────────────────────────────────── */}
      {step === 'bank' && (
        <View style={styles.questionContainer}>
          <Text style={styles.stepLabel}>STEP 3 OF 3</Text>
          <Text style={styles.question}>Connect your bank?</Text>
          <Text style={styles.questionHint}>
            Read-only access. The picture follows.
          </Text>

          <TouchableOpacity
            style={styles.connectButton}
            onPress={handleConnectBank}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Connect bank account"
          >
            <Text style={styles.connectButtonText}>Connect</Text>
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

          {/* Back */}
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

      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
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
    borderRadius: 4, // radius.lg
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
  optionLabelLarge: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    textAlign: 'center',
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
  connectButton: {
    backgroundColor: Colors.accentGold,
    padding: Spacing.base,
    borderRadius: 0, // radius.sm — primary CTA button
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
