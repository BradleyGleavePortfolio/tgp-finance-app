// JetBrains Mono wrapper for ALL financial numbers
import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { Colors, Typography } from '../../theme/finance';

interface MonoTextProps {
  children: React.ReactNode;
  size?: number;
  color?: string;
  bold?: boolean;
  style?: TextStyle;
}

export function MonoText({
  children,
  size = Typography.bodyMedium,
  color = Colors.frostWhite,
  bold = false,
  style,
}: MonoTextProps) {
  return (
    <Text
      style={[
        styles.mono,
        { fontSize: size, color },
        bold && styles.bold,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// Hero net worth number — 48sp, Gold, center-aligned
export function HeroNumber({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  return (
    <Text style={[styles.hero, style]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  mono: {
    fontFamily: 'JetBrainsMono_400Regular',
  },
  bold: {
    fontFamily: 'JetBrainsMono_700Bold',
  },
  hero: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.heroNumber,
    color: Colors.accentGold,
    textAlign: 'center',
    lineHeight: Typography.lineHeightHero,
  },
});
