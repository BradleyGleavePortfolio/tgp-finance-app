// EOD Check-in form — full-screen modal
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountReview } from '../../src/components/eod/AccountReview';
import { MoodSelector } from '../../src/components/eod/MoodSelector';
import { SubmissionResult } from '../../src/components/eod/SubmissionResult';
import { Button } from '../../src/components/ui/Button';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { useAccountsStore } from '../../src/stores/accountsStore';
import { useEODStore } from '../../src/stores/eodStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useNetWorthStore } from '../../src/stores/networthStore';
import { DAILY_HABITS } from '../../src/utils/constants';
import type { AccountSnapshot } from '../../src/types';

type Step = 'accounts' | 'mood' | 'notes' | 'habits' | 'result';

export default function EODScreen() {
  const router = useRouter();
  const { accounts } = useAccountsStore();
  const { submitToday: submitEOD, isLoading: isSubmitting } = useEODStore();
  const { profile } = useAuthStore();
  const { currentNetWorth, previousNetWorth } = useNetWorthStore();

  const [step, setStep] = useState<Step>('accounts');
  const [accountIndex, setAccountIndex] = useState(0);
  const [snapshots, setSnapshots] = useState<AccountSnapshot[]>([]);
  const [balanceInputs, setBalanceInputs] = useState<Record<string, string>>({});
  const [mood, setMood] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [habits, setHabits] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<any>(null);

  const activeAccounts = accounts.filter(a => a.is_active);
  const totalAccounts = activeAccounts.length;

  // Initialize balance inputs from last known balances
  useEffect(() => {
    const init: Record<string, string> = {};
    activeAccounts.forEach(a => { init[a.id] = String(a.balance); });
    setBalanceInputs(init);
  }, [accounts.length]);

  const currentAccount = activeAccounts[accountIndex];
  const accountProgress = totalAccounts > 0 ? (accountIndex / totalAccounts) * 100 : 0;

  const goNextAccount = () => {
    if (currentAccount) {
      const balance = parseFloat(balanceInputs[currentAccount.id] || String(currentAccount.balance)) || 0;
      const existing = snapshots.find(s => s.account_id === currentAccount.id);
      if (existing) {
        existing.balance = balance;
      } else {
        setSnapshots([...snapshots, { account_id: currentAccount.id, balance }]);
      }
    }
    if (accountIndex < totalAccounts - 1) {
      setAccountIndex(accountIndex + 1);
    } else {
      setStep('mood');
    }
  };

  const handleSubmit = async () => {
    try {
      const submission = await submitEOD({
        submission_date: new Date().toISOString().slice(0, 10),
        account_snapshots: snapshots,
        mood,
        notes: notes || undefined,
        habits_checked: DAILY_HABITS.filter(h => habits[h.key]).map(h => h.key),
      });
      setResult(submission);
      setStep('result');
    } catch {
      // Error handled in store
    }
  };

  if (step === 'result') {
    return (
      <SubmissionResult
        newNetWorth={result?.net_worth_computed ?? currentNetWorth ?? 0}
        previousNetWorth={previousNetWorth || 0}
        streak={result?.streak_days ?? profile?.streak_days ?? 0}
        aiInsight={result?.ai_insight}
        onDismiss={() => router.back()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Daily Check-in</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Progress */}
        {step === 'accounts' && (
          <View style={styles.progressSection}>
            <Text style={styles.progressLabel}>{accountIndex + 1} of {totalAccounts} accounts</Text>
            <ProgressBar progress={accountProgress} height={3} variant="gold" />
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Accounts step */}
          {step === 'accounts' && currentAccount && (
            <View>
              <AccountReview
                account={currentAccount}
                value={balanceInputs[currentAccount.id] || ''}
                onChange={(v) => setBalanceInputs({ ...balanceInputs, [currentAccount.id]: v })}
              />
              <Button
                title={accountIndex < totalAccounts - 1 ? 'Next Account →' : 'Continue →'}
                onPress={goNextAccount}
                variant="primary"
                fullWidth
                size="lg"
              />
              <TouchableOpacity onPress={() => setStep('mood')} style={styles.skipRow}>
                <Text style={styles.skipText}>Skip to mood check →</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'accounts' && totalAccounts === 0 && (
            <View style={styles.noAccounts}>
              <Text style={styles.noAccountsText}>No accounts to review. Add accounts first.</Text>
              <Button title="Continue →" onPress={() => setStep('mood')} variant="primary" />
            </View>
          )}

          {/* Mood step */}
          {step === 'mood' && (
            <View>
              <Text style={styles.stepTitle}>Quick Mood Check</Text>
              <MoodSelector value={mood} onChange={setMood} />
              <Button title="Continue →" onPress={() => setStep('notes')} variant="primary" fullWidth size="lg" style={styles.stepBtn} />
              <TouchableOpacity onPress={() => setStep('notes')} style={styles.skipRow}>
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Notes step */}
          {step === 'notes' && (
            <View>
              <Text style={styles.stepTitle}>Anything important today?</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Any big expenses, income, or important financial events today..."
                placeholderTextColor={Colors.slateGray}
                style={styles.notesInput}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
              <Button title="Continue →" onPress={() => setStep('habits')} variant="primary" fullWidth size="lg" style={styles.stepBtn} />
            </View>
          )}

          {/* Habits step */}
          {step === 'habits' && (
            <View>
              <Text style={styles.stepTitle}>Daily Habits</Text>
              <Text style={styles.stepDesc}>Check off what you did today:</Text>
              {DAILY_HABITS.map((habit) => (
                <TouchableOpacity
                  key={habit.key}
                  style={[styles.habitRow, habits[habit.key] && styles.habitDone]}
                  onPress={() => setHabits({ ...habits, [habit.key]: !habits[habit.key] })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.habitCheck}>{habits[habit.key] ? '☑' : '☐'}</Text>
                  <Text style={[styles.habitLabel, habits[habit.key] && styles.habitLabelDone]}>
                    {habit.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <Button
                title="Submit Check-in"
                onPress={handleSubmit}
                loading={isSubmitting}
                variant="primary"
                fullWidth
                size="lg"
                style={styles.stepBtn}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  closeBtn: { fontFamily: 'Inter_400Regular', fontSize: Typography.titleSmall, color: Colors.slateGray, width: 28, textAlign: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  progressSection: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, gap: Spacing.xs },
  progressLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, textAlign: 'right' },
  content: { padding: Spacing.base, paddingBottom: Spacing.section },
  stepTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleSmall, color: Colors.frostWhite, marginBottom: Spacing.xl },
  stepDesc: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, marginBottom: Spacing.base },
  stepBtn: { marginTop: Spacing.xl },
  skipRow: { alignItems: 'center', paddingVertical: Spacing.md },
  skipText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  notesInput: { backgroundColor: Colors.cardSurfaceNavy, borderRadius: 10, borderWidth: 1, borderColor: Colors.graphiteBorder, padding: Spacing.base, fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite, minHeight: 100, textAlignVertical: 'top' },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: 10, borderWidth: 1, borderColor: Colors.graphiteBorder, marginBottom: Spacing.sm, backgroundColor: Colors.cardSurfaceNavy },
  habitDone: { borderColor: Colors.profitGreen, backgroundColor: 'rgba(6,214,160,0.05)' },
  habitCheck: { fontSize: 20, color: Colors.profitGreen },
  habitLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, flex: 1 },
  habitLabelDone: { color: Colors.frostWhite },
  noAccounts: { alignItems: 'center', padding: Spacing.xl, gap: Spacing.base },
  noAccountsText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, textAlign: 'center' },
});
