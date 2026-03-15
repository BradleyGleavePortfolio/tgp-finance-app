// Grouped accounts section (CASH / INVESTMENTS / ASSETS / DEBTS)
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AccountCard } from './AccountCard';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { formatCurrency } from '../../utils/formatters';
import type { FinancialAccount } from '../../types';

type GroupType = 'cash' | 'investments' | 'assets' | 'debts';

interface AccountGroupProps {
  type: GroupType;
  accounts: FinancialAccount[];
  onPressAccount?: (account: FinancialAccount) => void;
}

const GROUP_CONFIG: Record<GroupType, { label: string; color: string }> = {
  cash: { label: 'CASH', color: Colors.profitGreen },
  investments: { label: 'INVESTMENTS', color: Colors.investmentTeal },
  assets: { label: 'ASSETS', color: Colors.accentGold },
  debts: { label: 'DEBTS', color: Colors.debtCrimson },
};

export function AccountGroup({ type, accounts, onPressAccount }: AccountGroupProps) {
  const [expanded, setExpanded] = useState(true);
  if (accounts.length === 0) return null;

  const config = GROUP_CONFIG[type];
  const total = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <View style={styles.group}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={[styles.dot, { backgroundColor: config.color }]} />
        <Text style={[styles.groupLabel, { color: config.color }]}>{config.label}</Text>
        <Text style={[styles.total, { color: config.color }]}>
          {type === 'debts' ? '-' : ''}{formatCurrency(total, { compact: true })}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors.slateGray}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.items}>
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onPress={() => onPressAccount?.(account)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodySmall,
    letterSpacing: 1.5,
    flex: 1,
  },
  total: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.bodyMedium,
  },
  items: {
    gap: Spacing.xs,
  },
});
