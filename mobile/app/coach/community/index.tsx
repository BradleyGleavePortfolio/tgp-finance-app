/**
 * CommunityPostsScreen — coach-authored content management.
 *
 * Lists every post the coach has authored, with quick toggles to
 * archive / publish / delete. New post composer lives at /coach/community/new.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coachApi } from '../../../src/services/api';
import { colors, typography, spacing, radius } from '../../../src/theme/tokens';
import { formatRelativeTime } from '../../../src/utils/formatters';
import { CoachSkeletonList } from '../../../src/components/coach/CoachSkeleton';
import { CoachEmptyState } from '../../../src/components/coach/CoachEmptyState';
import { CoachStatusPill } from '../../../src/components/coach/CoachStatusPill';
import type { CommunityPostRow } from '../../../src/types/coach';

export default function CommunityPostsScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<CommunityPostRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await coachApi.listCommunityPosts();
      setPosts(r.data);
    } catch {
      setPosts([]);
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

  const handleArchive = async (id: string) => {
    try {
      await coachApi.patchCommunityPost(id, { status: 'archived' });
      await load();
    } catch {
      Alert.alert('Could not archive', 'Please try again.');
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await coachApi.patchCommunityPost(id, { status: 'published' });
      await load();
    } catch {
      Alert.alert('Could not publish', 'Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete post', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await coachApi.deleteCommunityPost(id);
            await load();
          } catch {
            Alert.alert('Could not delete', 'Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>COMMUNITY</Text>
        <Pressable
          onPress={() => router.push('/coach/community/new')}
          style={styles.headerAction}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="New post"
        >
          <Ionicons name="add" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.stone} />
        }
      >
        <Text style={styles.eyebrow}>YOUR POSTS</Text>
        <Text style={styles.headline}>Community.</Text>
        <Text style={styles.lede}>
          Articles, videos, and tips you publish here surface in your clients' community feed.
        </Text>

        <View style={{ height: spacing.xl }} />

        {posts === null ? (
          <CoachSkeletonList rows={4} rowHeight={88} />
        ) : posts.length === 0 ? (
          <CoachEmptyState
            eyebrow="NO POSTS YET"
            title="Publish your first piece."
            body="Long-form articles, video tips, and weekly notes all live here. Your clients see them in their community feed."
            actionLabel="Compose post"
            onAction={() => router.push('/coach/community/new')}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {posts.map((p) => {
              const tone = p.status === 'published' ? 'good' : p.status === 'draft' ? 'warn' : 'neutral';
              return (
                <View key={p.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardEyebrow}>
                      {p.published_at ? formatRelativeTime(p.published_at) : formatRelativeTime(p.created_at)}
                    </Text>
                    <CoachStatusPill label={p.status} tone={tone} />
                  </View>
                  <Text style={styles.cardTitle}>{p.title}</Text>
                  <Text style={styles.cardBody} numberOfLines={3}>
                    {p.body}
                  </Text>
                  {p.resource_url ? (
                    <Pressable
                      onPress={() => Linking.openURL(p.resource_url as string).catch(() => {})}
                      style={styles.resourceBtn}
                      accessibilityRole="link"
                      accessibilityLabel="Open resource"
                    >
                      <Ionicons name="link-outline" size={14} color={colors.charcoal} />
                      <Text style={styles.resourceText} numberOfLines={1}>
                        {p.resource_url}
                      </Text>
                    </Pressable>
                  ) : null}
                  <View style={styles.cardActions}>
                    {p.status === 'archived' ? (
                      <Pressable onPress={() => handlePublish(p.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Republish post">
                        <Text style={styles.actionPrimary}>REPUBLISH</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => handleArchive(p.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Archive post">
                        <Text style={styles.actionMuted}>ARCHIVE</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => handleDelete(p.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete post">
                      <Text style={styles.actionDanger}>DELETE</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
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
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
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
  card: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardEyebrow: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  cardTitle: {
    fontFamily: typography.families.serif,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
    marginBottom: 6,
  },
  cardBody: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
  },
  resourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  resourceText: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
    textDecorationLine: 'underline',
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  actionPrimary: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.ink,
  },
  actionMuted: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  actionDanger: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.oxblood,
  },
});
