// Interactive net worth projection chart with sliders
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { formatCurrency, formatPercent } from '../../utils/formatters';
import { projectNetWorth } from '../../utils/financial';

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

// Simple slider row using +/- buttons (RN native Slider has cross-platform issues)
function SliderRow({ label, value, min, max, step, unit, onChange }: SliderRowProps) {
  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View style={styles.sliderControls}>
        <Text
          style={styles.sliderBtn}
          onPress={() => onChange(Math.max(min, value - step))}
        >–</Text>
        <Text style={styles.sliderValue}>{value}{unit}</Text>
        <Text
          style={styles.sliderBtn}
          onPress={() => onChange(Math.min(max, value + step))}
        >+</Text>
      </View>
    </View>
  );
}

interface ProjectionChartProps {
  currentNetWorth: number;
  monthlyIncome: number;
  initialSavingsRate?: number;
  showSliders?: boolean;
}

export function ProjectionChart({
  currentNetWorth,
  monthlyIncome,
  initialSavingsRate = 20,
  showSliders = true,
}: ProjectionChartProps) {
  const [incomeGrowth, setIncomeGrowth] = useState(5);
  const [savingsRate, setSavingsRate] = useState(initialSavingsRate);
  const [investReturn, setInvestReturn] = useState(8);
  const [extraDebt, setExtraDebt] = useState(0);

  const projections = projectNetWorth(
    currentNetWorth,
    monthlyIncome,
    savingsRate,
    investReturn,
    incomeGrowth,
    extraDebt,
    20
  );

  const labels = ['1yr', '3yr', '5yr', '10yr', '15yr', '20yr'];
  const labelYears = [1, 3, 5, 10, 15, 20];
  const data = labelYears.map((yr) => ({ value: projections[yr - 1] || 0, label: labels[labelYears.indexOf(yr)] }));

  const maxVal = Math.max(...data.map((d) => d.value), 0);
  const isPositive = data[data.length - 1].value > currentNetWorth;

  const width = Dimensions.get('window').width - 64;

  return (
    <View>
      <LineChart
        data={data}
        width={width}
        height={180}
        curved
        color={isPositive ? Colors.profitGreen : Colors.debtCrimson}
        thickness={2}
        areaChart
        startFillColor={isPositive ? 'rgba(6,214,160,0.15)' : 'rgba(230,57,70,0.15)'}
        endFillColor="transparent"
        noOfSections={4}
        yAxisColor="transparent"
        xAxisColor={Colors.graphiteBorder}
        yAxisTextStyle={styles.axisText}
        xAxisLabelTextStyle={styles.axisText}
        backgroundColor={Colors.cardSurfaceNavy}
        rulesColor="rgba(58,58,74,0.2)"
        dataPointsColor={Colors.accentGold}
        dataPointsRadius={4}
        formatYLabel={(v: string) => formatCurrency(parseFloat(v), { compact: true })}
      />

      {showSliders && (
        <View style={styles.sliders}>
          <SliderRow
            label="Income Growth"
            value={incomeGrowth}
            min={0}
            max={50}
            step={1}
            unit="%/yr"
            onChange={setIncomeGrowth}
          />
          <SliderRow
            label="Savings Rate"
            value={savingsRate}
            min={0}
            max={80}
            step={5}
            unit="%"
            onChange={setSavingsRate}
          />
          <SliderRow
            label="Investment Return"
            value={investReturn}
            min={0}
            max={20}
            step={1}
            unit="%/yr"
            onChange={setInvestReturn}
          />
          <SliderRow
            label="Extra Debt Payment"
            value={extraDebt}
            min={0}
            max={2000}
            step={100}
            unit="/mo"
            onChange={setExtraDebt}
          />

          {/* Key projections */}
          <View style={styles.projGrid}>
            {[1, 5, 10, 20].map((yr) => (
              <View key={yr} style={styles.projItem}>
                <Text style={styles.projYear}>{yr}yr</Text>
                <Text style={styles.projValue}>
                  {formatCurrency(projections[yr - 1] || 0, { compact: true })}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sliders: {
    marginTop: Spacing.base,
    gap: Spacing.sm,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.graphiteBorder,
  },
  sliderLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  sliderControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  sliderBtn: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleMedium,
    color: Colors.accentGold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  sliderValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
    minWidth: 70,
    textAlign: 'center',
  },
  projGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.md,
    backgroundColor: 'rgba(249,199,79,0.05)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(249,199,79,0.2)',
  },
  projItem: {
    alignItems: 'center',
    gap: 4,
  },
  projYear: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
  },
  projValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.bodySmall,
    color: Colors.accentGold,
  },
  axisText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 10,
    color: Colors.slateGray,
  },
});
