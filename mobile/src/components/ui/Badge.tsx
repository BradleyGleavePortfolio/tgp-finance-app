import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { getVelocityLevel } from '../../utils/financial';

interface BadgeProps {
  text: string;
  color?: string;
  style?: ViewStyle;
  size?: 'sm' | 'md' | 'lg';
}

export function Badge({ text, color = Colors.accentGold, style, size = 'md' }: BadgeProps) {
  return (
    <View style={[styles.badge, sizeStyles[size], { borderColor: color }, style]}>
      <Text style={[styles.text, sizeTextStyles[size], { color }]}>{text}</Text>
    </View>
  );
}

interface ProgressMarkerProps {
  streak: number;
  style?: ViewStyle;
}

export function ProgressMarker({ streak, style }: ProgressMarkerProps) {
  const color = streak >= 30 ? Colors.accentGold : streak >= 7 ? Colors.profitGreen : Colors.slateGray;
  return (
    <Badge text={`${streak}d`} color={color} style={style} />
  );
}

interface MomentumIndicatorProps {
  score: number;
  showScore?: boolean;
  style?: ViewStyle;
}

export function MomentumIndicator({ score, showScore = true, style }: MomentumIndicatorProps) {
  const { name, color } = getVelocityLevel(score);
  return (
    <Badge
      text={showScore ? `${name} • ${score}` : name}
      color={color}
      style={style}
    />
  );
}

const sizeStyles = {
  sm: { paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  md: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  lg: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
};

const sizeTextStyles = {
  sm: { fontSize: Typography.microLabel },
  md: { fontSize: Typography.bodySmall },
  lg: { fontSize: Typography.bodyMedium },
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
});
