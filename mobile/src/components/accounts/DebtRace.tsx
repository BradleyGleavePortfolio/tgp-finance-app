// Avalanche vs Snowball debt race visualization
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { formatCurrency, formatMonths } from '../../utils/formatters';
import { debtPayoffProjection } from '../../utils/financial';
import type { FinancialAccount } from '../../types';

interface DebtRaceProps {
  debts: FinancialAccount[];
  extraPayment?: number;
  onMethodSelect?: (method: 'avalanche' | 'snowball') => void;
}

export function DebtRace({ debts, extraPayment = 0, onMethodSelect }: DebtRaceProps) {
  const [selectedMethod, setSelectedMethod] = useState<'avalanche' | 'snowball'>('avalanche');

  const activeDebts = debts.filter((d) => d.balance > 0);
  if (activeDebts.length === 0) return null;

  const avalanche = debtPayoffProjection(activeDebts, extraPayment, 'avalanche');
  const snowball = debtPayoffProjection(activeDebts, extraPayment, 'snowball');

  const interestSaved = snowball.totalInterestPaid - avalanche.totalInterestPaid;
  const monthsSaved = snowball.monthsToDebtFree - avalanche.monthsToDebtFree;

  const handleSelect = (method: 'avalanche' | 'snowball') => {
    setSelectedMethod(method);
    onMethodSelect?.(method);
  };

  const totalDebt = activeDebts.reduce((s, d) => s + d.balance, 0);

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Debt Payoff Strategy</Text>

      <View style={styles.methods}>
        {(['avalanche', 'snowball'] as const).map((method) => {
          const data = method === 'avalanche' ? avalanche : snowball;
          const isSelected = selectedMethod === method;
          return (
            <TouchableOpacity
              key={method}
              style={[styles.method, isSelected && styles.methodSelected]}
              onPress={() => handleSelect(method)}
              activeOpacity={0.8}
            >
              <Text style={[styles.methodName, isSelected && styles.methodNameSelected]}>
                {method === 'avalanche' ? '⚡ Avalanche' : '❄️ Snowball'}
              </Text>
              <Text style={[styles.methodMonths, isSelected && styles.methodValueSelected]}>
                {formatMonths(data.monthsToDebtFree)}
              </Text>
              <Text style={[styles.methodInterest, isSelected && styles.methodSubSelected]}>
                {formatCurrency(data.totalInterestPaid, { compact: true })} interest
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {interestSaved > 0 && (
        <View style={styles.insight}>
          <Text style={styles.insightText}>
            Avalanche saves{' '}
            <Text style={styles.insightValue}>{formatCurrency(interestSaved, { compact: true })}</Text>
            {monthsSaved > 0 && (
              <Text> and {formatMonths(monthsSaved)} faster</Text>
            )}
          </Text>
        </View>
      )}

      {/* Race bars */}
      <View style={styles.race}>
        {activeDebts.slice(0, 4).map((debt) => (
          <View key={debt.id} style={styles.raceItem}>
            <Text style={styles.debtName} numberOfLines={1}>{debt.name}</Text>
            <ProgressBar
              progress={100 - (debt.balance / totalDebt) * 100}
              height={6}
              variant="debt"
            />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.base },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
    marginBottom: Spacing.md,
  },
  methods: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  method: {
    flex: 1,
    padding: Spacing.md,
    backgroundColor: Colors.cardSurfaceNavyElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    alignItems: 'center',
    gap: 4,
  },
  methodSelected: {
    borderColor: Colors.accentGold,
    backgroundColor: 'rgba(249,199,79,0.05)',
  },
  methodName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  methodNameSelected: { color: Colors.accentGold },
  methodMonths: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
  },
  methodValueSelected: { color: Colors.accentGold },
  methodInterest: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
  },
  methodSubSelected: { color: Colors.slateGray },
  insight: {
    backgroundColor: 'rgba(6,214,160,0.08)',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  insightText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textAlign: 'center',
  },
  insightValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    color: Colors.profitGreen,
  },
  race: { gap: Spacing.sm },
  raceItem: { gap: 4 },
  debtName: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
  },
});
