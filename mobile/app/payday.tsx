// Payday Deploy flow
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NumberInput } from '../src/components/ui/NumberInput';
import { Button } from '../src/components/ui/Button';
import { Card } from '../src/components/ui/Card';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/finance';
import { useAccountsStore } from '../src/stores/accountsStore';
import { useAuthStore } from '../src/stores/authStore';
import { usePriorityStore } from '../src/stores/priorityStore';
import { formatCurrency } from '../src/utils/formatters';

type FlowStep = 'input' | 'deploy' | 'done';

export default function PaydayScreen() {
  const router = useRouter();
  const { accounts } = useAccountsStore();
  const { profile } = useAuthStore();
  const { currentPriority } = usePriorityStore();

  const [step, setStep] = useState<FlowStep>('input');
  const [paycheckAmount, setPaycheckAmount] = useState('');
  const [confirmedSteps, setConfirmedSteps] = useState<number[]>([]);

  const debtAccounts = accounts.filter(a => a.is_debt && a.balance > 0);
  const totalMinimums = debtAccounts.reduce((s, a) => s + (a.minimum_payment || 0), 0);
  const paycheck = parseFloat(paycheckAmount) || 0;
  const afterMinimums = paycheck - totalMinimums;
  const extraDebt = Math.max(0, afterMinimums * 0.5);
  const savings = Math.max(0, afterMinimums * 0.3);
  const invest = Math.max(0, afterMinimums * 0.2);

  const deploySteps = [
    { label: 'Pay all minimums', amount: totalMinimums, dest: 'All debt accounts', icon: '💳' },
    { label: 'Extra debt payment', amount: extraDebt, dest: currentPriority?.title || 'Priority debt', icon: '⚔️' },
    { label: 'Savings top-up', amount: savings, dest: 'Emergency fund / savings', icon: '🏦' },
    { label: 'Invest the rest', amount: invest, dest: 'Index fund / brokerage', icon: '📈' },
  ];

  if (step === 'done') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.doneScreen}>
          <Text style={styles.doneIcon}>✓</Text>
          <Text style={styles.doneTitle}>Payday Deployed.</Text>
          <Text style={styles.doneSubtitle}>Net worth updated.</Text>
          <Text style={styles.doneSubtitle}>{formatCurrency(paycheck)} deployed in 4 moves.</Text>
          <Button title="Return to Command Center" onPress={() => router.replace('/(tabs)')} variant="primary" style={styles.doneBtn} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payday Deploy</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 'input' && (
          <View>
            <Text style={styles.subtitle}>How much did you receive?</Text>
            <NumberInput
              label="Paycheck Amount"
              value={paycheckAmount}
              onChangeValue={(v) => setPaycheckAmount(v)}
              placeholder="3500"
            />
            <Button
              title="Deploy This Paycheck →"
              onPress={() => setStep('deploy')}
              disabled={!paycheck}
              variant="primary"
              fullWidth
              size="lg"
            />
          </View>
        )}

        {step === 'deploy' && (
          <View>
            <Card style={styles.paycheckSummary}>
              <Text style={styles.paycheckLabel}>Paycheck Received</Text>
              <Text style={styles.paycheckAmount}>{formatCurrency(paycheck)}</Text>
            </Card>

            <Text style={styles.deployTitle}>Here's how to deploy it:</Text>

            {deploySteps.map((deployStep, i) => {
              const isConfirmed = confirmedSteps.includes(i);
              return (
                <Card
                  key={i}
                  variant={isConfirmed ? 'default' : 'gold'}
                  style={[styles.deployCard, isConfirmed && styles.deployCardConfirmed]}
                >
                  <View style={styles.deployCardContent}>
                    <Text style={styles.deployStepIcon}>{deployStep.icon}</Text>
                    <View style={styles.deployCardText}>
                      <Text style={styles.deployLabel}>{deployStep.label}</Text>
                      <Text style={styles.deployDest}>{deployStep.dest}</Text>
                    </View>
                    <Text style={styles.deployAmount}>{formatCurrency(deployStep.amount)}</Text>
                  </View>
                  {!isConfirmed && (
                    <Button
                      title="Confirm ✓"
                      onPress={() => setConfirmedSteps([...confirmedSteps, i])}
                      variant="primary"
                      size="sm"
                      style={styles.confirmBtn}
                    />
                  )}
                  {isConfirmed && <Text style={styles.confirmedText}>✓ Done</Text>}
                </Card>
              );
            })}

            {confirmedSteps.length === deploySteps.length && (
              <Button
                title="All Done — Payday Deployed 🎉"
                onPress={() => setStep('done')}
                variant="primary"
                fullWidth
                size="lg"
                style={styles.finalBtn}
              />
            )}
          </View>
        )}
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
  subtitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.displaySmall, color: Colors.frostWhite, marginBottom: Spacing.xl },
  paycheckSummary: { padding: Spacing.base, alignItems: 'center', marginBottom: Spacing.xl },
  paycheckLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  paycheckAmount: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.heroNumber, color: Colors.accentGold },
  deployTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  deployCard: { padding: Spacing.base, marginBottom: Spacing.md, gap: Spacing.md },
  deployCardConfirmed: { opacity: 0.6 },
  deployCardContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  deployStepIcon: { fontSize: 24 },
  deployCardText: { flex: 1 },
  deployLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  deployDest: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  deployAmount: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.titleSmall, color: Colors.accentGold },
  confirmBtn: { alignSelf: 'flex-end' },
  confirmedText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.profitGreen, textAlign: 'right' },
  finalBtn: { marginTop: Spacing.base },
  doneScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.base },
  doneIcon: { fontSize: 72, color: Colors.profitGreen },
  doneTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.displayMedium, color: Colors.frostWhite },
  doneSubtitle: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray },
  doneBtn: { marginTop: Spacing.xl, width: '100%' },
});
