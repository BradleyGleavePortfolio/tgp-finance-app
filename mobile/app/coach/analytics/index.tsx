/**
 * PracticeAnalyticsScreen — coach-level KPIs.
 *
 * Single round-trip via coachApi.getPracticeAnalytics. Displays:
 *   - Total clients
 *   - 30-day retention %
 *   - Average velocity score
 *   - 30-day EOD throughput
 *   - Roster total assets / total debt / net worth
 *
 * Stage 2 ships read-only analytics. Goal-funnel + conversion charts
 * land in Stage 3.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coachApi } from '../../../src/services/api';
import { colors, typography, spacing, radius } from '../../../src/theme/tokens';
import { formatCurrency } from '../../../src/utils/formatters';
import { CoachSkeleton } from '../../../src/components/coach/CoachSkeleton';
import { CoachEmptyState } from '../../../src/components/coach/CoachEmptyState';
import type { PracticeAnalytics } from '../../../src/types/coach';

export default function AnalyticsScreen() {
  const router = useRouter();
  const [data, setData] = useState<PracticeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await coachApi.getPracticeAnalytics();
      setData(r.data);
    } catch {
      setErr('We could not load practice analytics.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>ANALYTICS</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.stone} />
        }
      >
        <Text style={styles.eyebrow}>YOUR PRACTICE</Text>
        <Text style={styles.headline}>Analytics.</Text>
        <Text style={styles.lede}>
          A monthly view of your roster's engagement and the wealth you're stewarding.
        </Text>

        {loading ? (
          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            {[0, 1, 2, 3].map((i) => (
              <CoachSkeleton key={i} height={84} borderRadius={radius.lg} />
            ))}
          </View>
        ) : err ? (
          <CoachEmptyState
            tone="error"
            eyebrow="UNAVAILABLE"
            title="We couldn't load analytics."
            body={err}
            actionLabel="Retry"
            onAction={onRefresh}
          />
        ) : data ? (
          <>
            <View style={{ height: spacing.lg }} />
            <KpiTile
              label="Total clients"
              value={String(data.total_clients)}
              hint="Active roster"
            />
            <KpiTile
              label="30-day retention"
              value={`${data.retention_30d_pct}%`}
              hint="Clients with at least one check-in in the last 30 days"
            />
            <KpiTile
              label="Average velocity"
              value={String(data.avg_velocity_score)}
              hint="Out of 100. Higher = faster wealth-building per dollar earned."
            />
            <KpiTile
              label="Check-ins this month"
              value={String(data.eod_submissions_30d)}
              hint="Across all clients in the last 30 days"
            />

            <Text style={styles.sectionTitle}>ROSTER WEALTH</Text>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>NET WORTH UNDER CARE</Text>
              <Text style={styles.cardValue}>
                {formatCurrency(data.roster_net_worth, { decimals: 0 })}
              </Text>
              <View style={styles.cardSplit}>
                <View>
                  <Text style={styles.splitLabel}>ASSETS</Text>
                  <Text style={styles.splitValue}>
                    {formatCurrency(data.roster_total_assets, { decimals: 0 })}
                  </Text>
                </View>
                <View>
                  <Text style={styles.splitLabel}>DEBT</Text>
                  <Text style={[styles.splitValue, { color: colors.oxblood }]}>
                    {formatCurrency(data.roster_total_debt, { decimals: 0 })}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.footnote}>
              Practice-level analytics roll up nightly. Numbers are most accurate
              after every client has completed their check-in.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.kpiTile}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bone },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  eyebrow: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  headline: {
    ...typography.scale.h1,
    fontFamily: typography.families.serif,
    color: colors.ink,
    marginTop: 4,
  },
  lede: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
    marginTop: spacing.sm,
  },
  kpiTile: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  kpiLabel: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  kpiValue: {
    fontFamily: typography.families.serif,
    fontSize: 36,
    lineHeight: 42,
    color: colors.ink,
    marginVertical: 4,
  },
  kpiHint: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
  },
  sectionTitle: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardLabel: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  cardValue: {
    fontFamily: typography.families.serif,
    fontSize: 44,
    lineHeight: 50,
    color: colors.ink,
    marginVertical: spacing.sm,
  },
  cardSplit: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  splitLabel: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  splitValue: {
    fontFamily: typography.families.mono,
    fontSize: 18,
    color: colors.ink,
    marginTop: 4,
  },
  footnote: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
    marginTop: spacing.lg,
    fontStyle: 'italic',
  },
});
