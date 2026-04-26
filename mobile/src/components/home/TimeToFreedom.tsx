// Time to Freedom counter — 3 gold countdown lines
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../ui/Card';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { formatMonths } from '../../utils/formatters';

interface TimeToFreedomProps {
  debtFreeMonths?: number;
  emergencyFundMonths?: number;
  dreamLifestyleMonths?: number;
}

function FreedomLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

export function TimeToFreedom({
  debtFreeMonths,
  emergencyFundMonths,
  dreamLifestyleMonths,
}: TimeToFreedomProps) {
  return (
    <Card variant="gold" style={styles.card}>
      <Text style={styles.title}>TIME TO FREEDOM</Text>
      <View style={styles.lines}>
        <FreedomLine
          label="Debt-free in:"
          value={debtFreeMonths !== undefined ? formatMonths(debtFreeMonths) : '—'}
        />
        <View style={styles.divider} />
        <FreedomLine
          label="Emergency fund:"
          value={emergencyFundMonths !== undefined ? formatMonths(emergencyFundMonths) : '—'}
        />
        <View style={styles.divider} />
        <FreedomLine
          label="Dream lifestyle:"
          value={dreamLifestyleMonths !== undefined ? formatMonths(dreamLifestyleMonths) : '—'}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.base,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  lines: {
    gap: Spacing.sm,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  lineValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.accentGold,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.graphiteBorder,
    opacity: 0.5,
  },
});
