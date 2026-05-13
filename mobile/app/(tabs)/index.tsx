// Home — Luxury Hero Screen (Wave 3)
// Spec: deep navy bg · single 56pt net worth · stone eyebrow · thin oxblood chart
//       soft interest line · three text-link actions
//
// Contrast note (DESIGN.md §1):
//   The eyebrow was originally oxblood-on-navy. That pairing measures
//   1.11:1 contrast — below WCAG large-text minimum (3:1) — and the
//   meta line was illegible on device. The doctrine permits exactly
//   one oxblood accent per screen, and on this hero that accent is
//   the chart line. Eyebrow demoted to colors.stone (6.17:1, AA),
//   which is already the doctrine's tertiary/meta colour and is
//   reused below for the chevrons and the interest line.
//   Palette unchanged; no new tokens introduced.
import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../../src/theme/tokens';
import { CelebrationModal } from '../../src/components/milestones/CelebrationModal';
import { NetWorthChart } from '../../src/components/charts/NetWorthChart';
import { ScreenErrorBoundary } from '../../src/components/ui/ScreenErrorBoundary';
import { useAccountsStore } from '../../src/stores/accountsStore';
import { useNetWorthStore } from '../../src/stores/networthStore';
import { useMilestonesStore } from '../../src/stores/milestonesStore';
import { useAuthStore } from '../../src/stores/authStore';
import { messagesApi } from '../../src/services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format net worth using U+2212 minus sign (not hyphen) for negatives */
function formatNetWorth(value: number): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);
  if (value < 0) return '\u2212' + formatted; // U+2212 proper minus
  return formatted;
}

/** "JANUARY · WEEK ONE" — uppercase month + ordinal week of month */
const ORDINALS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

function monthAndWeekEyebrow(): string {
  const now = new Date();
  const month = MONTHS[now.getMonth()];
  // Week-of-month: 1-based, capped at 5
  const dayOfMonth = now.getDate();
  const weekIndex = Math.min(Math.floor((dayOfMonth - 1) / 7), 4);
  const weekWord = ORDINALS[weekIndex];
  return `${month} \u00B7 WEEK ${weekWord}`; // U+00B7 middle dot
}

// ─── ActionLink ───────────────────────────────────────────────────────────────

interface ActionLinkProps {
  label: string;
  onPress: () => void;
}

