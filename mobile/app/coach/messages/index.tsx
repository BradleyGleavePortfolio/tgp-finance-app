/**
 * MessagesInbox — every coach/client thread, most-recent first.
 *
 * Each row shows the client's name, the last message preview, an unread
 * badge, and relative time. Tap → /coach/messages/[clientId] thread.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coachApi } from '../../../src/services/api';
import { colors, typography, spacing } from '../../../src/theme/tokens';
import { formatRelativeTime } from '../../../src/utils/formatters';
import { CoachSkeletonList } from '../../../src/components/coach/CoachSkeleton';
import { CoachEmptyState } from '../../../src/components/coach/CoachEmptyState';
import type { CoachMessageThreadRow } from '../../../src/types/coach';

export default function MessagesInboxScreen() {
  const router = useRouter();
  const [threads, setThreads] = useState<CoachMessageThreadRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await coachApi.getMessageInbox();
      setThreads(r.data.threads);
    } catch {
      setErr('We could not load your inbox.');
    }
  }, []);

  useEffect(() => {
    load();
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
        <Text style={styles.headerTitle}>MESSAGES</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.heroWrap}>
        <Text style={styles.heroEyebrow}>INBOX</Text>
        <Text style={styles.heroTitle}>Conversations.</Text>
      </View>

      <FlatList
        data={threads ?? []}
        keyExtractor={(t) => t.client_id}
        renderItem={({ item }) => (
          <ThreadRow item={item} onPress={() => router.push(`/coach/messages/${item.client_id}`)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.stone} />
        }
        ListEmptyComponent={
          threads === null ? (
            <View style={{ paddingHorizontal: spacing.lg }}>
              <CoachSkeletonList rows={6} rowHeight={64} />
            </View>
          ) : err ? (
            <CoachEmptyState
              tone="error"
              eyebrow="UNAVAILABLE"
              title="We couldn't load your inbox."
              body={err}
              actionLabel="Retry"
              onAction={onRefresh}
            />
          ) : (
            <CoachEmptyState
              eyebrow="QUIET INBOX"
              title="No conversations yet."
              body="Messages will appear here as you and your clients exchange them."
            />
          )
        }
      />
    </SafeAreaView>
  );
}

function ThreadRow({ item, onPress }: { item: CoachMessageThreadRow; onPress: () => void }) {
  const preview =
    item.last_message?.body ??
    'No messages yet. Send the first one.';
  const time = item.last_message ? formatRelativeTime(item.last_message.created_at) : '';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open thread with ${item.client_name}`}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowName}>{item.client_name}</Text>
          {item.unread_count > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>{item.unread_count}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowPreview} numberOfLines={1}>
          {item.last_message?.from_coach ? 'You: ' : ''}
          {preview}
        </Text>
      </View>
      <Text style={styles.rowTime}>{time}</Text>
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
  heroWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  heroEyebrow: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  heroTitle: {
    ...typography.scale.h1,
    fontFamily: typography.families.serif,
    color: colors.ink,
    marginTop: 4,
  },
  listContent: {
    paddingBottom: spacing['4xl'],
  },
  separator: {
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
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    ...typography.scale.body,
    fontFamily: typography.families.medium,
    color: colors.ink,
  },
  rowPreview: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
    marginTop: 2,
  },
  rowTime: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadCount: {
    fontFamily: typography.families.medium,
    fontSize: 10,
    color: colors.bone,
  },
});
