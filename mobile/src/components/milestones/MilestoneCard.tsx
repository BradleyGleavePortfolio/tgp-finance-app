// Milestone card — locked/unlocked states
// UX Psychology Report #3: light haptic on unlocked milestone tap
// UX Psychology Report #4: Healthy Anticipation — entrance animation, gold founder border,
//   analytics events on view + unlock, HapticPressable.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { neutral, gold, semantic, typography, spacing, radius, shadows } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { HapticPressable } from '../HapticPressable';
import { track } from '../../lib/analytics';
import type { MilestoneDefinition } from '../../types';
import { formatDate } from '../../utils/formatters';

interface MilestoneCardProps {
  milestone: MilestoneDefinition;
  isUnlocked: boolean;
  unlockedAt?: string;
  onPress?: () => void;
}

export function MilestoneCard({ milestone, isUnlocked, unlockedAt, onPress }: MilestoneCardProps) {
  const { isFounder } = useTheme();

  // ─── Entrance animation ───────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Analytics — viewed
    track('milestone_progress_viewed', {
      milestone_key: milestone.key,
      is_unlocked: isUnlocked,
      category: milestone.category,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePress = () => {
    if (isUnlocked) {
      // Notify unlock celebration viewed
      track('milestone_unlocked', {
        milestone_key: milestone.key,
        category: milestone.category,
        unlocked_at: unlockedAt,
      });
    }
    onPress?.();
  };

  // ─── Dynamic border ───────────────────────────────────────────────
  // Founders: gold border for unlocked milestones; thicker gold for all unlocked
  const borderColor = isUnlocked
    ? isFounder
      ? gold[400]
      : gold[500]        // non-founders still get gold on unlock, slightly muted
    : neutral[700];

  const cardBackground = isUnlocked
    ? isFounder
      ? '#131A0F'         // subtle gold-tinted dark for founders
      : neutral[900]
    : 'rgba(22,27,34,0.5)';

  const shadowStyle = isUnlocked && isFounder ? shadows.md : {};

  return (
    <Animated.View
      style={[
        styles.container,
        shadowStyle,
        {
          backgroundColor: cardBackground,
          borderColor,
          opacity: isUnlocked ? fadeAnim : 1,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <HapticPressable
        intent={isUnlocked ? 'success' : 'light'}
        style={[styles.inner, !isUnlocked && styles.lockedInner]}
        onPress={handlePress}
        disabled={!onPress}
      >
        {/* Icon */}
        <Text style={[styles.icon, !isUnlocked && styles.iconLocked]}>
          {milestone.icon}
        </Text>

        {/* Text block */}
        <View style={styles.content}>
          <Text
            style={[
              styles.title,
              isUnlocked
                ? isFounder
                  ? styles.titleFounder
                  : styles.titleUnlocked
                : styles.titleLocked,
            ]}
          >
            {milestone.title}
          </Text>
          <Text style={styles.description}>{milestone.description}</Text>
          {isUnlocked && unlockedAt && (
            <Text style={[styles.date, isFounder && styles.dateFounder]}>
              Reached {formatDate(unlockedAt)}
            </Text>
          )}
        </View>

        {/* Status badge */}
        {isUnlocked ? (
          <View style={[styles.checkBadge, isFounder && styles.checkBadgeFounder]}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        ) : (
          <Text style={styles.lock}>—</Text>
        )}
      </HapticPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  lockedInner: {
    opacity: 0.65,
  },
  icon: {
    fontSize: 32,
  },
  iconLocked: {
    opacity: 0.35,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontFamily: typography.families.bold,
    fontSize: 14,
    lineHeight: 20,
  },
  titleUnlocked: {
    color: gold[400],
  },
  titleFounder: {
    color: gold[300],   // brighter gold for founders
  },
  titleLocked: {
    color: neutral[400],
  },
  description: {
    fontFamily: typography.families.regular,
    fontSize: 12,
    lineHeight: 18,
    color: neutral[400],
  },
  date: {
    fontFamily: typography.families.regular,
    fontSize: 11,
    lineHeight: 16,
    color: gold[400],
    letterSpacing: 0.2,
  },
  dateFounder: {
    color: gold[300],
  },
  // Unlocked check badge
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: semantic.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkBadgeFounder: {
    backgroundColor: 'rgba(197, 162, 83, 0.10)',
  },
  checkText: {
    fontFamily: typography.families.bold,
    fontSize: 13,
    color: semantic.success,
  },
  lock: {
    fontSize: 14,
    opacity: 0.35,
    flexShrink: 0,
  },
});
