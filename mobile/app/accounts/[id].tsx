// Account detail + balance history
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { useAccountsStore } from '../../src/stores/accountsStore';
import { formatCurrency, formatDate, formatAPR } from '../../src/utils/formatters';
import { ACCOUNT_TYPE_LABELS } from '../../src/utils/constants';
import type { AccountBalanceLog } from '../../src/types';

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { accounts, deleteAccount, getAccountHistory } = useAccountsStore();
  const [history, setHistory] = useState<AccountBalanceLog[]>([]);

  const account = accounts.find(a => a.id === id);

  useEffect(() => {
    if (id) {
      getAccountHistory(id, 30).then(setHistory);
    }
  }, [id]);

  if (!account) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.notFound}>Account not found</Text>
      </SafeAreaView>
    );
  }

  const handleDelete = () => {
    Alert.alert('Delete Account', `Are you sure you want to delete "${account.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteAccount(account.id);
        router.back();
      }},
    ]);
  };

  const balanceColor = account.is_debt ? Colors.debtCrimson : Colors.profitGreen;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{account.name}</Text>
        <TouchableOpacity onPress={handleDelete}>
          <Text style={styles.deleteBtn}>Delete</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Balance hero */}
        <Card style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{account.is_debt ? 'AMOUNT OWED' : 'CURRENT BALANCE'}</Text>
          <Text style={[styles.balance, { color: balanceColor }]}>
            {account.is_debt ? '-' : ''}{formatCurrency(account.balance)}
          </Text>
          {account.institution && <Text style={styles.institution}>{account.institution}</Text>}
          <Text style={styles.type}>{ACCOUNT_TYPE_LABELS[account.account_type]}</Text>
          {account.apr_percent && <Text style={styles.apr}>{formatAPR(account.apr_percent)}</Text>}
          {account.minimum_payment && (
            <Text style={styles.minimum}>Min payment: {formatCurrency(account.minimum_payment)}/mo</Text>
          )}
        </Card>

        {/* Balance history */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Balance History (30 days)</Text>
            {history.slice(0, 10).map((log) => {
              const change = log.balance - (account.balance);
              return (
                <View key={log.id} style={styles.historyRow}>
                  <Text style={styles.historyDate}>{formatDate(log.date, 'short')}</Text>
                  <Text style={[styles.historyBalance, { color: balanceColor }]}>
                    {formatCurrency(log.balance)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {account.is_debt && (
          <Button
            title="Run What-If: Pay This Off"
            onPress={() => router.push('/whatif/pay_off_debt_early')}
            variant="outline"
            fullWidth
            style={styles.whatifBtn}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, flex: 1, textAlign: 'center' },
  deleteBtn: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.debtCrimson },
  content: { padding: Spacing.base, paddingBottom: 100 },
  balanceCard: { padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  balanceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray, letterSpacing: 1.5 },
  balance: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.displayLarge },
  institution: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray },
  type: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray },
  apr: { fontFamily: 'JetBrainsMono_400Regular', fontSize: Typography.bodySmall, color: Colors.amberWarning },
  minimum: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  historySection: { marginBottom: Spacing.xl },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.graphiteBorder },
  historyDate: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  historyBalance: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall },
  notFound: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, textAlign: 'center', marginTop: Spacing.section },
  whatifBtn: { marginTop: Spacing.base },
});
