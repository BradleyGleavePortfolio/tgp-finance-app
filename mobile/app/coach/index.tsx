/**
 * CoachHome — practice dashboard at /coach.
 *
 * One round-trip via coachApi.getDashboard(). Shows roster stats, a
 * "needs attention" list (overdue check-ins by severity), and a recent
 * activity feed (EOD submissions + milestone unlocks).
 *
 * Quick actions surface the four most common coach intents:
 *   - Open the clients list
 *   - Compose a community post
 *   - Review messages
 *   - Open practice analytics
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { coachApi } from '../../src/services/api';
import { colors, typography, spacing, radius } from '../../src/theme/tokens';
import { formatCurrency, formatRelativeTime } from '../../src/utils/formatters';
import { CoachSkeleton, CoachSkeletonList } from '../../src/components/coach/CoachSkeleton';
import { CoachEmptyState } from '../../src/components/coach/CoachEmptyState';
import { CoachStatusPill } from '../../src/components/coach/CoachStatusPill';
import type { CoachDashboardResponse } from '../../src/types/coach';

export default function CoachHomeScreen() {
  const router = useRouter();
  const [data, setData] = useState<CoachDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await coachApi.getDashboard();
      setData(res.data);
    } catch (e) {
      setErr('We could not load your dashboard. Pull to retry.');
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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.stone} />
        }
      >
        {/* Hero */}
        <Text style={styles.eyebrow}>YOUR PRACTICE</Text>
        <Text style={styles.headline}>Coach home.</Text>

        {/* Stats grid */}
        {loading ? (
          <View style={styles.statsGrid}>
            {[0, 1, 2, 3].map((i) => (
              <CoachSkeleton key={i} height={86} borderRadius={radius.lg} style={styles.statTileSkel} />
            ))}
          </View>
        ) : data ? (
          <View style={styles.statsGrid}>
            <StatTile label="Clients" value={String(data.stats.total_clients)} hint="active roster" />
            <StatTile
              label="Active this week"
              value={String(data.stats.active_this_week)}
              hint={`${data.stats.total_clients > 0 ? Math.round((data.stats.active_this_week / data.stats.total_clients) * 100) : 0}%`}
            />
            <StatTile
              label="Needs attention"
              value={String(data.stats.needs_attention)}
              hint={data.stats.needs_attention > 0 ? 'review below' : 'all caught up'}
              accent={data.stats.needs_attention > 0}
            />
            <StatTile
              label="Open assignments"
              value={String(data.stats.open_assignments)}
              hint="across roster"
            />
          </View>
        ) : null}

        {/* Roster net worth band */}
        {data ? (
          <View style={styles.rosterBand}>
            <Text style={styles.rosterLabel}>Roster net worth tracked</Text>
            <Text style={styles.rosterValue}>
              {formatCurrency(data.stats.roster_net_worth, { decimals: 0 })}
            </Text>
            <Text style={styles.rosterMeta}>
              Assets {formatCurrency(data.stats.roster_total_assets, { decimals: 0 })} ·
              {' '}Debt {formatCurrency(data.stats.roster_total_debt, { decimals: 0 })}
            </Text>
          </View>
        ) : null}

        {/* Quick actions */}
        <Text style={styles.sectionEyebrow}>QUICK ACTIONS</Text>
        <View style={styles.quickActions}>
          <ActionRow
            icon="people-outline"
            label="Open client roster"
            onPress={() => router.push('/coach/clients')}
          />
          <ActionRow
            icon="chatbubble-ellipses-outline"
            label="Review messages"
            onPress={() => router.push('/coach/messages')}
          />
          <ActionRow
            icon="megaphone-outline"
            label="Compose community post"
            onPress={() => router.push('/coach/community/new')}
          />
          <ActionRow
            icon="bar-chart-outline"
            label="Practice analytics"
            onPress={() => router.push('/coach/analytics')}
          />
        </View>

        {/* Needs attention */}
        <Text style={styles.sectionEyebrow}>CLIENTS NEEDING ATTENTION</Text>
        {loading ? (
          <CoachSkeletonList rows={3} rowHeight={56} />
        ) : err ? (
          <CoachEmptyState
            tone="error"
            eyebrow="SOMETHING WENT WRONG"
            title="We couldn't load this section."
            body={err}
            actionLabel="Retry"
            onAction={onRefresh}
          />
        ) : !data || data.clients_needing_attention.length === 0 ? (
          <CoachEmptyState
            eyebrow="NO ACTION REQUIRED"
            title="Everyone is on track."
            body="Your clients have all checked in within the last week."
          />
        ) : (
          <View style={styles.attentionList}>
            {data.clients_needing_attention.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/coach/clients/${c.id}`)}
                style={({ pressed }) => [styles.attentionRow, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${c.name}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{c.name}</Text>
                  <Text style={styles.attentionReason}>{c.reason}</Text>
                </View>
                <CoachStatusPill
                  label={c.severity === 'high' ? 'urgent' : 'review'}
                  tone={c.severity === 'high' ? 'bad' : 'warn'}
                />
              </Pressable>
            ))}
          </View>
        )}

        {/* Recent activity */}
        <Text style={styles.sectionEyebrow}>RECENT ACTIVITY</Text>
        {loading ? (
          <CoachSkeletonList rows={3} rowHeight={48} />
        ) : !data || data.recent_activity.length === 0 ? (
          <CoachEmptyState
            eyebrow="QUIET WEEK"
            title="No new activity yet."
            body="Once your clients submit check-ins or hit milestones, they'll show up here."
          />
        ) : (
          <View style={styles.activityList}>
            {data.recent_activity.map((a, idx) => (
              <View key={`${a.kind}-${a.client_id}-${idx}`} style={styles.activityRow}>
                <View style={styles.activityDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityClient}>{a.client_name}</Text>
                  <Text style={styles.activitySummary}>{a.summary}</Text>
                </View>
                <Text style={styles.activityTime}>{formatRelativeTime(a.at)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.statTile, accent && styles.statTileAccent]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: colors.oxblood }]}>{value}</Text>
      <Text style={styles.statHint}>{hint}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={colors.charcoal} />
      <Text style={styles.actionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.stone} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bone },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
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
    marginBottom: spacing.xl,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statTileSkel: {
    width: '48%',
  },
  statTile: {
    width: '48%',
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  statTileAccent: {
    borderColor: colors.oxblood,
  },
  statLabel: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  statValue: {
    fontFamily: typography.families.mono,
    fontSize: 26,
    lineHeight: 30,
    color: colors.ink,
  },
  statHint: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
  },
  rosterBand: {
    marginVertical: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bone,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: colors.stone,
  },
  rosterLabel: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
    marginBottom: 4,
  },
  rosterValue: {
    fontFamily: typography.families.serif,
    fontSize: 36,
    lineHeight: 40,
    color: colors.ink,
  },
  rosterMeta: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
    marginTop: 4,
  },
  sectionEyebrow: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  quickActions: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.stone,
  },
  actionLabel: {
    flex: 1,
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
  },
  attentionList: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.stone,
  },
  clientName: {
    ...typography.scale.body,
    fontFamily: typography.families.medium,
    color: colors.ink,
  },
  attentionReason: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
    marginTop: 2,
  },
  activityList: {
    gap: spacing.sm,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.oxblood,
  },
  activityClient: {
    ...typography.scale.body,
    fontFamily: typography.families.medium,
    color: colors.ink,
  },
  activitySummary: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
  },
  activityTime: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
  },
});
