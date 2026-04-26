// IdentityBadge — UX Psychology Report #3: Identity Reinforcement / Inner Circle
// UX Psychology Report #5: Premium Visual System — gold variant gets a 1.2s
//   animated shimmer on mount using React Native's built-in Animated API.
//   No new heavy dependencies; shimmer is a translateX mask on a highlight View.
//   Prop API is unchanged.
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  Animated,
  Easing,
} from 'react-native';
import { gold, neutral, typography, spacing, radius, motion } from '../theme/tokens';

export interface IdentityBadgeProps {
  rank: number;
  isFoundingMember: boolean;
  style?: ViewStyle;
}

export function IdentityBadge({ rank, isFoundingMember, style }: IdentityBadgeProps) {
  // Shimmer animation value — only active for founding members
  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    if (!isFoundingMember) return;

    // Single shimmer sweep on mount (translateX: -pillWidth → +pillWidth)
    // Duration: motion.duration.shimmer (1200 ms)
    Animated.timing(shimmerAnim, {
      toValue: 1,
      duration: motion.duration.shimmer,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
      delay: 300,  // short pause after render so it feels intentional
    }).start();
  }, [isFoundingMember]);

  if (!rank || rank <= 0) return null;

  const label = isFoundingMember
    ? `Founding Member · #${rank}`
    : `Member #${rank}`;

  const badgeColor  = isFoundingMember ? gold[400]  : neutral[400];
  const badgeBg     = isFoundingMember ? gold.overlay12 : 'rgba(136, 149, 167, 0.10)';

  // Shimmer highlight: translates across the pill width
  // We approximate pill width as 240 px — the highlight overflows but is clipped by overflow:hidden
  const PILL_WIDTH = 240;
  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange:  [-1, 1],
    outputRange: [-PILL_WIDTH, PILL_WIDTH],
  });

  return (
    <View
      style={[
        styles.pill,
        { borderColor: badgeColor, backgroundColor: badgeBg },
        style,
      ]}
    >
      {isFoundingMember && (
        <Text style={[styles.star, { color: badgeColor }]}>★ </Text>
      )}
      <Text style={[styles.label, { color: badgeColor }]}>{label}</Text>

      {/* Shimmer overlay — rendered only for founding members, clipped by pill overflow */}
      {isFoundingMember && (
        <Animated.View
          style={[
            styles.shimmerHighlight,
            { transform: [{ translateX: shimmerTranslate }] },
          ]}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    overflow: 'hidden',  // clips the shimmer highlight
  },
  star: {
    fontFamily: typography.families.bold,
    fontSize: typography.scale.caption.fontSize,
    lineHeight: typography.scale.caption.lineHeight,
  },
  label: {
    fontFamily: typography.families.semiBold,
    fontSize: typography.scale.caption.fontSize,
    letterSpacing: 0.3,
  },
  // Shimmer: a narrow angled white bar that sweeps across the pill
  shimmerHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    // 15° tilt via skewX is unsupported on Android; use a vertical gradient proxy
    // by keeping it a simple thin bar — still very effective on dark backgrounds.
  },
});
