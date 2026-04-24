// Shareable social card — Spotify-Wrapped-style, screenshot-friendly.
// Privacy: callers must pass only non-PII copy. No account balances, names, or identifiers here.
import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '../theme/finance';

export type ShareCardTheme = 'gold' | 'green' | 'teal';

export interface ShareCardProps {
  title: string;
  subtitle?: string;
  primaryStat: string;
  primaryStatLabel?: string;
  secondaryStat?: string;
  secondaryStatLabel?: string;
  emoji?: string;
  footer?: string;
  theme?: ShareCardTheme;
}

const THEME_ACCENT: Record<ShareCardTheme, string> = {
  gold: Colors.accentGold,
  green: Colors.profitGreen,
  teal: Colors.investmentTeal,
};

const CARD_WIDTH = 360;
const CARD_HEIGHT = 640;

export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  {
    title,
    subtitle,
    primaryStat,
    primaryStatLabel,
    secondaryStat,
    secondaryStatLabel,
    emoji,
    footer = '— The Growth Project',
    theme = 'gold',
  },
  ref,
) {
  const accent = THEME_ACCENT[theme];

  return (
    <View ref={ref} collapsable={false} style={styles.wrapper}>
      <LinearGradient
        colors={[Colors.backgroundDeepNavy, Colors.cardSurfaceNavyElevated]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={[styles.accentBar, { backgroundColor: accent }]} />

        <View style={styles.header}>
          {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
          <Text style={[styles.eyebrow, { color: accent }]} numberOfLines={1}>
            {subtitle ?? 'THE GROWTH PROJECT'}
          </Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={4} adjustsFontSizeToFit>
            {title}
          </Text>

          <View style={styles.primaryStatBlock}>
            {primaryStatLabel ? (
              <Text style={styles.statLabel}>{primaryStatLabel}</Text>
            ) : null}
            <Text
              style={[styles.primaryStat, { color: accent }]}
              numberOfLines={2}
              adjustsFontSizeToFit
            >
              {primaryStat}
            </Text>
          </View>

          {secondaryStat ? (
            <View style={styles.secondaryStatBlock}>
              {secondaryStatLabel ? (
                <Text style={styles.statLabel}>{secondaryStatLabel}</Text>
              ) : null}
              <Text style={styles.secondaryStat} numberOfLines={2}>
                {secondaryStat}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footerBlock}>
          <View style={[styles.footerDot, { backgroundColor: accent }]} />
          <Text style={styles.footer}>{footer}</Text>
        </View>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: Colors.backgroundDeepNavy,
  },
  card: {
    flex: 1,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 6,
    height: '100%',
  },
  header: {
    gap: Spacing.sm,
  },
  emoji: {
    fontSize: 56,
  },
  eyebrow: {
    fontFamily: Typography.fontPrimaryBold,
    fontSize: Typography.bodySmall,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  body: {
    gap: Spacing.xl,
  },
  title: {
    fontFamily: Typography.fontPrimaryBold,
    fontSize: Typography.displaySmall,
    color: Colors.frostWhite,
    lineHeight: Typography.lineHeightTitle,
  },
  primaryStatBlock: {
    gap: Spacing.xs,
  },
  primaryStat: {
    fontFamily: Typography.fontMonoBold,
    fontSize: Typography.displayMedium,
  },
  secondaryStatBlock: {
    gap: Spacing.xs,
  },
  secondaryStat: {
    fontFamily: Typography.fontPrimarySemiBold,
    fontSize: Typography.bodyLarge,
    color: Colors.frostWhite,
  },
  statLabel: {
    fontFamily: Typography.fontPrimary,
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  footerBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  footerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footer: {
    fontFamily: Typography.fontPrimarySemiBold,
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    letterSpacing: 0.5,
  },
});
