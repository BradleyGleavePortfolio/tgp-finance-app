/**
 * MessageThread — single coach/client thread.
 *
 * Loads the full message history, marks inbound messages read on fetch
 * (server-side), and provides a sticky composer at the bottom.
 *
 * Stage 2 is fetch-on-mount + manual refresh + send. Live delivery
 * (websockets / push) lands in Stage 3.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coachApi } from '../../../src/services/api';
import { colors, typography, spacing, radius } from '../../../src/theme/tokens';
import { formatRelativeTime } from '../../../src/utils/formatters';
import { CoachSkeletonList } from '../../../src/components/coach/CoachSkeleton';
import { CoachEmptyState } from '../../../src/components/coach/CoachEmptyState';
import type { CoachMessageRow } from '../../../src/types/coach';

export default function MessageThreadScreen() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const [messages, setMessages] = useState<CoachMessageRow[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clientName, setClientName] = useState<string>('Client');
  const scrollRef = useRef<ScrollView | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    try {
      const [thread, summary] = await Promise.all([
        coachApi.getMessageThread(clientId),
        coachApi.getClientSummary(clientId).catch(() => null),
      ]);
      setMessages(thread.data.messages);
      if (summary?.data?.client?.name) setClientName(summary.data.client.name);
    } catch {
      setMessages([]);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Scroll to the newest message after each render of a non-empty list.
    if (messages && messages.length > 0) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    }
  }, [messages]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleSend = async () => {
    if (!clientId || !draft.trim() || sending) return;
    setSending(true);
    const body = draft.trim();
    setDraft('');
    try {
      await coachApi.sendMessage(clientId, body);
      await load();
    } catch {
      setDraft(body);
      Alert.alert('Could not send', 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerEyebrow}>THREAD</Text>
          <Text style={styles.headerName}>{clientName}</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.stone} />
          }
          keyboardShouldPersistTaps="handled"
        >
          {messages === null ? (
            <CoachSkeletonList rows={6} rowHeight={48} />
          ) : messages.length === 0 ? (
            <CoachEmptyState
              eyebrow="EMPTY THREAD"
              title="Send the first message."
              body="Quick check-ins, nudges, and program clarifications belong here."
            />
          ) : (
            messages.map((m, idx) => {
              const prev = idx > 0 ? messages[idx - 1] : null;
              const showDate =
                !prev ||
                new Date(prev.created_at).toDateString() !==
                  new Date(m.created_at).toDateString();
              return (
                <View key={m.id}>
                  {showDate ? (
                    <Text style={styles.dateDivider}>{formatRelativeTime(m.created_at)}</Text>
                  ) : null}
                  <View
                    style={[
                      styles.bubble,
                      m.from_coach ? styles.bubbleSelf : styles.bubbleOther,
                    ]}
                  >
                    <Text style={[styles.bubbleBody, m.from_coach && { color: colors.bone }]}>
                      {m.body}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={colors.stone}
            style={styles.input}
            multiline
            accessibilityLabel="Compose message"
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Ionicons name="arrow-up" size={20} color={colors.bone} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bone },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.stone,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  headerName: {
    fontFamily: typography.families.serif,
    fontSize: 18,
    color: colors.ink,
    marginTop: 2,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  dateDivider: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.stone,
    textAlign: 'center',
    marginVertical: spacing.sm,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    maxWidth: '85%',
    marginVertical: 2,
  },
  bubbleSelf: {
    alignSelf: 'flex-end',
    backgroundColor: colors.ink,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
  },
  bubbleBody: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.stone,
    backgroundColor: colors.bone,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
