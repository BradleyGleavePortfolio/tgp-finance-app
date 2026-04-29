// Financial Vital Signs — 2×2 grid of live financial metrics
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { MonoText } from '../ui/MonoText';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { formatCurrency, formatPercent } from '../../utils/formatters';

interface VitalMetric {
  label: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
  onPress?: () => void;
}

function MetricCard({ label, value, trend, onPress }: VitalMetric) {
  const trendColor = trend === 'up' ? Colors.profitGreen : trend === 'down' ? Colors.debtCrimson : Colors.accentGold;
  const trendIcon: React.ComponentProps<typeof Ionicons>['name'] =
    trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'remove';

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.metricCard}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}, trend ${trend}`}
    >
      <Card style={styles.card}>
        <Text style={styles.label}>{label}</Text>
        <MonoText size={Typography.titleSmall} color={trendColor} bold style={styles.value}>
          {value}
        </MonoText>
        <View style={styles.trendRow}>
          <Ionicons name={trendIcon} size={12} color={trendColor} />
          <Text style={[styles.trendText, { color: trendColor }]}>
            {trend === 'up' ? 'Improving' : trend === 'down' ? 'Declining' : 'Stable'}
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

interface VitalSignsProps {
  netWorth: number;
  cashFlow: number;
  dti: number;
  // Optional: omit when we don't have real expense data. Showing "0%" to every
  // user — which was the prior behavior — misrepresents a metric we can't
  // actually compute yet.
  savingsRate?: number;
  onPressNetWorth?: () => void;
  onPressCashFlow?: () => void;
  onPressDTI?: () => void;
  onPressSavingsRate?: () => void;
}

export function VitalSigns({
  netWorth,
  cashFlow,
  dti,
  savingsRate,
  onPressNetWorth,
  onPressCashFlow,
  onPressDTI,
  onPressSavingsRate,
}: VitalSignsProps) {
  const metrics: VitalMetric[] = [
    {
      label: 'Net Worth',
      value: formatCurrency(netWorth, { compact: true }),
      trend: netWorth >= 0 ? 'up' : 'down',
      onPress: onPressNetWorth,
    },
    {
      label: 'Cash Flow',
      value: formatCurrency(cashFlow, { compact: true }),
      trend: cashFlow > 0 ? 'up' : cashFlow < 0 ? 'down' : 'stable',
      onPress: onPressCashFlow,
    },
    {
      label: 'Debt-to-Income',
      value: `${dti.toFixed(0)}%`,
      trend: dti < 20 ? 'up' : dti > 36 ? 'down' : 'stable',
      onPress: onPressDTI,
    },
  ];

  if (typeof savingsRate === 'number' && isFinite(savingsRate)) {
    metrics.push({
      label: 'Savings Rate',
      value: `${savingsRate.toFixed(0)}%`,
      trend: savingsRate >= 20 ? 'up' : savingsRate < 10 ? 'down' : 'stable',
      onPress: onPressSavingsRate,
    });
  }

  return (
    <View style={styles.grid}>
      {metrics.map((m) => (
        <MetricCard key={m.label} {...m} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metricCard: {
    width: '48%',
  },
  card: {
    padding: Spacing.md,
  },
  label: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    marginBottom: Spacing.xs,
  },
  value: {
    marginBottom: Spacing.xs,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
  },
});
