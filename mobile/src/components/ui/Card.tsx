// Glass-morphism card component
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Shadows, Spacing } from '../../theme/finance';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  variant?: 'default' | 'gold' | 'crimson' | 'elevated';
  padding?: number;
}

export function Card({ children, style, variant = 'default', padding = Spacing.base }: CardProps) {
  const variantStyle = {
    default: styles.default,
    gold: styles.gold,
    crimson: styles.crimson,
    elevated: styles.elevated,
  }[variant];

  return (
    <View style={[styles.base, variantStyle, { padding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    ...Shadows.card,
  },
  default: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderColor: Colors.graphiteBorder,
  },
  gold: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderColor: Colors.accentGold,
    borderWidth: 1.5,
    ...Shadows.glow,
  },
  crimson: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderColor: Colors.debtCrimson,
    borderWidth: 1.5,
    ...Shadows.glowCrimson,
  },
  elevated: {
    backgroundColor: Colors.cardSurfaceNavyElevated,
    borderColor: Colors.graphiteBorder,
    ...Shadows.cardLarge,
  },
});
