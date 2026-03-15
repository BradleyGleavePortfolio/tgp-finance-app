// Debt progress bar chart
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { formatCurrency } from '../../utils/formatters';
import type { FinancialAccount } from '../../types';

interface DebtProgressChartProps {
  debts: FinancialAccount[];
  initialDebts?: FinancialAccount[]; // onboarding balances for comparison
  height?: number;
}

export function DebtProgressChart({ debts, initialDebts, height = 160 }: DebtProgressChartProps) {
  const activeDebts = debts.filter((d) => d.is_debt && d.balance > 0).slice(0, 5);
  if (activeDebts.length === 0) return null;

  const data = activeDebts.map((d) => ({
    value: d.balance,
    label: d.name.slice(0, 8),
    frontColor: Colors.debtCrimson,
    topLabelComponent: () => (
      <Text style={styles.topLabel}>{formatCurrency(d.balance, { compact: true })}</Text>
    ),
  }));

  return (
    <View>
      <BarChart
        data={data}
        barWidth={28}
        height={height}
        noOfSections={4}
        barBorderRadius={4}
        yAxisColor="transparent"
        xAxisColor={Colors.graphiteBorder}
        yAxisTextStyle={styles.axisText}
        xAxisLabelTextStyle={styles.axisText}
        backgroundColor={Colors.cardSurfaceNavy}
        rulesColor="rgba(58,58,74,0.3)"
        disableScroll
        formatYLabel={(v: string) => formatCurrency(parseFloat(v), { compact: true })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topLabel: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 9,
    color: Colors.debtCrimson,
    marginBottom: 2,
  },
  axisText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 10,
    color: Colors.slateGray,
  },
});
