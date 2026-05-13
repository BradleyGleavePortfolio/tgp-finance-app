// Spending DNA monthly reports
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { EmptyState } from '../src/components/ui/EmptyState';
import { colors, typography, spacing } from '../src/theme/tokens';
import { aiApi } from '../src/services/api';
import { formatCurrency } from '../src/utils/formatters';
import { errorMessage } from '../src/lib/errorMessage';

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load reports from local state or API
    // Mock a sample for UI
  }, []);

  const generateReport = async () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    setIsLoading(true);
    setError(null);
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
    } catch (err) {
      setError(
        errorMessage(
          err,
          "We couldn't generate a Spending DNA report right now. Please try again in a moment.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Spending DNA</Text>
        <View style={{ width: 32 }} />
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

        {error ? (
          <View style={styles.errorBanner} accessibilityLiveRegion="polite">
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

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
  container: { flex: 1, backgroundColor: colors.bone },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.base },
  backBtn: { width: 32, alignItems: 'flex-start' },
  title: { fontFamily: typography.families.medium, ...typography.scale.bodyMd, color: colors.ink },
  content: { padding: spacing.base, paddingBottom: 100 },
  subtitle: { fontFamily: typography.families.regular, ...typography.scale.body, color: colors.stone, marginBottom: spacing.xl },
  genBtn: { marginBottom: spacing.xl },
  reportCard: { padding: spacing.base, marginBottom: spacing.base, gap: spacing.md },
  reportMonth: { fontFamily: typography.families.medium, ...typography.scale.bodyMd, color: colors.oxblood },
  statsRow: { flexDirection: 'row', gap: spacing.xl },
  stat: { gap: 2 },
  statValue: { fontFamily: typography.families.mono, fontSize: 16, lineHeight: 22, color: colors.ink },
  statLabel: { fontFamily: typography.families.regular, ...typography.scale.caption, color: colors.stone },
  paragraph: { gap: spacing.xs },
  paragraphTitle: { fontFamily: typography.families.medium, ...typography.scale.eyebrow, color: colors.oxblood },
  paragraphText: { fontFamily: typography.families.regular, ...typography.scale.bodySmall, color: colors.ink, lineHeight: 20 },
  errorBanner: {
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.cream,
    borderLeftWidth: 3,
    borderLeftColor: colors.oxblood,
  },
  errorBannerText: {
    fontFamily: typography.families.regular,
    ...typography.scale.bodySmall,
    color: colors.oxblood,
    lineHeight: 20,
  },
});
