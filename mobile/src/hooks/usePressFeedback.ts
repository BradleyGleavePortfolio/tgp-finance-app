// usePressFeedback — UX Psychology Report #3: Haptics + State Feedback Everywhere
// Hook for adding haptic + animated press feedback to elements where you can't
// swap to HapticPressable (e.g. complex compound components, FlatList items, etc.)
import { useRef, useCallback } from 'react';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { HapticIntent } from '../components/HapticPressable';

interface UsePressFeedbackOptions {
  intent?: HapticIntent;
  pressScale?: number;
  pressOpacity?: number;
}

interface UsePressFeedbackResult {
  scaleAnim: Animated.Value;
  opacityAnim: Animated.Value;
  animatedStyle: { transform: { scale: Animated.Value }[]; opacity: Animated.Value };
  onPressIn: () => void;
  onPressOut: () => void;
  /** Call inside your onPress handler */
  triggerHaptic: () => Promise<void>;
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

export function usePressFeedback({
  intent = 'light',
  pressScale = 0.97,
  pressOpacity = 0.85,
}: UsePressFeedbackOptions = {}): UsePressFeedbackResult {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
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
  }, [scaleAnim, opacityAnim, pressScale, pressOpacity]);

  const onPressOut = useCallback(() => {
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
  }, [scaleAnim, opacityAnim]);

  const triggerHaptic = useCallback(() => fireHaptic(intent), [intent]);

  return {
    scaleAnim,
    opacityAnim,
    animatedStyle: {
      transform: [{ scale: scaleAnim }],
      opacity: opacityAnim,
    },
    onPressIn,
    onPressOut,
    triggerHaptic,
  };
}
