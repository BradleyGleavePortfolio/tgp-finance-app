// Payday Deploy screen — split a paycheck across accounts in one tap
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/finance';
import { useAccountsStore } from '../src/stores/accountsStore';
import { paydayApi } from '../src/services/api';
import { formatCurrency } from '../src/utils/formatters';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Allocation {
  account_id: string;
  amount: string; // user input (string for TextInput)
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function PaydayScreen() {
  const router = useRouter();
  const { accounts, fetchAccounts } = useAccountsStore();

  const [paycheckAmount, setPaycheckAmount] = useState('');
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Build allocation list whenever accounts load
  useEffect(() => {
    const safeAccounts = Array.isArray(accounts) ? accounts.filter(a => a.is_active !== false) : [];
    if (safeAccounts.length > 0 && allocations.length === 0) {
      setAllocations(safeAccounts.map((a) => ({ account_id: a.id, amount: '' })));
    }
  }, [accounts]);

  const safeAccounts = Array.isArray(accounts) ? accounts.filter(a => a.is_active !== false) : [];

  const parseAmount = (s: string) => {
    const n = parseFloat(s.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const paycheck = parseAmount(paycheckAmount);
  const totalAllocated = allocations.reduce((s, a) => s + parseAmount(a.amount), 0);
  const remaining = Math.max(0, paycheck - totalAllocated);
  const isOverAllocated = paycheck > 0 && totalAllocated > paycheck + 0.001;

  const handleAllocationChange = (accountId: string, value: string) => {
    setAllocations((prev) =>
      prev.map((a) => (a.account_id === accountId ? { ...a, amount: value } : a))
    );
  };

  const handleDeploy = async () => {
    if (paycheck <= 0) {
      Alert.alert('Enter paycheck amount', 'Please enter the amount of your paycheck.');
      return;
    }
    if (totalAllocated <= 0) {
      Alert.alert('No allocations', 'Please allocate at least one account an amount.');
      return;
    }
    if (isOverAllocated) {
      Alert.alert(
        'Over-allocated',
        `You've allocated ${formatCurrency(totalAllocated)} but your paycheck is only ${formatCurrency(paycheck)}. Reduce your allocations.`
      );
      return;
    }

    const activeAllocations = allocations
      .filter((a) => parseAmount(a.amount) > 0)
      .map((a) => ({ account_id: a.account_id, amount: parseAmount(a.amount) }));

    setDeploying(true);
    try {
      const { data } = await paydayApi.deploy(paycheck, activeAllocations);
      setReceipt(data);
    } catch (err: any) {
      Alert.alert('Deploy Failed', err?.message || 'Failed to deploy paycheck. Please try again.');
    } finally {
      setDeploying(false);
    }
  };

  const handleReset = () => {
    setReceipt(null);
    setPaycheckAmount('');
    setAllocations(safeAccounts.map((a) => ({ account_id: a.id, amount: '' })));
    fetchAccounts();
  };

  // ── Receipt view ──────────────────────────────────────────────────────────
  if (receipt) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Deployed!</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Card style={styles.receiptCard}>
            <Text style={styles.receiptTitle}>Paycheck Deployed ✓</Text>
            <Text style={styles.receiptDate}>{new Date(receipt.deployed_at).toLocaleDateString()}</Text>

            <View style={styles.receiptSummary}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Paycheck</Text>
                <Text style={styles.receiptValue}>{formatCurrency(receipt.paycheck_amount)}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Deployed</Text>
                <Text style={[styles.receiptValue, { color: Colors.profitGreen }]}>
                  {formatCurrency(receipt.total_allocated)}
                </Text>
              </View>
              {receipt.unallocated_remainder > 0 && (
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Unallocated</Text>
                  <Text style={[styles.receiptValue, { color: Colors.amberWarning }]}>
                    {formatCurrency(receipt.unallocated_remainder)}
                  </Text>
                </View>
              )}
            </View>
          </Card>

          <Text style={styles.sectionTitle}>Allocation Breakdown</Text>
          {(receipt.receipt || []).map((item: any, i: number) => (
            <Card key={i} style={styles.allocationCard}>
              <View style={styles.allocationRow}>
                <View style={styles.allocationLeft}>
                  <Text style={styles.allocationName}>{item.account_name}</Text>
                  <Text style={styles.allocationEffect}>
                    {item.effect === 'debt_payment' ? 'Debt payment' : 'Deposit'}
                  </Text>
                </View>
                <View style={styles.allocationRight}>
                  <Text style={styles.allocationAmount}>−{formatCurrency(item.amount)}</Text>
                  <Text style={styles.allocationBalance}>
                    {formatCurrency(item.balance_before)} → {formatCurrency(item.balance_after)}
                  </Text>
                </View>
              </View>
            </Card>
          ))}

          <Button
            title="Deploy Another Paycheck"
            onPress={handleReset}
            variant="secondary"
            fullWidth
            size="lg"
            style={{ marginTop: Spacing.xl }}
          />
          <Button
            title="Return to Command Center"
            onPress={() => router.replace('/(tabs)')}
            variant="primary"
            fullWidth
            size="lg"
            style={{ marginTop: Spacing.sm }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Deploy form ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payday Deploy</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Paycheck amount input */}
        <Card style={styles.paycheckCard}>
          <Text style={styles.inputLabel}>Paycheck Amount</Text>
          <TextInput
            value={paycheckAmount}
            onChangeText={setPaycheckAmount}
            placeholder="0.00"
            placeholderTextColor={Colors.slateGray}
            style={styles.paycheckInput}
            keyboardType="decimal-pad"
            accessibilityLabel="Paycheck amount"
          />
          {paycheck > 0 && (
            <View style={styles.remainingRow}>
              <Text style={styles.remainingLabel}>Remaining to allocate</Text>
              <Text style={[styles.remainingValue, isOverAllocated && { color: Colors.debtCrimson }]}>
                {isOverAllocated ? `−${formatCurrency(totalAllocated - paycheck)}` : formatCurrency(remaining)}
              </Text>
            </View>
          )}
        </Card>

        {/* Account allocation inputs */}
        <Text style={styles.sectionTitle}>Allocate to Accounts</Text>
        {safeAccounts.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No accounts found. Add accounts first from the Accounts tab.
            </Text>
          </Card>
        ) : (
          safeAccounts.map((account) => {
            const alloc = allocations.find((a) => a.account_id === account.id);
            const amount = alloc ? parseAmount(alloc.amount) : 0;
            const isDebt = account.is_debt;

            return (
              <Card key={account.id} style={styles.accountCard}>
                <View style={styles.accountRow}>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountMeta}>
                      {isDebt ? 'Debt' : 'Asset'} · Balance: {formatCurrency(Number(account.balance))}
                    </Text>
                    {isDebt && amount > 0 && (
                      <Text style={styles.accountEffect}>
                        → Balance after: {formatCurrency(Math.max(0, Number(account.balance) - amount))}
                      </Text>
                    )}
                    {!isDebt && amount > 0 && (
                      <Text style={styles.accountEffect}>
                        → Balance after: {formatCurrency(Number(account.balance) + amount)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.accountInputWrapper}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                      value={alloc?.amount || ''}
                      onChangeText={(v) => handleAllocationChange(account.id, v)}
                      placeholder="0.00"
                      placeholderTextColor={Colors.slateGray}
                      style={styles.accountInput}
                      keyboardType="decimal-pad"
                      accessibilityLabel={`Allocation for ${account.name}`}
                    />
                  </View>
                </View>
              </Card>
            );
          })
        )}

        {/* Deploy button */}
        <View style={styles.deploySection}>
          {paycheck > 0 && totalAllocated > 0 && (
            <Card style={styles.summaryCard}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Paycheck</Text>
                <Text style={styles.receiptValue}>{formatCurrency(paycheck)}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Allocated</Text>
                <Text style={[styles.receiptValue, isOverAllocated && { color: Colors.debtCrimson }]}>
                  {formatCurrency(totalAllocated)}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Remaining</Text>
                <Text style={[styles.receiptValue, { color: remaining > 0 ? Colors.amberWarning : Colors.profitGreen }]}>
                  {formatCurrency(remaining)}
                </Text>
              </View>
            </Card>
          )}

          <Button
            title={deploying ? 'Deploying...' : 'Deploy Paycheck'}
            onPress={handleDeploy}
            loading={deploying}
            variant="primary"
            fullWidth
            size="lg"
            accessibilityLabel="Deploy paycheck with current allocations"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  content: { padding: Spacing.base, paddingBottom: 120 },
  paycheckCard: { padding: Spacing.base, marginBottom: Spacing.xl, gap: Spacing.md },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray, letterSpacing: 0.5 },
  paycheckInput: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 36, color: Colors.accentGold, borderBottomWidth: 1, borderBottomColor: Colors.graphiteBorder, paddingBottom: Spacing.sm },
  remainingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.sm },
  remainingLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  remainingValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodyMedium, color: Colors.profitGreen },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  emptyCard: { padding: Spacing.xl, alignItems: 'center' },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, textAlign: 'center' },
  accountCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md },
  accountInfo: { flex: 1, gap: 2 },
  accountName: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  accountMeta: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  accountEffect: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.profitGreen },
  accountInputWrapper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currencySymbol: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.slateGray },
  accountInput: { width: 90, fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodyMedium, color: Colors.accentGold, borderWidth: 1, borderColor: Colors.graphiteBorder, borderRadius: BorderRadius.sm, padding: Spacing.sm, textAlign: 'right' },
  deploySection: { marginTop: Spacing.xl, gap: Spacing.md },
  summaryCard: { padding: Spacing.base, gap: Spacing.sm },
  receiptCard: { padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.xl, gap: Spacing.md },
  receiptTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleMedium, color: Colors.profitGreen },
  receiptDate: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  receiptSummary: { width: '100%', gap: Spacing.sm, paddingTop: Spacing.md },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  receiptLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  receiptValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodyMedium, color: Colors.accentGold },
  allocationCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  allocationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  allocationLeft: { flex: 1, gap: 2 },
  allocationName: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  allocationEffect: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  allocationRight: { alignItems: 'flex-end', gap: 2 },
  allocationAmount: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodyMedium, color: Colors.accentGold },
  allocationBalance: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
});
