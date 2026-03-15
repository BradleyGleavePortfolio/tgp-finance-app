// Single account balance input for EOD roll call
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NumberInput } from '../ui/NumberInput';
import { Card } from '../ui/Card';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { formatCurrency } from '../../utils/formatters';
import type { FinancialAccount } from '../../types';

interface AccountReviewProps {
  account: FinancialAccount;
  value: string;
  onChange: (value: string, numeric: number) => void;
}

export function AccountReview({ account, value, onChange }: AccountReviewProps) {
  const isDebt = account.is_debt;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.accountType, { color: isDebt ? Colors.debtCrimson : Colors.profitGreen }]}>
          {isDebt ? 'DEBT' : 'ASSET'}
        </Text>
        <Text style={styles.institution}>{account.institution || 'Account'}</Text>
      </View>

      <Text style={styles.accountName}>{account.name}</Text>

      <Text style={styles.lastKnown}>
        Last known: <Text style={styles.lastKnownValue}>{formatCurrency(account.balance)}</Text>
      </Text>

      <NumberInput
        label={isDebt ? "Current balance (what you owe)" : "Current balance"}
        value={value}
        onChangeValue={onChange}
        placeholder={account.balance.toFixed(2)}
      />

      {isDebt && account.apr_percent && (
        <Text style={styles.aprNote}>
          {account.apr_percent}% APR — costing you{' '}
          <Text style={styles.debtCost}>
            {formatCurrency((account.balance * account.apr_percent / 100) / 365, { decimals: 4 })}/day
          </Text>
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.base,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  accountType: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.microLabel,
    letterSpacing: 1.5,
  },
  institution: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  accountName: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    marginBottom: Spacing.sm,
  },
  lastKnown: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    marginBottom: Spacing.md,
  },
  lastKnownValue: {
    fontFamily: 'JetBrainsMono_400Regular',
    color: Colors.frostWhite,
  },
  aprNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    marginTop: -Spacing.sm,
  },
  debtCost: {
    fontFamily: 'JetBrainsMono_400Regular',
    color: Colors.debtCrimson,
  },
});
