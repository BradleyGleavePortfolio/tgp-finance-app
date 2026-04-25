// HeroAction — UX Psychology Report #1: One Dominant Home Action
// Large pressable hero card that surfaces the single most important action
// for the user right now. Status logic: needs_attention > on_track > no_goals
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../theme/finance';

export type HeroStatus = 'on_track' | 'needs_attention' | 'no_goals' | 'loading';

interface HeroActionProps {
  status: HeroStatus;
  weekStat?: string;       // e.g. "$1,240 spent · $360 left in budget"
  onPress: () => void;
}

interface HeroConfig {
  title: string;
  subtitle: string;
  chevronColor: string;
  backgroundColor: string;
  borderColor: string;
  glowColor: string;
  titleColor: string;
  badgeText?: string;
  badgeColor?: string;
}

function getHeroConfig(status: HeroStatus): HeroConfig {
  switch (status) {
    case 'needs_attention':
      return {
        title: 'Make a Move',
        subtitle: '1 thing needs your attention today',
        backgroundColor: '#1A0F0F',
        borderColor: Colors.debtCrimson,
        glowColor: 'rgba(230, 57, 70, 0.18)',
        chevronColor: Colors.debtCrimson,
        titleColor: Colors.frostWhite,
        badgeText: '!',
        badgeColor: Colors.debtCrimson,
      };
    case 'on_track':
      return {
        title: "You're On Track ✓",
        subtitle: 'Review this week',
        backgroundColor: '#0A1A14',
        borderColor: Colors.profitGreen,
        glowColor: 'rgba(6, 214, 160, 0.14)',
        chevronColor: Colors.profitGreen,
        titleColor: Colors.profitGreen,
        badgeText: '✓',
        badgeColor: Colors.profitGreen,
      };
    case 'no_goals':
    default:
      return {
        title: 'Set Your First Goal',
        subtitle: 'Build your financial plan in 2 minutes',
        backgroundColor: Colors.cardSurfaceNavyElevated,
        borderColor: Colors.accentGold,
        glowColor: 'rgba(249, 199, 79, 0.14)',
        chevronColor: Colors.accentGold,
        titleColor: Colors.accentGold,
      };
  }
}

export function HeroAction({ status, weekStat, onPress }: HeroActionProps) {
  if (status === 'loading') {
    return (
      <View style={[styles.card, styles.skeletonCard]}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonStat} />
        <View style={styles.skeletonSubtitle} />
      </View>
    );
  }

  const cfg = getHeroConfig(status);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: cfg.backgroundColor,
          borderColor: cfg.borderColor,
          shadowColor: cfg.borderColor,
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${cfg.title} — ${cfg.subtitle}`}
    >
      {/* Glow overlay */}
      <View
        style={[styles.glowOverlay, { backgroundColor: cfg.glowColor }]}
        pointerEvents="none"
      />

      {/* Label row */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>YOUR NEXT MOVE</Text>
        {cfg.badgeText && (
          <View style={[styles.badge, { backgroundColor: cfg.badgeColor }]}>
            <Text style={styles.badgeText}>{cfg.badgeText}</Text>
          </View>
        )}
      </View>

      {/* Big title */}
      <Text style={[styles.title, { color: cfg.titleColor }]}>{cfg.title}</Text>

      {/* Week stat line */}
      {weekStat ? (
        <Text style={styles.weekStat}>{weekStat}</Text>
      ) : null}

      {/* Subtitle + chevron */}
      <View style={styles.footer}>
        <Text style={styles.subtitle}>{cfg.subtitle}</Text>
        <Text style={[styles.chevron, { color: cfg.chevronColor }]}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    minHeight: 168,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
    // shadow
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.xl,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    letterSpacing: 2,
  },
  badge: {
    borderRadius: BorderRadius.full,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.backgroundDeepNavy,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.displayMedium,
    lineHeight: Typography.lineHeightDisplay,
    marginBottom: Spacing.xs,
  },
  weekStat: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    marginBottom: Spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto' as any,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    flex: 1,
  },
  chevron: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    lineHeight: 32,
    marginLeft: Spacing.sm,
  },
  // Skeleton loader
  skeletonCard: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderColor: Colors.graphiteBorder,
    shadowColor: 'transparent',
  },
  skeletonTitle: {
    height: 34,
    width: '70%',
    backgroundColor: Colors.cardSurfaceNavyElevated,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  skeletonStat: {
    height: 14,
    width: '55%',
    backgroundColor: Colors.cardSurfaceNavyElevated,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  skeletonSubtitle: {
    height: 14,
    width: '40%',
    backgroundColor: Colors.cardSurfaceNavyElevated,
    borderRadius: BorderRadius.sm,
  },
});
