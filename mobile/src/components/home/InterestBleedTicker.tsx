// Live pulsing red interest bleed ticker
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { formatCurrency } from '../../utils/formatters';

interface InterestBleedTickerProps {
  dailyInterest: number;
  onPress?: () => void;
}

export function InterestBleedTicker({ dailyInterest, onPress }: InterestBleedTickerProps) {
  const [elapsed, setElapsed] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const startTime = useRef(Date.now());

  // Pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Real-time counter updating every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((Date.now() - startTime.current) / 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const perSecond = dailyInterest / 86400;
  const totalToday = perSecond * (new Date().getHours() * 3600 + new Date().getMinutes() * 60 + new Date().getSeconds());

  if (dailyInterest <= 0) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Open interest bleed detail"
      accessibilityHint="Shows how much interest your debts are accumulating right now"
    >
      <View style={styles.container}>
        <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
        <Text style={styles.label}>Debt costs you </Text>
        <Text style={styles.amount}>{formatCurrency(totalToday, { decimals: 4 })}</Text>
        <Text style={styles.label}> today</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(230, 57, 70, 0.1)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(230, 57, 70, 0.3)',
    alignSelf: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.debtCrimson,
    marginRight: Spacing.xs,
  },
  label: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  amount: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.bodySmall,
    color: Colors.debtCrimson,
  },
});
