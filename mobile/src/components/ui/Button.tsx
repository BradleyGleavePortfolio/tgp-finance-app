// Button component with Gold CTA + variants
import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  style,
  textStyle,
  fullWidth = false,
}: ButtonProps) {
  const sizeStyle = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
    lg: styles.sizeLg,
  }[size];

  const textSizeStyle = {
    sm: styles.textSm,
    md: styles.textMd,
    lg: styles.textLg,
  }[size];

  const variantStyle = {
    primary: styles.primary,
    secondary: styles.secondary,
    ghost: styles.ghost,
    danger: styles.danger,
    outline: styles.outline,
  }[variant];

  const variantTextStyle = {
    primary: styles.primaryText,
    secondary: styles.secondaryText,
    ghost: styles.ghostText,
    danger: styles.dangerText,
    outline: styles.outlineText,
  }[variant];

  return (
    <TouchableOpacity
      style={[
        styles.base,
        sizeStyle,
        variantStyle,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? Colors.backgroundDeepNavy : Colors.accentGold}
          size="small"
        />
      ) : (
        <Text style={[styles.text, textSizeStyle, variantTextStyle, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  sizeSm: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
    minHeight: 36,
  },
  sizeMd: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    minHeight: 48,
  },
  sizeLg: {
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.xxxl,
    minHeight: 56,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  // Variants
  primary: {
    backgroundColor: Colors.accentGold,
  },
  secondary: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: Colors.debtCrimson,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.accentGold,
  },
  // Text
  text: {
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  textSm: {
    fontSize: Typography.bodySmall,
  },
  textMd: {
    fontSize: Typography.bodyMedium,
  },
  textLg: {
    fontSize: Typography.bodyLarge,
  },
  primaryText: {
    color: Colors.backgroundDeepNavy,
  },
  secondaryText: {
    color: Colors.frostWhite,
  },
  ghostText: {
    color: Colors.accentGold,
  },
  dangerText: {
    color: Colors.frostWhite,
  },
  outlineText: {
    color: Colors.accentGold,
  },
});
