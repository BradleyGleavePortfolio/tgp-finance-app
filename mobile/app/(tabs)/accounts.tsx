// Accounts screen — tabs: All | Assets | Debts
// UX Psychology Report #3: light haptic on tab switch + add button press
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountGroup } from '../../src/components/accounts/AccountGroup';
import { DebtRace } from '../../src/components/accounts/DebtRace';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { colors } from '../../src/theme/tokens';
import { useAccountsStore } from '../../src/stores/accountsStore';
import { formatCurrency } from '../../src/utils/formatters';
import type { FinancialAccount } from '../../src/types';
import { ScreenErrorBoundary } from '../../src/components/ui/ScreenErrorBoundary';
// UX Psychology Report #2: Trust as Emotion
import { ReadOnlyPill } from '../../src/components/trust/ReadOnlyPill';

type Tab = 'all' | 'assets' | 'debts';

export default function AccountsScreen() {
  const router = useRouter();
  const { accounts, netWorth, totalAssets, totalDebt, dailyInterest, fetchAccounts, isLoading } = useAccountsStore();
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchAccounts(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAccounts();
    setRefreshing(false);
  };

  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const cashAccounts = safeAccounts.filter(a => !a?.is_debt && (a?.account_type === 'checking' || a?.account_type === 'savings'));
  const investmentAccounts = safeAccounts.filter(a => !a?.is_debt && (a?.account_type?.startsWith('investment') || a?.account_type?.startsWith('retirement')));
  const assetAccounts = safeAccounts.filter(a => !a?.is_debt && (a?.account_type === 'real_estate' || a?.account_type === 'vehicle' || a?.account_type === 'other_asset'));
  const debtAccounts = safeAccounts.filter(a => a?.is_debt);

  const handleAccountPress = (account: FinancialAccount) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    router.push(`/accounts/${account.id}`);
  };

  const handleTabSwitch = (tab: Tab) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    setActiveTab(tab);
  };

  const handleAddPress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* ignore */ }
    router.push('/accounts/add');
  };

  return (
    <ScreenErrorBoundary screenName="Accounts" onRetry={onRefresh}>
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Accounts</Text>
        <TouchableOpacity
          onPress={handleAddPress}
          style={styles.addBtn}
          accessibilityRole="button"
          accessibilityLabel="Add account"
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Read-only pill — UX Psychology Report #2 */}
      <ReadOnlyPill screenId="accounts" />

      {/* Tab bar */}
      <View style={styles.tabs}>
        {(['all', 'assets', 'debts'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => handleTabSwitch(tab)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityLabel={`${tab.charAt(0).toUpperCase() + tab.slice(1)} accounts`}
            accessibilityState={{ selected: activeTab === tab }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.stone} />}
      >
        {accounts.length === 0 && !isLoading ? (
          <EmptyState
            eyebrow="ACCOUNTS"
            title="No accounts yet"
            description="Add your checking, savings, investments, and debts to track your net worth."
            actionText="Add first account"
            onAction={() => router.push('/accounts/add')}
          />
        ) : (
          <>
            {/* All tab */}
            {activeTab === 'all' && (
              <>
                <AccountGroup type="cash" accounts={cashAccounts} onPressAccount={handleAccountPress} />
                <AccountGroup type="investments" accounts={investmentAccounts} onPressAccount={handleAccountPress} />
                <AccountGroup type="assets" accounts={assetAccounts} onPressAccount={handleAccountPress} />
                <AccountGroup type="debts" accounts={debtAccounts} onPressAccount={handleAccountPress} />
              </>
            )}

            {/* Assets tab */}
            {activeTab === 'assets' && (
              <>
                <AccountGroup type="cash" accounts={cashAccounts} onPressAccount={handleAccountPress} />
                <AccountGroup type="investments" accounts={investmentAccounts} onPressAccount={handleAccountPress} />
                <AccountGroup type="assets" accounts={assetAccounts} onPressAccount={handleAccountPress} />
                {cashAccounts.length === 0 && investmentAccounts.length === 0 && assetAccounts.length === 0 && (
                  <EmptyState eyebrow="ASSETS" title="No assets tracked" description="Add checking, savings, or investment accounts." actionText="Add account" onAction={() => router.push('/accounts/add')} />
                )}
              </>
            )}

            {/* Debts tab */}
            {activeTab === 'debts' && (
              <>
                {debtAccounts.length === 0 ? (
                  <EmptyState eyebrow="DEBTS" title="No debts tracked" description="If you have debt, add it to see your payoff timeline." actionText="Add debt account" onAction={() => router.push('/accounts/add')} />
                ) : (
                  <>
                    {dailyInterest > 0 && (
                      <TouchableOpacity
                        onPress={() => router.push('/interest-bleed')}
                        accessibilityRole="button"
                        accessibilityLabel="Open daily interest detail"
                        style={styles.interestRow}
                      >
                        <Text style={styles.interestLabel}>Daily interest cost</Text>
                        <Text style={styles.interestValue}>
                          {formatCurrency(dailyInterest, { decimals: 2 })}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <View style={{ height: Spacing.md }} />
                    <AccountGroup type="debts" accounts={debtAccounts} onPressAccount={handleAccountPress} />
                    <DebtRace debts={debtAccounts} />
                  </>
                )}
              </>
            )}

            {/* Net Worth summary */}
            <View style={styles.netWorthSummary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Assets</Text>
                <Text style={[styles.summaryValue, { color: Colors.profitGreen }]}>{formatCurrency(totalAssets)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>− Total Debt</Text>
                <Text style={[styles.summaryValue, { color: Colors.debtCrimson }]}>{formatCurrency(totalDebt)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.netWorthRow]}>
                <Text style={styles.netWorthLabel}>= Net Worth</Text>
                <Text style={[styles.netWorthValue, { color: netWorth >= 0 ? Colors.accentGold : Colors.debtCrimson }]}>
                  {formatCurrency(netWorth)}
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.sm },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleLarge, color: Colors.frostWhite },
  addBtn: { backgroundColor: Colors.accentGold, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: 0 }, // radius.sm — primary CTA
  addBtnText: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodySmall, color: Colors.backgroundDeepNavy },
  tabs: { flexDirection: 'row', paddingHorizontal: Spacing.base, gap: Spacing.sm, marginBottom: Spacing.base },
  tab: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.graphiteBorder, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.accentGold, borderColor: Colors.accentGold },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray },
  tabTextActive: { color: Colors.backgroundDeepNavy },
  content: { padding: Spacing.base, paddingBottom: 100 },
  netWorthSummary: { marginTop: Spacing.xl, backgroundColor: Colors.cardSurfaceNavy, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.graphiteBorder, padding: Spacing.base, gap: Spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray },
  summaryValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodyMedium },
  netWorthRow: { paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.graphiteBorder, marginTop: Spacing.sm },
  netWorthLabel: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleSmall, color: Colors.frostWhite },
  netWorthValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.titleSmall },
  interestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.graphiteBorder,
  },
  interestLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  interestValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.bodySmall,
    color: Colors.frostWhite,
  },
});
