// Animated progress bar — debt crimson → green as balance decreases
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Text, ViewStyle } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../../theme/finance';

interface ProgressBarProps {
  progress: number; // 0-100
  height?: number;
  showLabel?: boolean;
  label?: string;
  variant?: 'debt' | 'savings' | 'gold' | 'default';
  style?: ViewStyle;
  animated?: boolean;
}

export function ProgressBar({
  progress,
  height = 8,
  showLabel = false,
  label,
  variant = 'default',
  style,
  animated = true,
}: ProgressBarProps) {
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const clampedProgress = Math.min(100, Math.max(0, progress));

  useEffect(() => {
    if (animated) {
      Animated.timing(animatedWidth, {
        toValue: clampedProgress,
        duration: 600,
        useNativeDriver: false,
      }).start();
    } else {
      animatedWidth.setValue(clampedProgress);
    }
  }, [clampedProgress]);

  const fillColor = {
    debt: progress > 50 ? Colors.debtCrimson : Colors.profitGreen, // crimson → green as debt shrinks
    savings: Colors.profitGreen,
    gold: Colors.accentGold,
    default: Colors.accentGold,
  }[variant];

  return (
    <View style={style}>
      {(showLabel || label) && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <Text style={[styles.label, { color: Colors.frostWhite }]}>{clampedProgress.toFixed(0)}%</Text>
        </View>
      )}
      <View style={[styles.track, { height }]}>
        <Animated.View
          style={[
            styles.fill,
            { height },
            {
              backgroundColor: fillColor,
              width: animatedWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: BorderRadius.full,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  label: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.slateGray,
  },
});
