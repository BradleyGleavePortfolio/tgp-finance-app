// HeroAction — UX Psychology Report #1: One Dominant Home Action
// UX Psychology Report #3: Haptic feedback — medium impact on hero press.
// UX Psychology Report #4: Tone variants (gentle/direct/drill) + currency prop.
// UX Psychology Report #5: Premium Visual System — tokens-driven styles,
//   card shadow from tokens, subtle radial-style gradient via dual-layer View,
//   founder tier gets gold accent stop on the glow overlay.
// Large pressable hero card that surfaces the single most important action
// for the user right now. Status logic: needs_attention > on_track > no_goals
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { neutral, semantic, gold, typography, spacing, radius, shadows, motion } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';

export type HeroStatus = 'on_track' | 'needs_attention' | 'no_goals' | 'loading';
export type MotivationalTone = 'gentle' | 'direct' | 'drill';

interface HeroActionProps {
  status: HeroStatus;
  weekStat?: string;       // e.g. "$1,240 spent · $360 left in budget"
  onPress: () => void;
  /** UX Psych #4: motivational tone variant */
  tone?: MotivationalTone;
  /** UX Psych #4: currency code for display */
  currency?: string;
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

// Tone-aware title map for on_track / needs_attention states
const TONE_TITLES: Record<MotivationalTone, { on_track: string; needs_attention: string }> = {
  gentle: {
    on_track: "When you're ready, take a peek",
    needs_attention: "One small thing needs a look",
  },
  direct: {
    on_track: "You're On Track \u2713",
    needs_attention: "Make a Move",
  },
  drill: {
    on_track: "Move money. Now.",
    needs_attention: "Fix it. Today.",
  },
};

function getHeroConfig(status: HeroStatus, isFounder: boolean, tone: MotivationalTone): HeroConfig {
  const titles = TONE_TITLES[tone];
  switch (status) {
    case 'needs_attention':
      return {
        title: titles.needs_attention,
        subtitle: '1 thing needs your attention today',
        backgroundColor: '#1A0F0F',
        borderColor: semantic.danger,
        glowColor: semantic.dangerBg,
        chevronColor: semantic.danger,
        titleColor: neutral[100],
        badgeText: '!',
        badgeColor: semantic.danger,
      };
    case 'on_track':
      return {
        title: titles.on_track,
        subtitle: 'Review this week',
        backgroundColor: '#0A1A14',
        borderColor: semantic.success,
        glowColor: semantic.successBg,
        chevronColor: semantic.success,
        titleColor: semantic.success,
        badgeText: '\u2713',
        badgeColor: semantic.success,
      };
    case 'no_goals':
    default:
      return {
        title: 'Set Your First Goal',
        subtitle: 'Build your financial plan in 2 minutes',
        backgroundColor: neutral[800],
        // Founders get a slightly richer gold border; free tier is standard accent gold
        borderColor: gold[400],
        glowColor: isFounder ? 'rgba(74, 4, 4, 0.10)' : 'rgba(74, 4, 4, 0.08),',
        chevronColor: gold[400],
        titleColor: gold[400],
      };
  }
}

function fireHeroHaptic() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* ignore */ }
}

export function HeroAction({ status, weekStat, onPress, tone = 'direct', currency }: HeroActionProps) {
  const { isFounder } = useTheme();

  if (status === 'loading') {
    return (
      <View style={styles.card}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonStat} />
        <View style={styles.skeletonSubtitle} />
      </View>
    );
  }

  const cfg = getHeroConfig(status, isFounder, tone);

  const handlePress = () => {
    fireHeroHaptic();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: cfg.backgroundColor,
          borderColor: cfg.borderColor,
          shadowColor: cfg.borderColor,
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${cfg.title} — ${cfg.subtitle}`}
    >
      {/* Base glow overlay */}
      <View
        style={[styles.glowOverlay, { backgroundColor: cfg.glowColor }]}
        pointerEvents="none"
      />

      {/* Founder: extra luminance stop at the top of the card (gold accent gradient effect) */}
      {isFounder && (
        <View
          style={styles.founderAccentStop}
          pointerEvents="none"
        />
      )}

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
    borderRadius: radius.lg,
    borderWidth: 1.5,
    minHeight: 168,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    // Tokens-driven shadow (lg)
    ...shadows.lg,
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
  },
  // Founder accent: narrow hairline band at top of card (no glow — Wave 2)
  founderAccentStop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: 'rgba(197, 162, 83, 0.08)',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  label: {
    fontFamily: typography.families.semiBold,
    ...typography.scale.micro,
    color: neutral[400],
  },
  badge: {
    borderRadius: radius.pill,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: typography.families.bold,
    fontSize: 10,
    color: neutral[950],
  },
  title: {
    fontFamily: typography.families.bold,
    ...typography.scale.h1,
    marginBottom: spacing.xs,
  },
  weekStat: {
    fontFamily: typography.families.mono,
    ...typography.scale.caption,
    color: neutral[400],
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto' as any,
  },
  subtitle: {
    fontFamily: typography.families.medium,
    ...typography.scale.bodySmall,
    color: neutral[400],
    flex: 1,
  },
  chevron: {
    fontFamily: typography.families.bold,
    fontSize: 28,
    lineHeight: 32,
    marginLeft: spacing.sm,
  },
  // Skeleton loader
  skeletonTitle: {
    height: 34,
    width: '70%',
    backgroundColor: neutral[800],
    borderRadius: radius.md,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  skeletonStat: {
    height: 14,
    width: '55%',
    backgroundColor: neutral[800],
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  skeletonSubtitle: {
    height: 14,
    width: '40%',
    backgroundColor: neutral[800],
    borderRadius: radius.md,
  },
});
