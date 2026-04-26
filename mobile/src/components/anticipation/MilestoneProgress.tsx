/**
 * MilestoneProgress — UX Psychology Report #4: Healthy Anticipation
 * ════════════════════════════════════════════════════════════════════
 * Animated progress bar showing how close the user is to their next
 * milestone. 600 ms easeOut on mount. Subtle pulse when within 80%.
 *
 * Props:
 *   milestone  — ResolvedMilestone from lib/milestones.ts
 *   onPress    — optional navigation tap
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { neutral, gold, semantic, typography, spacing, radius, shadows } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { HapticPressable } from '../HapticPressable';
import type { ResolvedMilestone } from '../../lib/milestones';

interface MilestoneProgressProps {
  milestone: ResolvedMilestone;
  onPress?: () => void;
}

// ─── Category colour mapping ──────────────────────────────────────────────────
function categoryColor(category: ResolvedMilestone['category']): string {
  switch (category) {
    case 'cash':       return semantic.success;     // green
    case 'debt':       return semantic.danger;       // crimson — debt destroyed
    case 'net_worth':  return gold[400];             // gold
    case 'streak':     return semantic.info;         // teal
    default:           return gold[400];
  }
}

export function MilestoneProgress({ milestone, onPress }: MilestoneProgressProps) {
  const { isFounder } = useTheme();

  // ─── Animated values ──────────────────────────────────────────────
  // Bar width: 0 → progress (0–1)
  const barAnim = useRef(new Animated.Value(0)).current;
  // Pulse scale for near-target glow
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Mount fade-in
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const accent = categoryColor(milestone.category);
  const progressClamped = Math.min(1, Math.max(0, milestone.progress));

  useEffect(() => {
    // Entrance: fade in + bar fill — 600 ms easeOut
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(barAnim, {
        toValue: progressClamped,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,   // width is not supported on native driver
      }),
    ]).start();

    // Pulse when within 80% of target
    if (milestone.isNearTarget) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.04,
            duration: 700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressClamped, milestone.isNearTarget]);

  // Dynamic border for founders
  const borderStyle = isFounder
    ? { borderColor: gold[400], borderWidth: 1, ...shadows.md }
    : { borderColor: neutral[700], borderWidth: 1 };

  return (
    <Animated.View
      style={[
        styles.container,
        borderStyle,
        { opacity: fadeAnim, transform: [{ scale: pulseAnim }] },
      ]}
    >
      <HapticPressable
        intent="light"
        onPress={onPress}
        disabled={!onPress}
        style={styles.inner}
      >
        {/* Header row: icon + title + progress fraction */}
        <View style={styles.headerRow}>
          <Text style={styles.icon}>{milestone.icon}</Text>
          <View style={styles.titleBlock}>
            <Text style={styles.sectionLabel}>UP NEXT</Text>
            <Text style={styles.title} numberOfLines={1}>{milestone.title}</Text>
          </View>
          <Text style={[styles.fraction, { color: accent }]}>
            {Math.round(progressClamped * 100)}%
          </Text>
        </View>

        {/* Progress track */}
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: accent,
                width: barAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
                // Near-target: add soft glow
                // glow removed (luxury/wave1)
              },
            ]}
          />
        </View>

        {/* Dynamic copy + progress label */}
        <View style={styles.footerRow}>
          <Text style={styles.motivationalCopy} numberOfLines={2}>
            {milestone.motivationalCopy}
          </Text>
          <Text style={[styles.progressLabel, { color: accent }]}>
            {milestone.progressLabel}
          </Text>
        </View>
      </HapticPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    backgroundColor: neutral[900],
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  inner: {
    padding: spacing.base,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    fontSize: 28,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  sectionLabel: {
    fontFamily: typography.families.semiBold,
    ...typography.scale.micro,
    color: neutral[400],
    letterSpacing: 1.5,
  },
  title: {
    fontFamily: typography.families.bold,
    fontSize: 16,
    lineHeight: 22,
    color: neutral[100],
  },
  fraction: {
    fontFamily: typography.families.monoBold,
    fontSize: 18,
    lineHeight: 24,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: neutral[800],
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: radius.pill,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  motivationalCopy: {
    flex: 1,
    fontFamily: typography.families.medium,
    ...typography.scale.caption,
    color: neutral[400],
    lineHeight: 18,
  },
  progressLabel: {
    fontFamily: typography.families.mono,
    ...typography.scale.caption,
    textAlign: 'right',
    flexShrink: 0,
  },
});
