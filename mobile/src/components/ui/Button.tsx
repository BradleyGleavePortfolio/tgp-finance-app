// Button component with Gold CTA + variants
// UX Psychology Report #3: haptic feedback by variant intent + animated press state
import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { usePressFeedback } from '../../hooks/usePressFeedback';
import type { HapticIntent } from '../HapticPressable';

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
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Override haptic intent (auto-derived from variant if not set) */
  hapticIntent?: HapticIntent;
}

/** Derive sensible haptic intent from button variant */
function intentFromVariant(variant: ButtonProps['variant']): HapticIntent {
  switch (variant) {
    case 'primary': return 'medium';
    case 'danger': return 'warning';
    case 'ghost': return 'light';
    case 'outline': return 'light';
    case 'secondary': return 'light';
    default: return 'medium';
  }
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
  accessibilityLabel,
  accessibilityHint,
  hapticIntent,
}: ButtonProps) {
  const intent: HapticIntent = hapticIntent ?? intentFromVariant(variant);
  const { animatedStyle, onPressIn, onPressOut } = usePressFeedback({
    intent,
    pressScale: 0.97,
    pressOpacity: 0.85,
  });

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

  const handlePress = () => {
    if (disabled || loading) return;
    // Fire haptic — silent on web/unsupported
    try {
      if (intent === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (intent === 'warning') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (intent === 'error') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (intent === 'heavy') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } else if (intent === 'medium') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch { /* ignore */ }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      <Animated.View
        style={[
          styles.base,
          sizeStyle,
          variantStyle,
          fullWidth && styles.fullWidth,
          (disabled || loading) && styles.disabled,
          style,
          animatedStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            color={variant === 'primary' ? Colors.backgroundDeepNavy : Colors.accentGold}
            size="small"
          />
        ) : (
          <Text style={[styles.text, textSizeStyle, variantTextStyle, textStyle]}>{title}</Text>
        )}
      </Animated.View>
    </Pressable>
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
