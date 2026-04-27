// Spending DNA monthly reports
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { EmptyState } from '../src/components/ui/EmptyState';
import { Colors, Typography, Spacing } from '../src/theme/finance';
import { aiApi } from '../src/services/api';
import { formatCurrency, formatPercent } from '../src/utils/formatters';

interface DNAReport {
  month: string;
  paragraph_pattern: string;
  paragraph_leak: string;
  paragraph_action: string;
  avg_daily_card_spend: number;
  savings_rate_pct: number;
}

export default function SpendingDNAScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<DNAReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Load reports from local state or API
    // Mock a sample for UI
  }, []);

  const generateReport = async () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    setIsLoading(true);
    try {
      const { data } = await aiApi.getSpendingDNA(currentMonth);
      const paragraphs = (data.report_text || '').split(/\n\n+/);
      const parsed: DNAReport = {
        month: data.month || currentMonth,
        paragraph_pattern: paragraphs[0] || '',
        paragraph_leak: paragraphs[1] || '',
        paragraph_action: paragraphs[2] || '',
        avg_daily_card_spend: data.key_metrics?.avg_daily_card_spend ?? 0,
        savings_rate_pct: data.key_metrics?.avg_savings_rate_pct ?? 0,
      };
      setReports([parsed, ...reports]);
    } catch {
      // Silent failure
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Spending DNA</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>AI analysis of your monthly spending patterns.</Text>

        <Button
          title={isLoading ? 'Generating...' : "Generate This Month's Report"}
          onPress={generateReport}
          loading={isLoading}
          variant="primary"
          fullWidth
          style={styles.genBtn}
        />

        {reports.length === 0 ? (
          <EmptyState
            eyebrow="SPENDING DNA"
            title="No reports yet"
            description="Submit EOD check-ins for at least 7 days, then generate your Spending DNA report."
          />
        ) : (
          reports.map((report, i) => (
            <Card key={i} style={styles.reportCard}>
              <Text style={styles.reportMonth}>{report.month}</Text>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{formatCurrency(report.avg_daily_card_spend)}</Text>
                  <Text style={styles.statLabel}>Avg Daily Spend</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{report.savings_rate_pct.toFixed(0)}%</Text>
                  <Text style={styles.statLabel}>Savings Rate</Text>
                </View>
              </View>

              <View style={styles.paragraph}>
                <Text style={styles.paragraphTitle}>How You Spend</Text>
                <Text style={styles.paragraphText}>{report.paragraph_pattern}</Text>
              </View>

              <View style={styles.paragraph}>
                <Text style={styles.paragraphTitle}>Your Biggest Leak</Text>
                <Text style={styles.paragraphText}>{report.paragraph_leak}</Text>
              </View>

              <View style={styles.paragraph}>
                <Text style={styles.paragraphTitle}>Highest Impact Change</Text>
                <Text style={styles.paragraphText}>{report.paragraph_action}</Text>
              </View>
            </Card>
          ))
        )}
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
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, marginBottom: Spacing.xl },
  genBtn: { marginBottom: Spacing.xl },
  reportCard: { padding: Spacing.base, marginBottom: Spacing.base, gap: Spacing.md },
  reportMonth: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleSmall, color: Colors.accentGold },
  statsRow: { flexDirection: 'row', gap: Spacing.xl },
  stat: { gap: 2 },
  statValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  paragraph: { gap: Spacing.xs },
  paragraphTitle: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.accentGold },
  paragraphText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.frostWhite, lineHeight: 20 },
});
