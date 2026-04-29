// Post-EOD submission result screen
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Button } from '../ui/Button';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { formatCurrency } from '../../utils/formatters';

interface SubmissionResultProps {
  newNetWorth: number;
  previousNetWorth: number;
  aiInsight?: string;
  onDismiss: () => void;
}

export function SubmissionResult({
  newNetWorth,
  previousNetWorth,
  aiInsight,
  onDismiss,
}: SubmissionResultProps) {
  const change = newNetWorth - previousNetWorth;
  const isPositive = change >= 0;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
      <Text style={styles.title}>Check-in Complete</Text>

      {/* Animated net worth */}
      <Text style={styles.netWorthLabel}>NET WORTH</Text>
      <Text style={styles.netWorth}>{formatCurrency(newNetWorth)}</Text>

      {/* Change indicator */}
      <Text style={[styles.change, { color: isPositive ? Colors.profitGreen : Colors.debtCrimson }]}>
        {isPositive ? '+' : ''}{formatCurrency(change)} today
      </Text>

      {/* AI Insight */}
      {aiInsight && (
        <View style={styles.insightBox}>
          <Text style={styles.insightLabel}>FP INSIGHT</Text>
          <Text style={styles.insightText}>{aiInsight}</Text>
        </View>
      )}

      <Button title="Back" onPress={onDismiss} variant="primary" fullWidth style={styles.btn} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.backgroundDeepNavy,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.displaySmall,
    color: Colors.frostWhite,
    marginBottom: Spacing.xl,
  },
  netWorthLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  netWorth: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.heroNumber,
    color: Colors.accentGold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  change: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.titleSmall,
    marginBottom: Spacing.xl,
  },
  insightBox: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: 4, // radius.lg
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentGold,
    padding: Spacing.base,
    marginBottom: Spacing.xl,
    width: '100%',
  },
  insightLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.microLabel,
    color: Colors.accentGold,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  insightText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.frostWhite,
    lineHeight: 20,
  },
  btn: { marginTop: Spacing.base },
});
