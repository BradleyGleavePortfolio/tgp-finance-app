// IdentityBadge — UX Psychology Report #3: Identity Reinforcement / Inner Circle
// luxury/wave1: shimmer animation removed.
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { gold, neutral, typography, spacing, radius } from '../theme/tokens';

export interface IdentityBadgeProps {
  rank: number;
  isFoundingMember: boolean;
  style?: ViewStyle;
}

export function IdentityBadge({ rank, isFoundingMember, style }: IdentityBadgeProps) {
  if (!rank || rank <= 0) return null;

  const label = isFoundingMember
    ? `Founding Member · #${rank}`
    : `Member #${rank}`;

  const badgeColor  = isFoundingMember ? gold[400]  : neutral[400];
  const badgeBg     = isFoundingMember ? 'rgba(197, 162, 83, 0.10)' : 'rgba(177, 168, 159, 0.10)';

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
  // shimmerHighlight: removed (luxury/wave1)
});
