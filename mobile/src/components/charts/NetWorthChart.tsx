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
  showIndicator?: boolean;
}

export function NetWorthChart({ history, height = 200, showIndicator = true }: NetWorthChartProps) {
  // Handle 0 data points
  if (!history || history.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Submit EOD check-ins to see your net worth trend</Text>
      </View>
    );
  }

  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const values = sorted.map((h) => h.net_worth);
  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const isPositiveTrend = change >= 0;
  const lineColor = isPositiveTrend ? Colors.profitGreen : Colors.debtCrimson;

  // Handle 1 data point — show as flat line with the single value
  if (history.length === 1) {
    return (
      <View style={[styles.singlePoint, { height }]}>
        <Text style={styles.singleValue}>{formatCurrency(first)}</Text>
        <Text style={styles.singleLabel}>Net Worth (1 data point)</Text>
        <Text style={styles.emptyText}>Keep submitting EOD check-ins to see your trend</Text>
      </View>
    );
  }

  const data = sorted.map((h) => ({
    value: h.net_worth,
    hideDataPoint: true,
  }));

  const width = Dimensions.get('window').width - 64;

  return (
    <View style={styles.container}>
      {/* Up/Down indicator */}
      {showIndicator && (
        <View style={styles.indicatorRow}>
          <Text style={[styles.indicatorArrow, { color: lineColor }]}>
            {isPositiveTrend ? '\u25B2' : '\u25BC'}
          </Text>
          <Text style={[styles.indicatorText, { color: lineColor }]}>
            {isPositiveTrend ? '+' : ''}{formatCurrency(change)} ({history.length} days)
          </Text>
        </View>
      )}

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
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  indicatorArrow: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  indicatorText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.bodySmall,
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
  singlePoint: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  singleValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.titleMedium,
    color: Colors.accentGold,
  },
  singleLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  axisText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 10,
    color: Colors.slateGray,
  },
});
