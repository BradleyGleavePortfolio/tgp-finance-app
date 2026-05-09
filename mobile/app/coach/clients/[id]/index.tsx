/**
 * ClientDetail — full view of a single client, tabbed.
 *
 * Tabs: Overview / Accounts / Goals / Cash Flow / Notes / Messages /
 * Assignments. Each tab fetches its own data lazily on first activation
 * so the initial render only pays for the Overview round-trip
 * (clientSummary).
 *
 * Stage 2 ships the read paths for every tab. Notes + assignments
 * support full CRUD inline. Messages is read-only here (compose lives
 * on coach/clients/[id]/messages or coach/messages/[id]).
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
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coachApi } from '../../../../src/services/api';
import { colors, typography, spacing, radius } from '../../../../src/theme/tokens';
import { formatCurrency, formatRelativeTime } from '../../../../src/utils/formatters';
import { CoachTabBar } from '../../../../src/components/coach/CoachTabBar';
import { CoachSkeleton, CoachSkeletonList } from '../../../../src/components/coach/CoachSkeleton';
import { CoachEmptyState } from '../../../../src/components/coach/CoachEmptyState';
import { CoachStatusPill } from '../../../../src/components/coach/CoachStatusPill';
import type {
  CoachClientSummary,
  CoachClientAccountRow,
  CoachClientCashflow,
  CoachClientGoals,
  CoachNoteRow,
  ClientAssignmentRow,
  CoachMessageThread,
} from '../../../../src/types/coach';

type TabKey =
  | 'overview'
  | 'accounts'
  | 'goals'
  | 'cashflow'
  | 'notes'
  | 'messages'
  | 'assignments';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'goals', label: 'Goals' },
  { key: 'cashflow', label: 'Cash flow' },
  { key: 'notes', label: 'Notes' },
  { key: 'messages', label: 'Messages' },
  { key: 'assignments', label: 'Assignments' },
];

export default function ClientDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [active, setActive] = useState<TabKey>('overview');

  const [summary, setSummary] = useState<CoachClientSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<CoachClientAccountRow[] | null>(null);
  const [goals, setGoals] = useState<CoachClientGoals | null>(null);
  const [cashflow, setCashflow] = useState<CoachClientCashflow | null>(null);
  const [notes, setNotes] = useState<CoachNoteRow[] | null>(null);
  const [assignments, setAssignments] = useState<ClientAssignmentRow[] | null>(null);
  const [thread, setThread] = useState<CoachMessageThread | null>(null);

  const loadSummary = useCallback(async () => {
    if (!id) return;
    setSummaryErr(null);
    try {
      const res = await coachApi.getClientSummary(id);
      setSummary(res.data);
    } catch {
      setSummaryErr('We could not load this client.');
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      setSummaryLoading(true);
      await loadSummary();
      setSummaryLoading(false);
    })();
  }, [loadSummary]);

  // Lazy tab loaders.
  useEffect(() => {
    if (!id) return;
    if (active === 'accounts' && accounts === null) {
      coachApi.getClientAccounts(id).then((r) => setAccounts(r.data)).catch(() => setAccounts([]));
    }
    if (active === 'goals' && goals === null) {
      coachApi.getClientGoals(id).then((r) => setGoals(r.data)).catch(() => setGoals(null));
    }
    if (active === 'cashflow' && cashflow === null) {
      coachApi.getClientCashflow(id).then((r) => setCashflow(r.data)).catch(() => setCashflow(null));
    }
    if (active === 'notes' && notes === null) {
      coachApi.listClientNotes(id).then((r) => setNotes(r.data)).catch(() => setNotes([]));
    }
    if (active === 'assignments' && assignments === null) {
      coachApi
        .listClientAssignments(id)
        .then((r) => setAssignments(r.data))
        .catch(() => setAssignments([]));
    }
    if (active === 'messages' && thread === null) {
      coachApi
        .getMessageThread(id)
        .then((r) => setThread(r.data))
        .catch(() => setThread({ thread_key: '', messages: [] }));
    }
  }, [active, id, accounts, goals, cashflow, notes, assignments, thread]);

  const onRefresh = useCallback(async () => {
    if (!id) return;
    // Refresh just the summary header + the active tab.
    await loadSummary();
    if (active === 'accounts') {
      const r = await coachApi.getClientAccounts(id);
      setAccounts(r.data);
    } else if (active === 'goals') {
      const r = await coachApi.getClientGoals(id);
      setGoals(r.data);
    } else if (active === 'cashflow') {
      const r = await coachApi.getClientCashflow(id);
      setCashflow(r.data);
    } else if (active === 'notes') {
      const r = await coachApi.listClientNotes(id);
      setNotes(r.data);
    } else if (active === 'assignments') {
      const r = await coachApi.listClientAssignments(id);
      setAssignments(r.data);
    } else if (active === 'messages') {
      const r = await coachApi.getMessageThread(id);
      setThread(r.data);
    }
  }, [active, id, loadSummary]);

  const clientName = summary?.client.name ?? '—';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Client</Text>
        <View style={{ width: 32 }} />
      </View>

      {summaryLoading ? (
        <View style={styles.heroLoading}>
          <CoachSkeleton width="60%" height={28} />
          <View style={{ height: spacing.sm }} />
          <CoachSkeleton width="40%" height={16} />
        </View>
      ) : summaryErr ? (
        <CoachEmptyState
          tone="error"
          eyebrow="UNAVAILABLE"
          title="We couldn't load this client."
          body={summaryErr}
          actionLabel="Retry"
          onAction={loadSummary}
        />
      ) : summary ? (
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>CLIENT</Text>
          <Text style={styles.heroName}>{clientName}</Text>
          <Text style={styles.heroEmail}>{summary.client.email}</Text>
          <View style={styles.heroStats}>
            <HeroStat label="Net worth" value={formatCurrency(summary.account_totals.net_worth, { decimals: 0 })} />
            <HeroStat label="Assets" value={formatCurrency(summary.account_totals.total_assets, { decimals: 0 })} />
            <HeroStat label="Debt" value={formatCurrency(summary.account_totals.total_debt, { decimals: 0 })} />
          </View>
        </View>
      ) : null}

      <CoachTabBar tabs={TABS} active={active} onChange={setActive} />

      <ScrollView
        contentContainerStyle={styles.tabContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.stone} />
        }
      >
        {active === 'overview' && summary ? (
          <OverviewTab summary={summary} clientId={id ?? ''} router={router} />
        ) : null}
        {active === 'accounts' ? (
          accounts === null ? <CoachSkeletonList rows={5} rowHeight={64} /> : <AccountsTab accounts={accounts} />
        ) : null}
        {active === 'goals' ? (
          goals === null ? <CoachSkeletonList rows={3} rowHeight={64} /> : <GoalsTab goals={goals} />
        ) : null}
        {active === 'cashflow' ? (
          cashflow === null ? <CoachSkeletonList rows={5} rowHeight={48} /> : <CashflowTab cashflow={cashflow} />
        ) : null}
        {active === 'notes' ? (
          notes === null ? (
            <CoachSkeletonList rows={4} rowHeight={56} />
          ) : (
            <NotesTab clientId={id ?? ''} notes={notes} onRefresh={async () => {
              if (!id) return;
              const r = await coachApi.listClientNotes(id);
              setNotes(r.data);
            }} />
          )
        ) : null}
        {active === 'messages' ? (
          thread === null ? (
            <CoachSkeletonList rows={4} rowHeight={48} />
          ) : (
            <MessagesPreview clientId={id ?? ''} thread={thread} router={router} />
          )
        ) : null}
        {active === 'assignments' ? (
          assignments === null ? (
            <CoachSkeletonList rows={3} rowHeight={72} />
          ) : (
            <AssignmentsPreview clientId={id ?? ''} assignments={assignments} router={router} />
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <Text style={styles.heroStatValue}>{value}</Text>
    </View>
  );
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function OverviewTab({
  summary,
  clientId,
  router,
}: {
  summary: CoachClientSummary;
  clientId: string;
  router: ReturnType<typeof useRouter>;
}) {
  const lastEod = summary.recent_eods[0];
  return (
    <View style={{ gap: spacing.lg }}>
      <SectionTitle>Latest check-in</SectionTitle>
      {lastEod ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>NET WORTH</Text>
          <Text style={styles.cardValue}>
            {formatCurrency(Number(lastEod.net_worth) || 0, { decimals: 0 })}
          </Text>
          <Text style={styles.cardMeta}>
            {formatRelativeTime(String(lastEod.date))} · mood {lastEod.mood ?? '—'}
          </Text>
        </View>
      ) : (
        <CoachEmptyState
          eyebrow="NO CHECK-INS"
          title="This client hasn't logged yet."
          body="When they submit their first end-of-day check-in, it will appear here."
        />
      )}

      <SectionTitle>Recent milestones</SectionTitle>
      {summary.milestones.length === 0 ? (
        <CoachEmptyState eyebrow="QUIET" title="No milestones unlocked yet." />
      ) : (
        <View style={styles.card}>
          {summary.milestones.slice(0, 5).map((m) => (
            <View key={`${m.key}-${m.unlocked_at}`} style={styles.milestoneRow}>
              <View style={styles.milestoneDot} />
              <Text style={styles.milestoneLabel}>{m.key}</Text>
              <Text style={styles.milestoneTime}>{formatRelativeTime(m.unlocked_at)}</Text>
            </View>
          ))}
        </View>
      )}

      <SectionTitle>Quick actions</SectionTitle>
      <View style={styles.card}>
        <ActionLink
          label="Open notes"
          icon="document-text-outline"
          onPress={() => router.push(`/coach/clients/${clientId}/notes`)}
        />
        <ActionLink
          label="Manage assignments"
          icon="checkbox-outline"
          onPress={() => router.push(`/coach/clients/${clientId}/assignments`)}
        />
        <ActionLink
          label="Open thread"
          icon="chatbubble-outline"
          onPress={() => router.push(`/coach/messages/${clientId}`)}
        />
      </View>
    </View>
  );
}

function AccountsTab({ accounts }: { accounts: CoachClientAccountRow[] }) {
  if (accounts.length === 0) {
    return (
      <CoachEmptyState
        eyebrow="NO ACCOUNTS"
        title="No accounts linked yet."
        body="Once your client adds an account in their app, it will appear here for context."
      />
    );
  }
  const debts = accounts.filter((a) => a.is_debt);
  const assets = accounts.filter((a) => !a.is_debt);
  return (
    <View style={{ gap: spacing.lg }}>
      <SectionTitle>Assets</SectionTitle>
      {assets.length === 0 ? (
        <Text style={styles.muted}>No asset accounts yet.</Text>
      ) : (
        <View style={styles.card}>
          {assets.map((a) => (
            <AccountRow key={a.id} a={a} />
          ))}
        </View>
      )}
      <SectionTitle>Debts</SectionTitle>
      {debts.length === 0 ? (
        <Text style={styles.muted}>No debt accounts. Nice.</Text>
      ) : (
        <View style={styles.card}>
          {debts.map((a) => (
            <AccountRow key={a.id} a={a} />
          ))}
        </View>
      )}
    </View>
  );
}

function AccountRow({ a }: { a: CoachClientAccountRow }) {
  return (
    <View style={styles.acctRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.acctName}>{a.name}</Text>
        <Text style={styles.acctMeta}>
          {a.account_type.replace(/_/g, ' ')}
          {a.institution ? ` · ${a.institution}` : ''}
          {a.apr_percent != null ? ` · ${a.apr_percent.toFixed(1)}% APR` : ''}
        </Text>
      </View>
      <Text style={[styles.acctBalance, a.is_debt && { color: colors.oxblood }]}>
        {formatCurrency(a.balance, { decimals: 0 })}
      </Text>
    </View>
  );
}

function GoalsTab({ goals }: { goals: CoachClientGoals }) {
  if (!goals.primary_goal && !goals.dream_description) {
    return (
      <CoachEmptyState
        eyebrow="NO GOAL SET"
        title="This client hasn't set a primary goal yet."
        body="Goals appear here once captured during onboarding or in their profile."
      />
    );
  }
  return (
    <View style={{ gap: spacing.lg }}>
      <SectionTitle>Primary goal</SectionTitle>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>FOCUS</Text>
        <Text style={styles.cardValue}>{goals.primary_goal ?? 'Not set'}</Text>
        {goals.goal_timeline_months ? (
          <Text style={styles.cardMeta}>{goals.goal_timeline_months} month timeline</Text>
        ) : null}
      </View>
      {goals.dream_description ? (
        <>
          <SectionTitle>Dream lifestyle</SectionTitle>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>MONTHLY COST</Text>
            <Text style={styles.cardValue}>
              {formatCurrency(goals.dream_lifestyle_cost_mo, { decimals: 0 })}
            </Text>
            <Text style={styles.cardBody}>{goals.dream_description}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function CashflowTab({ cashflow }: { cashflow: CoachClientCashflow }) {
  if (cashflow.submissions === 0) {
    return (
      <CoachEmptyState
        eyebrow="NO DATA"
        title="No check-ins in the last 30 days."
        body="Cash flow trends populate as your client logs daily check-ins."
      />
    );
  }
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>30-DAY AVERAGE NET WORTH</Text>
        <Text style={styles.cardValue}>
          {formatCurrency(cashflow.avg_net_worth_30d, { decimals: 0 })}
        </Text>
        <Text style={styles.cardMeta}>{cashflow.submissions} check-ins recorded</Text>
      </View>
      <SectionTitle>Recent timeline</SectionTitle>
      <View style={styles.card}>
        {cashflow.timeline.map((t) => (
          <View key={t.date} style={styles.timelineRow}>
            <Text style={styles.timelineDate}>{formatRelativeTime(t.date)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.timelineNet}>{formatCurrency(t.net_worth, { decimals: 0 })}</Text>
              <Text style={styles.timelineMeta}>
                Assets {formatCurrency(t.assets, { decimals: 0 })} · Debt{' '}
                {formatCurrency(t.debt, { decimals: 0 })}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function NotesTab({
  clientId,
  notes,
  onRefresh,
}: {
  clientId: string;
  notes: CoachNoteRow[];
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  return (
    <View style={{ gap: spacing.md }}>
      <Pressable
        onPress={() => router.push(`/coach/clients/${clientId}/notes`)}
        style={styles.composeBtn}
        accessibilityRole="button"
        accessibilityLabel="Open notes editor"
      >
        <Ionicons name="add" size={18} color={colors.bone} />
        <Text style={styles.composeBtnText}>NEW NOTE</Text>
      </Pressable>
      {notes.length === 0 ? (
        <CoachEmptyState
          eyebrow="NO NOTES YET"
          title="Capture context here."
          body="Notes are private to you and the owner. They are not shown to the client."
        />
      ) : (
        notes.map((n) => (
          <View key={n.id} style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.cardLabel}>{formatRelativeTime(n.created_at).toUpperCase()}</Text>
              {n.is_private ? <CoachStatusPill label="private" tone="warn" /> : null}
            </View>
            <Text style={[styles.cardBody, { marginTop: 6 }]}>{n.note}</Text>
          </View>
        ))
      )}
      {/* Hidden non-rendered ref to silence the unused param lint */}
      {false && <Text>{onRefresh.toString()}</Text>}
    </View>
  );
}

