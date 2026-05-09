// Sprint A audit fix CR-3 — client-side coach-message thread.
//
// Closes the gap the audit flagged: the coach side can send messages,
// the notification-preferences toggle advertises "Coach Messages", but
// there was no in-app way for the client to read the thread.
//
// Backend contract (lives in backend/src/messages/messages.controller.ts):
//   GET  /api/messages?limit&before -> ClientMessageThreadResponse
//   GET  /api/messages/unread-count -> { count }
//   POST /api/messages { body }     -> ClientMessage
//   POST /api/messages/read         -> { marked }
//
// UX:
//   - Oldest message at top, newest at bottom (FlatList inverted=false
//     so the natural scroll is top-down).
//   - Pull-down on the top row loads older history (next page via
//     `before` cursor).
//   - Mark-as-read fires once on screen focus.
//   - Empty states for "no coach yet" and "no messages yet".
//   - Composer auto-grows up to 6 lines.
//   - Send is disabled while empty or while a previous send is in
//     flight; we optimistically append the sent row.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius } from '../../src/theme/tokens';
import {
  messagesApi,
  type ClientMessage,
  type ClientMessageThreadResponse,
} from '../../src/services/api';
import { errorMessage } from '../../src/lib/errorMessage';

const COMPOSE_MAX_LINES = 6;
const COMPOSE_MAX_CHARS = 4000;

export default function ClientMessagesScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList<ClientMessage>>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [thread, setThread] = useState<ClientMessageThreadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const loadInitial = useCallback(async () => {
    try {
      const res = await messagesApi.getThread({ limit: 50 });
      setThread(res.data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not load messages. Pull to retry.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Mark-as-read sweep on focus. Best effort; we never let it block
  // the screen.
  useFocusEffect(
    useCallback(() => {
      messagesApi.markRead().catch(() => undefined);
    }, []),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInitial();
  }, [loadInitial]);

  const handleLoadMore = useCallback(async () => {
    if (!thread || !thread.next_cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await messagesApi.getThread({ limit: 50, before: thread.next_cursor });
      setThread((prev) => {
        if (!prev) return res.data;
        // The new page is the older messages. Keep prev.messages
        // (newer) at the bottom of the list.
        return {
          ...res.data,
          messages: [...res.data.messages, ...prev.messages],
        };
      });
    } catch (err) {
      setError(errorMessage(err, 'Could not load older messages.'));
    } finally {
      setLoadingMore(false);
    }
  }, [thread, loadingMore]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending || !thread?.has_coach) return;
    setSending(true);
    try {
      const res = await messagesApi.send(body);
      const sent = res.data;
      setThread((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, sent] }
          : prev,
      );
      setDraft('');
      // Scroll to the new message after layout settles.
      requestAnimationFrame(() => flatListRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setError(errorMessage(err, 'Could not send. Try again.'));
    } finally {
      setSending(false);
    }
  }, [draft, sending, thread]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header onBack={() => router.back()} title="Messages" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} />
        </View>
      </SafeAreaView>
    );
  }

  if (!thread?.has_coach) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header onBack={() => router.back()} title="Messages" />
        <View style={styles.center}>
          <Ionicons name="people-outline" size={28} color={colors.stone} />
          <Text style={styles.emptyTitle}>No coach assigned yet</Text>
          <Text style={styles.emptyBody}>
            When you join a coach, your conversation will live here. Use an invite
            code from your coach to get started.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header
        onBack={() => router.back()}
        title={thread.coach_name ? `Coach ${thread.coach_name}` : 'Messages'}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={thread.messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.ink} />
          }
          ListHeaderComponent={
            thread.next_cursor ? (
              <Pressable
                onPress={handleLoadMore}
                style={styles.loadMore}
                disabled={loadingMore}
                accessibilityRole="button"
                accessibilityLabel="Load older messages"
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.stone} />
                ) : (
                  <Text style={styles.loadMoreText}>Load older messages</Text>
                )}
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyInline}>
              <Text style={styles.emptyBody}>
                No messages yet. Say hi to your coach.
              </Text>
            </View>
          }
          renderItem={({ item }) => <Bubble message={item} />}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {error ? (
          <Text style={styles.errorBanner} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message your coach"
            placeholderTextColor={colors.stone}
            multiline
            maxLength={COMPOSE_MAX_CHARS}
            accessibilityLabel="Message your coach"
            scrollEnabled
            returnKeyType="default"
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            style={[
              styles.sendBtn,
              (!draft.trim() || sending) && styles.sendBtnDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {sending ? (
              <ActivityIndicator color={colors.bone} />
            ) : (
              <Ionicons name="send" size={18} color={colors.bone} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.headerBar}>
      <Pressable
        onPress={onBack}
        style={styles.backBtn}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 32 }} />
    </View>
  );
}

function Bubble({ message }: { message: ClientMessage }) {
  const isCoach = message.from_coach;
  return (
    <View
      style={[
        styles.bubbleRow,
        isCoach ? styles.bubbleRowCoach : styles.bubbleRowSelf,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isCoach ? styles.bubbleCoach : styles.bubbleSelf,
        ]}
      >
        <Text style={[styles.bubbleText, isCoach ? styles.bubbleTextCoach : styles.bubbleTextSelf]}>
          {message.body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bone },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  emptyTitle: {
    ...typography.scale.h2,
    fontFamily: typography.families.serif,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  emptyBody: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.stone,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  emptyInline: { padding: spacing.lg, alignItems: 'center' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.stone,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.scale.body,
    fontFamily: typography.families.medium,
    color: colors.ink,
  },
  listContent: { padding: spacing.md, gap: spacing.xs, flexGrow: 1 },
  loadMore: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  loadMoreText: {
    ...typography.scale.caption,
    fontFamily: typography.families.medium,
    color: colors.stone,
  },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  bubbleRowCoach: { justifyContent: 'flex-start' },
  bubbleRowSelf: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
  },
  bubbleCoach: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: 4,
  },
  bubbleSelf: {
    backgroundColor: colors.oxblood,
    borderTopRightRadius: 4,
  },
  bubbleText: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
  },
  bubbleTextCoach: { color: colors.ink },
  bubbleTextSelf: { color: colors.bone },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.stone,
    backgroundColor: colors.bone,
    gap: spacing.sm,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 24 * COMPOSE_MAX_LINES,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  errorBanner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cream,
    color: colors.oxblood,
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    textAlign: 'center',
  },
});
