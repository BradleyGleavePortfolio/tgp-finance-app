/**
 * CoachSkeleton — minimal Reanimated-free shimmer for loading states.
 *
 * Stage 2 ships skeletons over spinners on every coach screen. The
 * animation is a single Animated.Value driving a 0.4 → 1 → 0.4 ping-pong
 * on opacity. Respects Reduce Motion by holding at 0.7 (the midpoint)
 * with no animation when AccessibilityInfo says so.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, AccessibilityInfo, ViewStyle } from 'react-native';
import { colors, radius } from '../../theme/tokens';

interface Props {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function CoachSkeleton({ width = '100%', height = 12, borderRadius = radius.md, style }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const opacity = useRef(new Animated.Value(reduceMotion ? 0.7 : 0.4)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (cancelled) return;
      setReduceMotion(v);
      if (v) {
        opacity.setValue(0.7);
        return;
      }
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: width as number, // RN accepts string | number; cast for TS
          height,
          backgroundColor: colors.cream,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Convenience: a stack of evenly-spaced skeleton rows for list screens. */
export function CoachSkeletonList({ rows = 5, rowHeight = 64 }: { rows?: number; rowHeight?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <CoachSkeleton
          key={i}
          height={rowHeight}
          borderRadius={radius.lg}
          style={{ marginBottom: 12 }}
        />
      ))}
    </>
  );
}
