/**
 * ClientsList — EHR-style searchable / filterable / sortable roster.
 *
 * Loads /api/coach/clients on mount + on every filter/sort change. Search
 * is client-side debounced 220ms then re-fetches (the backend does the
 * actual filtering).
 *
 * Status filter: all / active / at_risk / onboarding / inactive.
 * Sort: last_activity (default) / name / net_worth / savings_rate.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coachApi } from '../../../src/services/api';
import { colors, typography, spacing, radius } from '../../../src/theme/tokens';
import { formatCurrency } from '../../../src/utils/formatters';
import { CoachSearchBar } from '../../../src/components/coach/CoachSearchBar';
import { CoachStatusPill } from '../../../src/components/coach/CoachStatusPill';
import { CoachSkeletonList } from '../../../src/components/coach/CoachSkeleton';
import { CoachEmptyState } from '../../../src/components/coach/CoachEmptyState';
import type {
  CoachClientRow,
  ClientStatus,
  ClientSortKey,
} from '../../../src/types/coach';

type StatusFilter = 'all' | ClientStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'at_risk', label: 'At risk' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'inactive', label: 'Inactive' },
];

const SORT_OPTIONS: { key: ClientSortKey; label: string }[] = [
  { key: 'last_activity', label: 'Recent activity' },
  { key: 'name', label: 'Name' },
  { key: 'net_worth', label: 'Net worth' },
  { key: 'savings_rate', label: 'Velocity' },
];

function statusTone(status: ClientStatus): 'good' | 'warn' | 'bad' | 'neutral' {
  switch (status) {
    case 'active':
      return 'good';
    case 'at_risk':
      return 'warn';
    case 'inactive':
      return 'bad';
    case 'onboarding':
    default:
      return 'neutral';
  }
}

export default function ClientsListScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<ClientSortKey>('last_activity');
  const [clients, setClients] = useState<CoachClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Debounce the search box so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 220);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await coachApi.getClients({
        search: debouncedSearch.trim() || undefined,
        status,
        sort,
      });
      setClients(res.data.clients);
    } catch {
      setErr('We could not load your roster. Pull to retry.');
    }
  }, [debouncedSearch, status, sort]);

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

  const headerComponent = useMemo(
    () => (
      <View style={styles.headerWrap}>
        <Text style={styles.eyebrow}>YOUR ROSTER</Text>
        <Text style={styles.headline}>Clients.</Text>
        <View style={{ marginTop: spacing.lg }}>
          <CoachSearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={{ marginTop: spacing.md }}
        >
          {STATUS_FILTERS.map((f) => {
            const active = f.key === status;
            return (
              <Pressable
                key={f.key}
                onPress={() => setStatus(f.key)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter: ${f.label}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={{ marginTop: 8 }}
        >
          {SORT_OPTIONS.map((s) => {
            const active = s.key === sort;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSort(s.key)}
                style={[styles.sortChip, active && styles.sortChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Sort by ${s.label}`}
              >
                <Ionicons
                  name="swap-vertical-outline"
                  size={14}
                  color={active ? colors.ink : colors.stone}
                />
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    ),
    [search, status, sort],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        ListHeaderComponent={headerComponent}
        data={loading ? [] : clients}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ClientRow item={item} onPress={() => router.push(`/coach/clients/${item.id}`)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.stone} />
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
              <CoachSkeletonList rows={6} rowHeight={72} />
            </View>
          ) : err ? (
            <CoachEmptyState
              tone="error"
              eyebrow="SOMETHING WENT WRONG"
              title="We couldn't load your roster."
              body={err}
              actionLabel="Retry"
              onAction={onRefresh}
            />
          ) : (
            <CoachEmptyState
              eyebrow={status === 'all' ? 'NO CLIENTS YET' : 'NO MATCHES'}
              title={
                status === 'all'
                  ? 'Your practice is empty.'
                  : 'No clients match this filter.'
              }
              body={
                status === 'all'
                  ? 'Send an invite code to your first client and they will appear here.'
                  : 'Try widening the filter, or clearing the search.'
              }
            />
          )
        }
      />
    </SafeAreaView>
  );
}

function ClientRow({ item, onPress }: { item: CoachClientRow; onPress: () => void }) {
  const sub = item.primary_goal ? `Goal: ${item.primary_goal}` : 'No goal set';
  const lastSeen =
    item.days_since_last_checkin === null
      ? 'No check-ins yet'
      : item.days_since_last_checkin === 0
        ? 'Checked in today'
        : `${item.days_since_last_checkin}d since last check-in`;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
        <Text style={styles.rowMeta}>{lastSeen}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowMoney}>{formatCurrency(item.net_worth, { decimals: 0 })}</Text>
        <CoachStatusPill label={item.status.replace('_', ' ')} tone={statusTone(item.status)} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bone },
  listContent: {
    paddingBottom: spacing['4xl'],
  },
  headerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
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
  filterRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.stone,
    backgroundColor: colors.cream,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    ...typography.scale.caption,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  chipTextActive: {
    color: colors.bone,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: 'transparent',
  },
  sortChipActive: {
    borderColor: colors.stone,
    backgroundColor: colors.cream,
  },
  sortChipText: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
  },
  sortChipTextActive: {
    color: colors.ink,
    fontFamily: typography.families.medium,
  },
  rowSeparator: {
    height: 0.5,
    backgroundColor: colors.stone,
    marginHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowName: {
    ...typography.scale.body,
    fontFamily: typography.families.medium,
    color: colors.ink,
  },
  rowSub: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
    marginTop: 2,
  },
  rowMeta: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  rowMoney: {
    fontFamily: typography.families.mono,
    fontSize: 14,
    color: colors.ink,
  },
});
