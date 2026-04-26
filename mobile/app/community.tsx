// Community screen — UX Psychology Report #5: Contribution Loops
// Feed of anonymised wins + win composer at the top.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CommunityWinCard, CommunityWin } from '../src/components/community/CommunityWinCard';
import { HapticPressable } from '../src/components/HapticPressable';
import { ScreenErrorBoundary } from '../src/components/ui/ScreenErrorBoundary';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/finance';
import { communityApi } from '../src/services/api';
import { track } from '../src/lib/analytics';

type Visibility = 'circle' | 'public';

export default function CommunityScreen() {
  const router = useRouter();
  const [wins, setWins] = useState<CommunityWin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posting, setPosting] = useState(false);

  // Composer state
  const [action, setAction] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');

  const loadFeed = useCallback(async () => {
    try {
      const r = await communityApi.getFeed();
      const data = r.data?.data ?? r.data ?? [];
      setWins(Array.isArray(data) ? data : []);
    } catch {
      // Best-effort — keep existing wins visible
    }
  }, []);

  useEffect(() => {
    track('community_feed_opened');
    loadFeed().finally(() => setLoading(false));
  }, [loadFeed]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  }, [loadFeed]);

  const handleReact = useCallback(
    async (winId: string, kind: 'fire' | 'clap') => {
      // Optimistic update
      setWins((prev) =>
        prev.map((w) => {
          if (w.id !== winId) return w;
          const wasActive = w.myReactions[kind];
          return {
            ...w,
            reactions: {
              ...w.reactions,
              [kind]: w.reactions[kind] + (wasActive ? -1 : 1),
            },
            myReactions: { ...w.myReactions, [kind]: !wasActive },
          };
        }),
      );
      track('community_win_reacted', { win_id: winId, kind });
      try {
        await communityApi.react(winId, kind);
      } catch {
        // Revert on failure
        setWins((prev) =>
          prev.map((w) => {
            if (w.id !== winId) return w;
            const isActive = w.myReactions[kind];
            return {
              ...w,
              reactions: {
                ...w.reactions,
                [kind]: w.reactions[kind] + (isActive ? -1 : 1),
              },
              myReactions: { ...w.myReactions, [kind]: !isActive },
            };
          }),
        );
      }
    },
    [],
  );

  const handlePost = useCallback(async () => {
    if (action.trim().length < 3) return;
    setPosting(true);
    try {
      const r = await communityApi.postWin(action.trim(), visibility);
      const newWin = r.data?.data ?? r.data;
      track('community_win_posted', { visibility });
      if (newWin) {
        setWins((prev) => [newWin, ...prev].slice(0, 30));
      }
      setAction('');
    } catch {
      // Silent fail — user can retry
    } finally {
      setPosting(false);
    }
  }, [action, visibility]);

  return (
    <ScreenErrorBoundary screenName="Community">
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Nav header */}
        <View style={styles.navHeader}>
          <HapticPressable intent="light" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.frostWhite} />
          </HapticPressable>
          <Text style={styles.navTitle}>Inner Circle Wins</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.accentGold}
            />
          }
        >
          {/* Win Composer */}
          <View style={styles.composer}>
            <Text style={styles.composerLabel}>Share a Win</Text>

            {/* Visibility toggle */}
            <View style={styles.visibilityRow}>
              <TouchableOpacity
                style={[styles.visBtn, visibility === 'circle' && styles.visBtnActive]}
                onPress={() => setVisibility('circle')}
                activeOpacity={0.8}
              >
                <Text style={[styles.visBtnText, visibility === 'circle' && styles.visBtnTextActive]}>
                  Circle
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.visBtn, visibility === 'public' && styles.visBtnActive]}
                onPress={() => setVisibility('public')}
                activeOpacity={0.8}
              >
                <Text style={[styles.visBtnText, visibility === 'public' && styles.visBtnTextActive]}>
                  Public
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="e.g. paid off 15% of my car loan this month..."
              placeholderTextColor={Colors.slateGray}
              value={action}
              onChangeText={setAction}
              multiline
              maxLength={200}
            />

            <HapticPressable
              intent="success"
              style={[styles.postBtn, (action.trim().length < 3 || posting) && styles.postBtnDisabled]}
              onPress={handlePost}
              disabled={action.trim().length < 3 || posting}
            >
              {posting ? (
                <ActivityIndicator size="small" color={Colors.backgroundDeepNavy} />
              ) : (
                <Text style={styles.postBtnText}>Post Win 🏆</Text>
              )}
            </HapticPressable>
          </View>

          {/* Feed */}
          <Text style={styles.feedLabel}>Community Feed</Text>
          {loading ? (
            <ActivityIndicator color={Colors.accentGold} style={{ marginTop: Spacing.xl }} />
          ) : wins.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No wins yet — be the first to share one! 🎉</Text>
            </View>
          ) : (
            wins.map((win) => (
              <CommunityWinCard key={win.id} win={win} onReact={handleReact} />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  backBtn: { padding: Spacing.xs },
  navTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
  },
  scroll: { flex: 1 },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxxl },

  // Composer
  composer: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    padding: Spacing.base,
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  composerLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  visBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    backgroundColor: Colors.cardSurfaceNavyElevated,
  },
  visBtnActive: {
    borderColor: Colors.accentGold,
    backgroundColor: 'rgba(249, 199, 79, 0.1)',
  },
  visBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  visBtnTextActive: {
    color: Colors.accentGold,
  },
  input: {
    backgroundColor: Colors.cardSurfaceNavyElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    padding: Spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  postBtn: {
    backgroundColor: Colors.accentGold,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  postBtnDisabled: {
    opacity: 0.4,
  },
  postBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.backgroundDeepNavy,
  },

  // Feed
  feedLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
    marginBottom: Spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    textAlign: 'center',
  },
});
