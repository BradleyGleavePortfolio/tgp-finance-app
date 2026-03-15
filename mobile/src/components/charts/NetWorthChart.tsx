// Net worth line chart with gradient glow using react-native-gifted-charts
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { formatCurrency } from '../../utils/formatters';
import type { NetWorthHistory } from '../../types';

interface NetWorthChartProps {
  history: NetWorthHistory[];
  height?: number;
}

export function NetWorthChart({ history, height = 200 }: NetWorthChartProps) {
  if (!history || history.length < 2) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Submit EOD check-ins to see your net worth trend</Text>
      </View>
    );
  }

  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const values = sorted.map((h) => h.net_worth);
  const isPositiveTrend = values[values.length - 1] >= values[0];
  const lineColor = isPositiveTrend ? Colors.profitGreen : Colors.debtCrimson;

  const data = sorted.map((h) => ({
    value: h.net_worth,
    hideDataPoint: true,
  }));

  const width = Dimensions.get('window').width - 64;

  return (
    <View style={styles.container}>
      <LineChart
        data={data}
        width={width}
        height={height}
        curved
        color={lineColor}
        thickness={2}
        startFillColor={isPositiveTrend ? 'rgba(6,214,160,0.2)' : 'rgba(230,57,70,0.2)'}
        endFillColor="transparent"
        areaChart
        noOfSections={4}
        yAxisColor="transparent"
        xAxisColor="transparent"
        yAxisTextStyle={styles.axisText}
        xAxisLabelTextStyle={styles.axisText}
        backgroundColor={Colors.cardSurfaceNavy}
        rulesColor="rgba(58,58,74,0.3)"
        rulesType="solid"
        hideDataPoints
        showVerticalLines={false}
        formatYLabel={(value: string) => formatCurrency(parseFloat(value), { compact: true })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textAlign: 'center',
  },
  axisText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 10,
    color: Colors.slateGray,
  },
});
