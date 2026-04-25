// IdentityBadge — UX Psychology Report #3: Identity Reinforcement / Inner Circle
// Shows "Founding Member · #47" as a gold pill when the user is a founding member,
// or a muted silver pill with just the rank for later members.
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../theme/finance';

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

  const badgeColor = isFoundingMember ? Colors.accentGold : Colors.slateGray;
  const badgeBg = isFoundingMember
    ? 'rgba(249, 199, 79, 0.12)'
    : 'rgba(136, 149, 167, 0.10)';

  return (
    <View style={[styles.pill, { borderColor: badgeColor, backgroundColor: badgeBg }, style]}>
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
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  star: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodySmall,
    lineHeight: Typography.lineHeightSmall,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    letterSpacing: 0.3,
  },
});
