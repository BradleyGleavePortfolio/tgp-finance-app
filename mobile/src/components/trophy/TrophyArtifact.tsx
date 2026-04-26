// TrophyArtifact — UX Psychology Report #5: Trophy-Grade Milestone Artifact
// 1080×1080 branded card rendered off-screen, captured via react-native-view-shot,
// then saved / shared using expo-media-library + expo-sharing.
//
// Layout: gold/brand gradient bg · big stat headline · identity title · footer
// Graceful no-op if capture or sharing modules are unavailable.
import React, { forwardRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TrophyTheme = 'gold' | 'brand' | 'debt' | 'net_worth';

export interface TrophyArtifactProps {
  /** Big headline stat, e.g. "DEBT FREE", "$5K SAVED", "GOAL #1 CRUSHED" */
  headline: string;
  /** Smaller subtitle beneath headline, e.g. "First $1,000 in Cash" */
  subtitle?: string;
  /** User identity title, e.g. "Debt Crusher" */
  identityTitle?: string;
  /** Show founding-member ribbon in corner */
  isFoundingMember?: boolean;
  /** Visual theme */
  theme?: TrophyTheme;
}

// ─── Internal dimensions (square, ≈ 1080pt for Retina export) ─────────────────
export const TROPHY_SIZE = 360; // logical pts — view-shot captures @3× → 1080 px

// ─── Gradient presets ─────────────────────────────────────────────────────────
const GRADIENT: Record<TrophyTheme, readonly [string, string, ...string[]]> = {
  gold:      ['#1A1200', '#0D1117', '#1C1800'] as const,
  brand:     ['#001A1C', '#0D1117', '#001618'] as const,
  debt:      ['#1A0004', '#0D1117', '#18000A'] as const,
  net_worth: ['#001A0A', '#0D1117', '#001A0A'] as const,
};

const ACCENT_COLOR: Record<TrophyTheme, string> = {
  gold:      Colors.accentGold,
  brand:     Colors.investmentTeal,
  debt:      Colors.debtCrimson,
  net_worth: Colors.profitGreen,
};

// ─── Component ────────────────────────────────────────────────────────────────

export const TrophyArtifact = forwardRef<View, TrophyArtifactProps>(
  function TrophyArtifact(
    {
      headline,
      subtitle,
      identityTitle,
      isFoundingMember = false,
      theme = 'gold',
    },
    ref,
  ) {
    const accent = ACCENT_COLOR[theme];
    const gradientColors = GRADIENT[theme];

    return (
      <View
        ref={ref}
        collapsable={false}
        style={styles.wrapper}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          {/* Founding-member ribbon ──────────────────────────────────────── */}
          {isFoundingMember && (
            <View style={styles.ribbonWrapper}>
              <View style={[styles.ribbon, { backgroundColor: accent }]}>
                <Text style={styles.ribbonText}>FOUNDING MEMBER</Text>
              </View>
            </View>
          )}

          {/* Top accent bar ──────────────────────────────────────────────── */}
          <View style={[styles.topBar, { backgroundColor: accent }]} />

          {/* Trophy icon ────────────────────────────────────────────────── */}
          <Text style={styles.trophyEmoji}>🏆</Text>

          {/* Big stat headline ───────────────────────────────────────────── */}
          <Text style={[styles.headline, { color: accent }]} numberOfLines={2} adjustsFontSizeToFit>
            {headline}
          </Text>

          {/* Subtitle ────────────────────────────────────────────────────── */}
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          )}

          {/* Divider ─────────────────────────────────────────────────────── */}
          <View style={[styles.divider, { backgroundColor: accent }]} />

          {/* Identity title ──────────────────────────────────────────────── */}
          {!!identityTitle && (
            <View style={styles.identityBlock}>
              <Text style={[styles.identityLabel, { color: accent }]}>MY IDENTITY</Text>
              <Text style={styles.identityTitle}>{identityTitle}</Text>
            </View>
          )}

          {/* Spacer ──────────────────────────────────────────────────────── */}
          <View style={{ flex: 1 }} />

          {/* Footer ──────────────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <View style={[styles.footerDot, { backgroundColor: accent }]} />
            <Text style={[styles.footerText, { color: accent }]}>@theGrowthProject</Text>
            <View style={[styles.footerDot, { backgroundColor: accent }]} />
          </View>

          {/* Bottom accent bar ───────────────────────────────────────────── */}
          <View style={[styles.bottomBar, { backgroundColor: accent }]} />
        </LinearGradient>
      </View>
    );
  },
);

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    width: TROPHY_SIZE,
    height: TROPHY_SIZE,
    borderRadius: BorderRadius.xxl,
    overflow: 'hidden',
    // Gold glow for the live preview
    shadowColor: Colors.accentGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 20,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.xxl,
    paddingTop: 0,
    paddingBottom: 0,
    borderWidth: 1.5,
    borderColor: 'rgba(249,199,79,0.30)',
    borderRadius: BorderRadius.xxl,
  },
  // ── Founding ribbon ──────────────────────────────────────────────────────
  ribbonWrapper: {
    position: 'absolute',
    top: 18,
    right: -26,
    zIndex: 10,
    transform: [{ rotate: '38deg' }],
    width: 120,
    alignItems: 'center',
  },
  ribbon: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xs,
  },
  ribbonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 7,
    color: Colors.backgroundDeepNavy,
    letterSpacing: 1.2,
  },
  // ── Bars ────────────────────────────────────────────────────────────────
  topBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.lg,
  },
  bottomBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    marginTop: Spacing.md,
  },
  // ── Content ────────────────────────────────────────────────────────────
  trophyEmoji: {
    fontSize: 52,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  headline: {
    fontFamily: 'Inter_700Bold',
    fontSize: 38,
    lineHeight: 44,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    width: 48,
    height: 2,
    borderRadius: 1,
    marginVertical: Spacing.lg,
    opacity: 0.7,
  },
  identityBlock: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  identityLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 2.5,
  },
  identityTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    textAlign: 'center',
  },
  // ── Footer ────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  footerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.8,
  },
  footerText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodySmall,
    letterSpacing: 0.5,
  },
});
