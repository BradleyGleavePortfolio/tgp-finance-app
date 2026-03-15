// Account list item card
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { formatCurrency, formatAPR } from '../../utils/formatters';
import type { FinancialAccount } from '../../types';
import { ACCOUNT_TYPE_LABELS } from '../../utils/constants';

interface AccountCardProps {
  account: FinancialAccount;
  previousBalance?: number;
  onPress?: () => void;
}

export function AccountCard({ account, previousBalance, onPress }: AccountCardProps) {
  const isDebt = account.is_debt;
  const balanceColor = isDebt ? Colors.debtCrimson : Colors.profitGreen;
  const trend = previousBalance !== undefined
    ? account.balance > previousBalance ? 'up' : account.balance < previousBalance ? 'down' : 'same'
    : 'same';

  const trendColor = isDebt
    ? trend === 'down' ? Colors.profitGreen : trend === 'up' ? Colors.debtCrimson : Colors.slateGray
    : trend === 'up' ? Colors.profitGreen : trend === 'down' ? Colors.debtCrimson : Colors.slateGray;

  const trendIcon = trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'remove';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={styles.card}>
        <View style={styles.left}>
          <Text style={styles.name}>{account.name}</Text>
          {account.institution && (
            <Text style={styles.institution}>{account.institution}</Text>
          )}
          <Text style={styles.type}>{ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}</Text>
        </View>

        <View style={styles.right}>
          <Text style={[styles.balance, { color: balanceColor }]}>
            {isDebt ? '-' : ''}{formatCurrency(account.balance)}
          </Text>
          {account.apr_percent && isDebt && (
            <Text style={styles.apr}>{formatAPR(account.apr_percent)}</Text>
          )}
          <View style={styles.trendRow}>
            <Ionicons name={trendIcon as any} size={12} color={trendColor} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  institution: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  type: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  balance: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.bodyMedium,
  },
  apr: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.amberWarning,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
