// Add account form
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '../../src/components/ui/Input';
import { NumberInput } from '../../src/components/ui/NumberInput';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { useAccountsStore } from '../../src/stores/accountsStore';
import { ACCOUNT_TYPE_LABELS } from '../../src/utils/constants';
import type { AccountType } from '../../src/types';

const ACCOUNT_TYPES: Array<{ type: AccountType; label: string; isDebt: boolean }> = [
  { type: 'checking', label: 'Checking', isDebt: false },
  { type: 'savings', label: 'Savings', isDebt: false },
  { type: 'investment_brokerage', label: 'Brokerage', isDebt: false },
  { type: 'retirement_401k', label: '401(k)', isDebt: false },
  { type: 'retirement_ira', label: 'IRA', isDebt: false },
  { type: 'real_estate', label: 'Real Estate', isDebt: false },
  { type: 'vehicle', label: 'Vehicle', isDebt: false },
  { type: 'credit_card', label: 'Credit Card', isDebt: true },
  { type: 'personal_loan', label: 'Personal Loan', isDebt: true },
  { type: 'student_loan', label: 'Student Loan', isDebt: true },
  { type: 'auto_loan', label: 'Auto Loan', isDebt: true },
  { type: 'mortgage', label: 'Mortgage', isDebt: true },
];

export default function AddAccountScreen() {
  const router = useRouter();
  const { addAccount, isLoading } = useAccountsStore();

  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('checking');
  const [balance, setBalance] = useState('');
  const [apr, setApr] = useState('');
  const [minPayment, setMinPayment] = useState('');

  const isDebt = ACCOUNT_TYPES.find(t => t.type === accountType)?.isDebt || false;

  const handleAdd = async () => {
    if (!name || !balance) return;
    try {
      await addAccount({
        name,
        institution: institution || undefined,
        account_type: accountType,
        balance: parseFloat(balance) || 0,
        is_debt: isDebt,
        apr_percent: apr ? parseFloat(apr) : undefined,
        minimum_payment: minPayment ? parseFloat(minPayment) : undefined,
        currency: 'USD',
        is_active: true,
      });
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to add account. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Account</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Input label="Account Name" value={name} onChangeText={setName} placeholder="e.g., Chase Checking" leftIcon="card-outline" />
          <Input label="Institution (optional)" value={institution} onChangeText={setInstitution} placeholder="e.g., Chase Bank" leftIcon="business-outline" />

          {/* Account type selector */}
          <Text style={styles.typeLabel}>ACCOUNT TYPE</Text>
          <View style={styles.typeGrid}>
            {ACCOUNT_TYPES.map((t) => (
              <TouchableOpacity
                key={t.type}
                style={[styles.typeCard, accountType === t.type && styles.typeCardSelected, t.isDebt && styles.typeCardDebt, accountType === t.type && t.isDebt && styles.typeCardDebtSelected]}
                onPress={() => setAccountType(t.type)}
                activeOpacity={0.8}
              >
                <Text style={[styles.typeText, accountType === t.type && styles.typeTextSelected]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <NumberInput label={isDebt ? 'Current Balance (what you owe)' : 'Current Balance'} value={balance} onChangeValue={(v) => setBalance(v)} placeholder="1000" />

          {isDebt && (
            <>
              <NumberInput label="APR %" value={apr} onChangeValue={(v) => setApr(v)} prefix="" suffix="%" placeholder="24.99" />
              <NumberInput label="Minimum Monthly Payment" value={minPayment} onChangeValue={(v) => setMinPayment(v)} placeholder="25" />
            </>
          )}

          <Button title="Add Account" onPress={handleAdd} loading={isLoading} disabled={!name || !balance} variant="primary" fullWidth size="lg" style={styles.btn} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  content: { padding: Spacing.base, paddingBottom: 100 },
  typeLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: Spacing.sm },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  typeCard: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.graphiteBorder, backgroundColor: Colors.cardSurfaceNavy },
  typeCardSelected: { borderColor: Colors.accentGold, backgroundColor: 'rgba(249,199,79,0.1)' },
  typeCardDebt: { borderColor: Colors.debtCrimson },
  typeCardDebtSelected: { backgroundColor: 'rgba(230,57,70,0.1)' },
  typeText: { fontFamily: 'Inter_500Medium', fontSize: Typography.bodySmall, color: Colors.slateGray },
  typeTextSelected: { color: Colors.frostWhite },
  btn: { marginTop: Spacing.base },
});