const ActionLink = ({ label, onPress }: ActionLinkProps) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => ({
      opacity: pressed ? 0.6 : 1,
      paddingVertical: 20,
      borderTopWidth: 0.5,
      borderColor: colors.charcoal,
    })}
  >
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text
        style={{
          fontFamily: typography.families.regular,
          ...typography.scale.body,
          color: colors.bone,
        }}
      >
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={20} color={colors.stone} />
    </View>
  </Pressable>
);

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isClient = user?.role !== 'coach';

  // Unread coach-message count — drives the header chat badge so clients
  // have a way into /messages without burning a 5th tab. Coach role uses
  // the dedicated /coach/messages inbox instead.
  const [unread, setUnread] = React.useState(0);
  const refreshUnread = React.useCallback(async () => {
    if (!isClient) return;
    try {
      const { data } = await messagesApi.unreadCount();
      setUnread(typeof data?.count === 'number' ? data.count : 0);
    } catch {
      // best-effort — leave previous count
    }
  }, [isClient]);

  // Data
  const { dailyInterest, fetchAccounts, isLoading } = useAccountsStore();
  const {
    history: nwHistory,
    currentNetWorth,
    fetchHistory,
    fetchCurrent: fetchCurrentNetWorth,
  } = useNetWorthStore();
  const { pendingCelebration, dismissCelebration } = useMilestonesStore();

  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    fetchAccounts();
    fetchHistory();
    fetchCurrentNetWorth();
    refreshUnread();
  }, [refreshUnread]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchAccounts({ force: true }),
      fetchHistory(undefined, { force: true }),
      fetchCurrentNetWorth({ force: true }),
      refreshUnread(),
    ]);
    setRefreshing(false);
  };

  // Safe values
  const displayNetWorth = isFinite(currentNetWorth) ? currentNetWorth : 0;
  const safeDailyInterest = isFinite(dailyInterest) ? dailyInterest : 0;
  const eyebrow = monthAndWeekEyebrow();

  // Nav destinations (preserve existing routes)
  const onLogSpend = () => router.push('/eod');
  const onCoach = () => router.push('/(tabs)/coach');
  const onAccounts = () => router.push('/(tabs)/accounts');

  return (
    <ScreenErrorBoundary screenName="Home" onRetry={onRefresh}>
      {/* Light status bar for dark navy background */}
      <StatusBar style="light" backgroundColor={colors.navy} />

      <SafeAreaView style={{ flex: 1, backgroundColor: colors.navy }} edges={['top']}>
        {/* Client-only entry into the coach-message thread. Coaches have
            their own /coach/messages inbox surfaced from the Coach OS, so
            we hide this for them to keep the home hero uncluttered. */}
        {isClient ? (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 8 }}>
            <Pressable
              onPress={() => router.push('/messages')}
              accessibilityRole="button"
              accessibilityLabel={
                unread > 0
                  ? `Messages, ${unread} unread`
                  : 'Messages with your coach'
              }
              hitSlop={12}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 8 })}
            >
              <View>
                <Ionicons name="chatbubble-outline" size={22} color={colors.bone} />
                {unread > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -6,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      paddingHorizontal: 4,
                      backgroundColor: colors.oxblood,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: typography.families.medium,
                        fontSize: 10,
                        lineHeight: 14,
                        color: colors.bone,
                      }}
                    >
                      {unread > 9 ? '9+' : unread}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          </View>
        ) : null}
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 32,
            paddingTop: 32,
            paddingBottom: 96,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.stone}
            />
          }
        >
          {/* ── Single number — net worth (56pt Cormorant Garamond, bone) ── */}
          <Text
            style={{
              fontFamily: typography.families.serif,
              fontSize: 56,
              lineHeight: 60,
              letterSpacing: 0.6,
              fontWeight: '400',
              color: colors.bone,
              marginBottom: 16,
            }}
          >
            {formatNetWorth(displayNetWorth)}
          </Text>

          {/* ── Eyebrow — "JANUARY · WEEK ONE" (stone, tracked uppercase, 11pt) ──
              Was oxblood; oxblood-on-navy = 1.11:1 contrast (fails WCAG).
              Stone keeps the meta-typography register and reserves the
              one oxblood accent for the chart below. */}
          <Text
            style={{
              fontFamily: typography.families.medium,
              ...typography.scale.eyebrow,
              color: colors.stone,
              marginBottom: 56,
            }}
          >
            {eyebrow}
          </Text>

          {/* ── Thin oxblood chart, 700ms reveal ── */}
          <View style={{ height: 200, marginBottom: 32 }}>
            {Array.isArray(nwHistory) && nwHistory.length > 0 ? (
              <NetWorthChart history={nwHistory} height={200} variant="luxury" />
            ) : (
              <View style={{ height: 200, justifyContent: 'center' }}>
                <View style={{ height: 0.5, backgroundColor: colors.oxblood, opacity: 0.4 }} />
              </View>
            )}
          </View>

          {/* ── Soft interest line — matter-of-fact, no animation, no red ── */}
          <Text
            style={{
              fontFamily: typography.families.regular,
              ...typography.scale.body,
              color: colors.stone,
              marginBottom: 64,
            }}
          >
            {`Today's interest cost: $${safeDailyInterest.toFixed(2)}.`}
          </Text>

          {/* ── Three text-link actions (no buttons, no cards) ── */}
          <ActionLink label="Log today's spend" onPress={onLogSpend} />
          <ActionLink label="Talk to your coach" onPress={onCoach} />
          <ActionLink label="Open accounts" onPress={onAccounts} />
        </ScrollView>

        {/* Celebration modal — keep logic, just don't trigger on mount */}
        <CelebrationModal
          milestone={pendingCelebration}
          onDismiss={dismissCelebration}
        />
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}