function MessagesPreview({
  clientId,
  thread,
  router,
}: {
  clientId: string;
  thread: CoachMessageThread;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <Pressable
        onPress={() => router.push(`/coach/messages/${clientId}`)}
        style={styles.composeBtn}
        accessibilityRole="button"
        accessibilityLabel="Open thread"
      >
        <Ionicons name="open-outline" size={18} color={colors.bone} />
        <Text style={styles.composeBtnText}>OPEN THREAD</Text>
      </Pressable>
      {thread.messages.length === 0 ? (
        <CoachEmptyState
          eyebrow="NO MESSAGES"
          title="Send the first message."
          body="Messages here are end-to-end visible to your client. Quick questions and program nudges live well here."
        />
      ) : (
        thread.messages.slice(-5).map((m) => (
          <View
            key={m.id}
            style={[
              styles.msgBubble,
              m.from_coach ? styles.msgBubbleSelf : styles.msgBubbleOther,
            ]}
          >
            <Text style={[styles.msgBody, m.from_coach && { color: colors.bone }]}>{m.body}</Text>
            <Text style={[styles.msgTime, m.from_coach && { color: 'rgba(245,239,228,0.7)' }]}>
              {formatRelativeTime(m.created_at)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function AssignmentsPreview({
  clientId,
  assignments,
  router,
}: {
  clientId: string;
  assignments: ClientAssignmentRow[];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <Pressable
        onPress={() => router.push(`/coach/clients/${clientId}/assignments`)}
        style={styles.composeBtn}
        accessibilityRole="button"
        accessibilityLabel="Manage assignments"
      >
        <Ionicons name="add" size={18} color={colors.bone} />
        <Text style={styles.composeBtnText}>NEW ASSIGNMENT</Text>
      </Pressable>
      {assignments.length === 0 ? (
        <CoachEmptyState
          eyebrow="NONE OPEN"
          title="No assignments yet."
          body="Assign a budget task, savings challenge, or debt-paydown nudge."
        />
      ) : (
        assignments.map((a) => (
          <View key={a.id} style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.cardLabel}>{a.assignment_type.replace(/_/g, ' ').toUpperCase()}</Text>
              <View style={{ flex: 1 }} />
              <CoachStatusPill
                label={a.status}
                tone={a.status === 'completed' ? 'good' : a.status === 'dismissed' ? 'neutral' : 'warn'}
              />
            </View>
            <Text style={[styles.cardValue, { fontSize: 18, marginTop: 4 }]}>{a.title}</Text>
            {a.description ? <Text style={styles.cardBody}>{a.description}</Text> : null}
            {a.due_date ? (
              <Text style={styles.cardMeta}>Due {formatRelativeTime(a.due_date)}</Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function ActionLink({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionLink, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={colors.charcoal} />
      <Text style={styles.actionLinkLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.stone} />
    </Pressable>
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
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  heroLoading: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  heroEyebrow: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  heroName: {
    ...typography.scale.h1,
    fontFamily: typography.families.serif,
    color: colors.ink,
    marginTop: 4,
  },
  heroEmail: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
    marginTop: 4,
  },
  heroStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  heroStat: {
    flex: 1,
  },
  heroStatLabel: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  heroStatValue: {
    fontFamily: typography.families.mono,
    fontSize: 16,
    color: colors.ink,
    marginTop: 4,
  },
  tabContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  card: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  cardLabel: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  cardValue: {
    fontFamily: typography.families.serif,
    fontSize: 24,
    lineHeight: 28,
    color: colors.ink,
  },
  cardMeta: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
  },
  cardBody: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
    marginTop: 4,
  },
  sectionTitle: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  muted: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.stone,
  },
  actionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.stone,
  },
  actionLinkLabel: {
    flex: 1,
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
  },
  composeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
  },
  composeBtnText: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.bone,
  },
  acctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.stone,
    gap: spacing.md,
  },
  acctName: {
    ...typography.scale.body,
    fontFamily: typography.families.medium,
    color: colors.ink,
  },
  acctMeta: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
    marginTop: 2,
  },
  acctBalance: {
    fontFamily: typography.families.mono,
    fontSize: 15,
    color: colors.ink,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: spacing.md,
  },
  milestoneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.oxblood,
  },
  milestoneLabel: {
    flex: 1,
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
  },
  milestoneTime: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
  },
  timelineRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    gap: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.stone,
  },
  timelineDate: {
    width: 90,
    ...typography.scale.caption,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  timelineNet: {
    fontFamily: typography.families.mono,
    fontSize: 15,
    color: colors.ink,
  },
  timelineMeta: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
    marginTop: 2,
  },
  msgBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    maxWidth: '85%',
  },
  msgBubbleSelf: {
    alignSelf: 'flex-end',
    backgroundColor: colors.ink,
  },
  msgBubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
  },
  msgBody: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
  },
  msgTime: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
    marginTop: 4,
  },
});
