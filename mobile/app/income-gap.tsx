// Income Gap Analyzer screen
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { ProgressBar } from '../src/components/ui/ProgressBar';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/finance';
import { useAuthStore } from '../src/stores/authStore';
import { formatCurrency, formatMonths } from '../src/utils/formatters';
import api from '../src/services/api';

// Available cities from backend data
const CITIES = [
  'Austin', 'New York', 'San Francisco',
  'Lisbon', 'Porto', 'Barcelona', 'Madrid',
  'Mexico City', 'Playa del Carmen',
  'Chiang Mai', 'Bangkok', 'Bali',
  'Medellin', 'Bogota',
  'Tbilisi', 'Bucharest', 'Prague', 'Budapest',
  'Krakow', 'Warsaw', 'Tallinn',
  'Dubai', 'Singapore',
  'Tokyo', 'Seoul', 'Taipei',
  'Buenos Aires', 'Athens',
  'Ho Chi Minh City', 'Da Nang',
  'Panama City', 'San Jose',
];

const costlivingApi = {
  compare: (from: string, to: string, income: number) =>
    api.get('/api/costliving/compare', { params: { from, to, income } }),
};

export default function IncomeGapScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();

  const dreamCost = profile?.dream_lifestyle_cost_mo || 0;
  const currentTakeHome = (profile?.monthly_income_gross || 0) * 0.75;
  const gap = Math.max(0, dreamCost - currentTakeHome);
  const gapProgress = dreamCost > 0 ? Math.min(100, (currentTakeHome / dreamCost) * 100) : 0;

  // Time to close gap at 5% annual income growth
  const monthsToClose = gap > 0
    ? Math.ceil(Math.log(dreamCost / currentTakeHome) / Math.log(1 + 0.05 / 12))
    : 0;

  // Cost-of-Living compare state
  const [colOrigin, setColOrigin] = useState('Austin');
  const [colDestination, setColDestination] = useState('');
  const [colResult, setColResult] = useState<any>(null);
  const [colLoading, setColLoading] = useState(false);
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [showDestPicker, setShowDestPicker] = useState(false);

  const handleCompare = async () => {
    if (!colDestination) {
      Alert.alert('Select a destination', 'Please pick a destination city to compare.');
      return;
    }
    setColLoading(true);
    setColResult(null);
    try {
      const income = profile?.monthly_income_gross || 5000;
      const { data } = await costlivingApi.compare(colOrigin, colDestination, income);
      if (data?.error) {
        Alert.alert('Not found', data.error);
      } else {
        setColResult(data);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to compare locations.');
    } finally {
      setColLoading(false);
    }
  };

  const CityPicker = ({
    label,
    selected,
    onSelect,
    show,
    onToggle,
    excludeCity,
  }: {
    label: string;
    selected: string;
    onSelect: (city: string) => void;
    show: boolean;
    onToggle: () => void;
    excludeCity?: string;
  }) => (
    <View style={styles.pickerContainer}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected || 'Select a city'}`}
      >
        <Text style={[styles.pickerButtonText, !selected && styles.pickerPlaceholder]}>
          {selected || 'Select a city'}
        </Text>
        <Text style={styles.pickerChevron}>{show ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {show && (
        <ScrollView
          style={styles.pickerDropdown}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {CITIES.filter(c => c !== excludeCity).map((city) => (
            <TouchableOpacity
              key={city}
              style={[styles.pickerOption, selected === city && styles.pickerOptionActive]}
              onPress={() => { onSelect(city); onToggle(); }}
              accessibilityRole="button"
              accessibilityLabel={`Select ${city}`}
            >
              <Text style={[styles.pickerOptionText, selected === city && styles.pickerOptionTextActive]}>
                {city}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Income Gap</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.mainCard}>
          <Text style={styles.cardLabel}>INCOME GAP TO DREAM LIFESTYLE</Text>
          <Text style={[styles.gapAmount, { color: gap > 0 ? Colors.debtCrimson : Colors.profitGreen }]}>
            {gap > 0 ? `-${formatCurrency(gap)}/mo` : 'Gap closed.'}
          </Text>

          <View style={styles.comparison}>
            <View style={styles.compItem}>
              <Text style={styles.compLabel}>Current Take-Home</Text>
              <Text style={styles.compValue}>{formatCurrency(currentTakeHome)}/mo</Text>
            </View>
            <View style={styles.compArrow}>
              <Text style={styles.arrowText}>→</Text>
            </View>
            <View style={styles.compItem}>
              <Text style={styles.compLabel}>Dream Lifestyle</Text>
              <Text style={styles.compValue}>{formatCurrency(dreamCost)}/mo</Text>
            </View>
          </View>

          <ProgressBar
            progress={gapProgress}
            height={8}
            variant="savings"
            showLabel
            label={`${gapProgress.toFixed(0)}% to dream`}
          />
        </Card>

        {gap > 0 && (
          <Card style={styles.timelineCard}>
            <Text style={styles.timelineLabel}>At 5% annual income growth:</Text>
            <Text style={styles.timelineValue}>{formatMonths(monthsToClose)}</Text>
            <Text style={styles.timelineSub}>to close the gap at current trajectory</Text>
          </Card>
        )}

        <Text style={styles.strategiesTitle}>A Starting Framework</Text>
        <Text style={styles.frameworkDisclaimer}>
          Personalized strategies are coming. Until they're grounded in your actual gap,
          income, and goals, here's a generic three-lever checklist — run the what-ifs
          to see real numbers for your situation.
        </Text>

        {[
          { action: 'Grow income', impact: 'Model a raise or side income in What-If → Income Increase.' },
          { action: 'Cut required lifestyle cost', impact: 'Lower your dream monthly spend in Profile to shrink the gap.' },
          { action: 'Relocate to a lower-cost area', impact: 'Model it in What-If → Relocate to see the real delta.' },
        ].map((strategy, i) => (
          <Card key={i} style={styles.strategyCard}>
            <Text style={styles.strategyAction}>{strategy.action}</Text>
            <Text style={styles.strategyImpact}>{strategy.impact}</Text>
          </Card>
        ))}

        <Button
          title="Model a Salary Raise →"
          onPress={() => router.push('/whatif/salary_negotiation')}
          variant="primary"
          fullWidth
          style={styles.ctaBtn}
        />

        {/* ── Cost-of-Living Compare Card ── */}
        <Card style={styles.colCard}>
          <Text style={styles.colTitle}>Compare Cost of Living</Text>
          <Text style={styles.colSubtitle}>
            See how your monthly costs change if you relocate.
          </Text>

          <CityPicker
            label="Origin"
            selected={colOrigin}
            onSelect={setColOrigin}
            show={showOriginPicker}
            onToggle={() => {
              setShowOriginPicker(v => !v);
              setShowDestPicker(false);
            }}
            excludeCity={colDestination}
          />

          <CityPicker
            label="Destination"
            selected={colDestination}
            onSelect={setColDestination}
            show={showDestPicker}
            onToggle={() => {
              setShowDestPicker(v => !v);
              setShowOriginPicker(false);
            }}
            excludeCity={colOrigin}
          />

          <Button
            title={colLoading ? 'Comparing...' : 'Compare →'}
            onPress={handleCompare}
            loading={colLoading}
            variant="secondary"
            fullWidth
            style={styles.colCompareBtn}
            accessibilityLabel="Compare cost of living between the two selected cities"
          />

          {colResult && !colResult.error && (
            <View style={styles.colResult}>
              <Text style={styles.colResultTitle}>
                {colResult.from?.city} → {colResult.to?.city}
              </Text>

              {/* Side-by-side breakdown */}
              <View style={styles.colRow}>
                <Text style={styles.colCatLabel}>Category</Text>
                <Text style={styles.colCityLabel}>{colResult.from?.city}</Text>
                <Text style={styles.colCityLabel}>{colResult.to?.city}</Text>
              </View>
              <View style={styles.colDivider} />

              {[
                { label: 'Rent (1BR)', fromKey: 'rent_1br_city_center', toKey: 'rent_1br_city_center' },
                { label: 'Groceries', fromKey: 'groceries_monthly', toKey: 'groceries_monthly' },
                { label: 'Transport', fromKey: 'transport_monthly', toKey: 'transport_monthly' },
                { label: 'Total / mo', fromKey: 'monthly_cost_usd', toKey: 'monthly_cost_usd' },
              ].map((row) => {
                const fromVal: number = colResult.from?.[row.fromKey] ?? 0;
                const toVal: number = colResult.to?.[row.toKey] ?? 0;
                const isTotal = row.label === 'Total / mo';
                return (
                  <View key={row.label} style={[styles.colRow, isTotal && styles.colRowTotal]}>
                    <Text style={[styles.colCatText, isTotal && styles.colTotalText]}>{row.label}</Text>
                    <Text style={[styles.colValText, isTotal && styles.colTotalText]}>
                      {formatCurrency(fromVal)}
                    </Text>
                    <Text style={[
                      styles.colValText,
                      isTotal && styles.colTotalText,
                      { color: toVal < fromVal ? Colors.profitGreen : toVal > fromVal ? Colors.debtCrimson : Colors.frostWhite },
                    ]}>
                      {formatCurrency(toVal)}
                    </Text>
                  </View>
                );
              })}

              <View style={styles.colSavingsRow}>
                <View style={styles.colSavingsItem}>
                  <Text style={styles.colSavingsValue}>
                    {colResult.monthly_savings >= 0 ? '+' : ''}{formatCurrency(colResult.monthly_savings)}/mo
                  </Text>
                  <Text style={styles.colSavingsLabel}>Monthly Savings</Text>
                </View>
                <View style={styles.colSavingsDivider} />
                <View style={styles.colSavingsItem}>
                  <Text style={styles.colSavingsValue}>
                    {colResult.purchasing_power_multiplier}×
                  </Text>
                  <Text style={styles.colSavingsLabel}>Purchasing Power</Text>
                </View>
              </View>
            </View>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  content: { padding: Spacing.base, paddingBottom: 100 },
  mainCard: { padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.base, gap: Spacing.md },
  cardLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.microLabel, color: Colors.slateGray, letterSpacing: 1.5, textAlign: 'center' },
  gapAmount: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.displayMedium, textAlign: 'center' },
  comparison: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, width: '100%', justifyContent: 'space-between' },
  compItem: { flex: 1, alignItems: 'center' },
  compLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, textAlign: 'center' },
  compValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.frostWhite, textAlign: 'center' },
  compArrow: { paddingHorizontal: Spacing.sm },
  arrowText: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleSmall, color: Colors.accentGold },
  timelineCard: { padding: Spacing.base, alignItems: 'center', marginBottom: Spacing.xl, gap: Spacing.xs },
  timelineLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  timelineValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.titleMedium, color: Colors.accentGold },
  timelineSub: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  strategiesTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.sm },
  frameworkDisclaimer: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, marginBottom: Spacing.base, lineHeight: 18 },
  strategyCard: { padding: Spacing.md, marginBottom: Spacing.sm, gap: 4 },
  strategyAction: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  strategyImpact: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.profitGreen },
  ctaBtn: { marginTop: Spacing.base, marginBottom: Spacing.xl },
  // Cost-of-Living card
  colCard: { padding: Spacing.xl, gap: Spacing.md },
  colTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleSmall, color: Colors.frostWhite },
  colSubtitle: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, lineHeight: 18 },
  pickerContainer: { marginBottom: Spacing.sm },
  pickerLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.frostWhite, marginBottom: 6 },
  pickerButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.cardSurfaceNavy, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.graphiteBorder, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  pickerButtonText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  pickerPlaceholder: { color: Colors.slateGray },
  pickerChevron: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  pickerDropdown: { maxHeight: 180, backgroundColor: Colors.cardSurfaceNavy, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.graphiteBorder, marginTop: 4 },
  pickerOption: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  pickerOptionActive: { backgroundColor: 'rgba(212,175,55,0.15)' },
  pickerOptionText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  pickerOptionTextActive: { color: Colors.accentGold, fontFamily: 'Inter_600SemiBold' },
  colCompareBtn: { marginTop: Spacing.sm },
  colResult: { marginTop: Spacing.base, gap: Spacing.sm },
  colResultTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, textAlign: 'center', marginBottom: Spacing.sm },
  colRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  colRowTotal: { borderTopWidth: 1, borderTopColor: Colors.graphiteBorder, paddingTop: Spacing.sm, marginTop: Spacing.xs },
  colCatLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.microLabel, color: Colors.slateGray, flex: 1, letterSpacing: 1 },
  colCityLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.microLabel, color: Colors.slateGray, width: 90, textAlign: 'right', letterSpacing: 0.5 },
  colDivider: { height: 1, backgroundColor: Colors.graphiteBorder, marginBottom: Spacing.xs },
  colCatText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, flex: 1 },
  colValText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.frostWhite, width: 90, textAlign: 'right' },
  colTotalText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  colSavingsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.md, backgroundColor: 'rgba(6,214,160,0.06)', borderRadius: BorderRadius.md, padding: Spacing.md },
  colSavingsItem: { alignItems: 'center', gap: 4 },
  colSavingsValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.titleSmall, color: Colors.profitGreen },
  colSavingsLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  colSavingsDivider: { width: 1, backgroundColor: Colors.graphiteBorder },
});
