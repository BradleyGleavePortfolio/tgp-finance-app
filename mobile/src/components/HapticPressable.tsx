// HapticPressable — UX Psychology Report #3: Haptics + State Feedback Everywhere
// Wraps Pressable with intent-based haptic feedback and animated press states.
import React, { useRef, useCallback } from 'react';
import {
  Pressable,
  Animated,
  PressableProps,
  StyleProp,
  ViewStyle,
  GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

export type HapticIntent =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error';

interface HapticPressableProps extends Omit<PressableProps, 'style'> {
  intent?: HapticIntent;
  style?: StyleProp<ViewStyle>;
  /** Scale on press (default 0.97) */
  pressScale?: number;
  /** Opacity on press (default 0.85) */
  pressOpacity?: number;
  children: React.ReactNode;
}

async function fireHaptic(intent: HapticIntent): Promise<void> {
  try {
    switch (intent) {
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // Silently ignore — web / unsupported platform
  }
}

export function HapticPressable({
  intent = 'light',
  style,
  pressScale = 0.97,
  pressOpacity = 0.85,
  onPress,
  onPressIn,
  onPressOut,
  children,
  disabled,
  ...rest
}: HapticPressableProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: pressScale,
          useNativeDriver: true,
          speed: 50,
          bounciness: 0,
        }),
        Animated.timing(opacityAnim, {
          toValue: pressOpacity,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start();
      onPressIn?.(e);
    },
    [scaleAnim, opacityAnim, pressScale, pressOpacity, onPressIn]
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          speed: 30,
          bounciness: 3,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
      onPressOut?.(e);
    },
    [scaleAnim, opacityAnim, onPressOut]
  );

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (!disabled) {
        fireHaptic(intent);
      }
      onPress?.(e);
    },
    [intent, disabled, onPress]
  );

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      {...rest}
    >
      <Animated.View
        style={[
          { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
          style,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
