// Individual What-If scenario form + results
// UX Psychology Report #3: medium on Run, success on save/confirm, light on back
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NumberInput } from '../../src/components/ui/NumberInput';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { ShareCard } from '../../src/components/ShareCard';
import { useShareCard } from '../../src/hooks/useShareCard';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { useWhatIfStore } from '../../src/stores/whatifStore';
import { useAccountsStore } from '../../src/stores/accountsStore';
import { useAuthStore } from '../../src/stores/authStore';
import { WHATIF_SCENARIOS } from '../../src/utils/constants';
import { track } from '../../src/lib/analytics';
import { formatCurrency, formatMonths } from '../../src/utils/formatters';
import { futureValue, futureValueAnnuity, computeFINumber } from '../../src/utils/financial';
import type { ScenarioType } from '../../src/types';

export default function WhatIfScenario() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const router = useRouter();
  const { runScenario, saveScenario, currentResult, isRunning, clearResult } = useWhatIfStore();
  const { accounts, totalDebt, netWorth } = useAccountsStore();
  const { profile } = useAuthStore();

  const [params, setParams] = useState<Record<string, number | string>>({});
  const [localResult, setLocalResult] = useState<any>(null);
  const { viewRef: shareRef, share } = useShareCard();

  useEffect(() => {
    clearResult();
    setLocalResult(null);
  }, [type]);

  const scenarioConfig = WHATIF_SCENARIOS.find(s => s.type === type);
  if (!scenarioConfig) return null;

  const debtAccounts = accounts.filter(a => a.is_debt && a.balance > 0);
  const monthlyIncome = profile?.monthly_income_gross || 5000;

  // Params hold a mix of numeric and text values (text for `city` / `to_state`).
  // Narrow to number when a numeric field is read.
  const num = (key: string, fallback: number): number => {
    const v = params[key];
    if (typeof v === 'number' && isFinite(v)) return v;
    const parsed = typeof v === 'string' ? parseFloat(v) : NaN;
    return isFinite(parsed) ? parsed : fallback;
  };

  const handleRunLocal = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* ignore */ }
    track('whatif_run', { scenario_type: type });
    runLocal();
  };

  const handleSaveScenario = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* ignore */ }
    saveScenario({ scenario_type: type as ScenarioType, label: scenarioConfig.title, parameters: params, result_summary: displayResult });
    Alert.alert('Saved', 'Scenario saved to your What-If library.');
  };

  const handleBack = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    router.back();
  };

  const runLocal = () => {
    // Client-side calculation for instant feedback
    let result: any = {};

    switch (type) {
      case 'extra_debt_payment': {
        const extra = num('extra_monthly', 200);
        const targetDebt = debtAccounts[0];
        if (targetDebt) {
          const monthlyRate = (targetDebt.apr_percent || 20) / 100 / 12;
          const normalMonths = Math.ceil(-Math.log(1 - (targetDebt.balance * monthlyRate) / (targetDebt.minimum_payment || 25)) / Math.log(1 + monthlyRate));
          const fastMonths = Math.ceil(-Math.log(1 - (targetDebt.balance * monthlyRate) / ((targetDebt.minimum_payment || 25) + extra)) / Math.log(1 + monthlyRate));
          const interestSaved = ((targetDebt.minimum_payment || 25) * normalMonths - targetDebt.balance) - ((targetDebt.minimum_payment || 25) + extra) * fastMonths - targetDebt.balance;
          result = {
            headline: `Pay off ${targetDebt.name} ${formatMonths(normalMonths - fastMonths)} faster`,
            narrative: `Adding $${extra}/mo saves approximately ${formatCurrency(Math.abs(interestSaved))} in interest and frees up cash flow in ${formatMonths(fastMonths)}.`,
            keyMetrics: [
              { label: 'Months Saved', value: formatMonths(normalMonths - fastMonths), positive: true },
              { label: 'Interest Saved', value: formatCurrency(Math.abs(interestSaved)), positive: true },
              { label: 'Debt-Free In', value: formatMonths(fastMonths), positive: true },
            ],
          };
        }
        break;
      }

      case 'income_increase': {
        const raiseAmount = num('new_monthly_income', monthlyIncome * 1.15);
        const increase = raiseAmount - monthlyIncome;
        const tenYearImpact = futureValueAnnuity(increase * 0.7 * 0.3, 8, 10);
        result = {
          headline: `+${formatCurrency(increase)}/mo adds ${formatCurrency(tenYearImpact, { compact: true })} to net worth over 10 years`,
          narrative: `At ${formatCurrency(raiseAmount)}/mo gross, your take-home increases by approximately ${formatCurrency(increase * 0.7)}/mo. Investing 30% of that at 8% return adds ${formatCurrency(tenYearImpact, { compact: true })} to your net worth over 10 years.`,
          keyMetrics: [
            { label: 'Monthly Increase', value: formatCurrency(increase), positive: true },
            { label: '10yr Net Worth Impact', value: formatCurrency(tenYearImpact, { compact: true }), positive: true },
          ],
        };
        break;
      }

      case 'invest_lump_sum': {
        const amount = num('amount', 5000);
        const rate = num('return_rate', 8);
        const y1 = futureValue(amount, rate, 1);
        const y5 = futureValue(amount, rate, 5);
        const y10 = futureValue(amount, rate, 10);
        const y20 = futureValue(amount, rate, 20);
        result = {
          headline: `${formatCurrency(amount)} grows to ${formatCurrency(y10, { compact: true })} in 10 years at ${rate}%`,
          narrative: `Compound interest formula: FV = PV × (1+r)^n. At ${rate}% annual return, ${formatCurrency(amount)} becomes ${formatCurrency(y20, { compact: true })} in 20 years.`,
          keyMetrics: [
            { label: '1 Year', value: formatCurrency(y1, { compact: true }), positive: true },
            { label: '5 Years', value: formatCurrency(y5, { compact: true }), positive: true },
            { label: '10 Years', value: formatCurrency(y10, { compact: true }), positive: true },
            { label: '20 Years', value: formatCurrency(y20, { compact: true }), positive: true },
          ],
        };
        break;
      }

      case 'retire_early': {
        const dreamCost = profile?.dream_lifestyle_cost_mo || 5000;
        const fiNumber = computeFINumber(dreamCost);
        const gap = fiNumber - Math.max(0, netWorth);
        const savingsRate = num('savings_rate', 20);
        const annualSavings = monthlyIncome * 0.75 * 12 * (savingsRate / 100);
        const yearsToFI = Math.ceil(Math.log(1 + gap * 0.08 / annualSavings) / Math.log(1.08));
        result = {
          headline: `FI in ~${yearsToFI} years at ${savingsRate}% savings rate`,
          narrative: `Your FI number (4% rule): ${formatCurrency(fiNumber, { compact: true })}. At ${savingsRate}% savings rate with 8% returns, you reach financial independence in approximately ${yearsToFI} years.`,
          keyMetrics: [
            { label: 'FI Number', value: formatCurrency(fiNumber, { compact: true }), positive: true },
            { label: 'Years to FI', value: `~${yearsToFI} years`, positive: yearsToFI <= 20 },
            { label: 'Annual Savings', value: formatCurrency(annualSavings, { compact: true }), positive: true },
          ],
        };
        break;
      }

      default: {
        // Fall back to API for complex scenarios
        result = null;
      }
    }

    if (result) {
      setLocalResult(result);
    } else {
      // Use API
      runScenario(type as ScenarioType, params).then(r => setLocalResult(r)).catch(err => {
        Alert.alert('Error', 'Could not run scenario. Please try again.');
      });
    }
  };

  const displayResult = localResult || currentResult;

  // Derive the share-card copy from the scenario result. We intentionally only
  // include the headline and the first key metric — no balances, no account
  // names, no personal identifiers.
  const shareTitle = scenarioConfig?.title ? `What if ${scenarioConfig.title.toLowerCase()}?` : 'What if…';
  const sharePrimary = displayResult?.headline ?? '';
  const shareFirstMetric = displayResult?.keyMetrics?.[0];
  const shareSecondMetric = displayResult?.keyMetrics?.[1];

  const onShare = () => {
    share({ dialogTitle: 'Share this scenario' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{scenarioConfig.title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.icon}>{scenarioConfig.icon}</Text>
          <Text style={styles.description}>{scenarioConfig.description}</Text>

          {/* Input fields based on scenario type */}
          {!displayResult && (
            <View style={styles.form}>
              {(type === 'extra_debt_payment' || type === 'pay_off_debt_early') && (
                <NumberInput label="Extra Monthly Payment" value={String(params.extra_monthly || '')} onChangeValue={(v, n) => setParams({ ...params, extra_monthly: n })} placeholder="200" />
              )}
              {(type === 'income_increase') && (
                <NumberInput label="New Monthly Gross Income" value={String(params.new_monthly_income || '')} onChangeValue={(v, n) => setParams({ ...params, new_monthly_income: n })} placeholder={String(Math.round(monthlyIncome * 1.2))} />
              )}
              {(type === 'salary_negotiation') && (
                <>
                  <NumberInput label="Target Annual Salary" value={String(params.target_annual || '')} onChangeValue={(v, n) => setParams({ ...params, target_annual: n })} placeholder={String(Math.round(monthlyIncome * 12 * 1.2))} />
                  <NumberInput label="Probability (1=likely, 2=possible, 3=longshot)" value={String(params.probability || '')} onChangeValue={(v, n) => setParams({ ...params, probability: n })} placeholder="2" />
                </>
              )}
              {type === 'invest_lump_sum' && (
                <>
                  <NumberInput label="Lump Sum Amount" value={String(params.amount || '')} onChangeValue={(v, n) => setParams({ ...params, amount: n })} placeholder="5000" />
                  <NumberInput label="Expected Return (%/yr)" value={String(params.return_rate || '')} onChangeValue={(v, n) => setParams({ ...params, return_rate: n })} prefix="" suffix="%" placeholder="8" />
                </>
              )}
              {(type === 'cut_expense') && (
                <NumberInput label="Monthly Expense to Cut" value={String(params.monthly_amount || '')} onChangeValue={(v, n) => setParams({ ...params, monthly_amount: n })} placeholder="180" />
              )}
              {(type === 'retire_early') && (
                <NumberInput label="Target Savings Rate (%)" value={String(params.savings_rate || '')} onChangeValue={(v, n) => setParams({ ...params, savings_rate: n })} prefix="" suffix="%" placeholder="25" />
              )}
              {(type === 'relocate_country') && (
                <View style={styles.textInputWrap}>
                  <Text style={styles.textInputLabel}>Target City or Country</Text>
                  <TextInput
                    value={String(params.city ?? '')}
                    onChangeText={(v) => setParams({ ...params, city: v })}
                    placeholder="Medellin"
                    placeholderTextColor={Colors.slateGray}
                    style={styles.textInput}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                </View>
              )}
              {(type === 'relocate_city') && (
                <View style={styles.textInputWrap}>
                  <Text style={styles.textInputLabel}>Target US State</Text>
                  <TextInput
                    value={String(params.to_state ?? '')}
                    onChangeText={(v) => setParams({ ...params, to_state: v })}
                    placeholder="Texas"
                    placeholderTextColor={Colors.slateGray}
                    style={styles.textInput}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                </View>
              )}
              {(type === 'sell_asset') && (
                <NumberInput label="Lump Sum to Apply to Debt" value={String(params.sale_price || '')} onChangeValue={(v, n) => setParams({ ...params, sale_price: n })} placeholder="5000" />
              )}
              {(type === 'start_business') && (
                <>
                  <NumberInput label="Startup Cost" value={String(params.startup_cost || '')} onChangeValue={(v, n) => setParams({ ...params, startup_cost: n })} placeholder="5000" />
                  <NumberInput label="Monthly Revenue (Realistic)" value={String(params.monthly_revenue_realistic || '')} onChangeValue={(v, n) => setParams({ ...params, monthly_revenue_realistic: n })} placeholder="2000" />
                </>
              )}
              {(type === 'tax_optimization') && (
                <>
                  <NumberInput label="401k Annual Contribution" value={String(params.k401_contribution || '')} onChangeValue={(v, n) => setParams({ ...params, k401_contribution: n })} placeholder="23500" />
                  <NumberInput label="IRA Annual Contribution" value={String(params.ira_contribution || '')} onChangeValue={(v, n) => setParams({ ...params, ira_contribution: n })} placeholder="7000" />
                </>
              )}

              <Button title={isRunning ? 'Calculating...' : 'Run Scenario'} onPress={handleRunLocal} loading={isRunning} variant="primary" fullWidth size="lg" style={styles.runBtn} hapticIntent="medium" />
            </View>
          )}

          {/* Results */}
          {displayResult && (
            <View style={styles.results}>
              <Text style={styles.headline}>{displayResult.headline}</Text>
              <Text style={styles.narrative}>{displayResult.narrative}</Text>

              <View style={styles.metricsGrid}>
                {displayResult.keyMetrics?.map((m: any, i: number) => (
                  <Card key={i} style={styles.metricCard}>
                    <Text style={styles.metricLabel}>{m.label}</Text>
                    <Text style={[styles.metricValue, { color: m.positive ? Colors.profitGreen : Colors.debtCrimson }]}>
                      {m.value}
                    </Text>
                  </Card>
                ))}
              </View>

              <View style={styles.resultBtns}>
                <Button title="Share" onPress={onShare} variant="primary" />
                <Button title="Save Scenario" onPress={handleSaveScenario} variant="outline" hapticIntent="success" />
                <Button title="Try Another" onPress={() => { setLocalResult(null); setParams({}); }} variant="ghost" />
              </View>
            </View>
          )}
          {displayResult && (
            <View style={styles.shareOffscreen} pointerEvents="none">
              <ShareCard
                ref={shareRef}
                emoji={scenarioConfig.icon}
                subtitle="WHAT IF"
                title={shareTitle}
                primaryStat={sharePrimary}
                primaryStatLabel={shareFirstMetric?.label}
                secondaryStat={shareSecondMetric ? `${shareSecondMetric.label}: ${shareSecondMetric.value}` : undefined}
                theme="gold"
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  backText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.base, paddingBottom: 100 },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: Spacing.base },
  description: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, textAlign: 'center', marginBottom: Spacing.xxl, lineHeight: 22 },
  form: { gap: Spacing.md },
  runBtn: { marginTop: Spacing.base },
  results: { gap: Spacing.xl },
  headline: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleSmall, color: Colors.accentGold, textAlign: 'center' },
  narrative: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, lineHeight: 22, textAlign: 'center' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  metricCard: { padding: Spacing.md, alignItems: 'center', width: '47%' },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, textAlign: 'center' },
  metricValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodyMedium, textAlign: 'center' },
  resultBtns: { flexDirection: 'row', gap: Spacing.md, justifyContent: 'center', flexWrap: 'wrap' },
  // Rendered but positioned off-screen so react-native-view-shot can capture a
  // fully-laid-out card without showing it to the user.
  shareOffscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },
  textInputWrap: { marginBottom: Spacing.base },
  textInputLabel: { fontFamily: 'Inter_500Medium', fontSize: Typography.bodySmall, color: Colors.slateGray, marginBottom: Spacing.xs, letterSpacing: 0.5, textTransform: 'uppercase' },
  textInput: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    borderRadius: BorderRadius.md,
    minHeight: 48,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
  },
});
