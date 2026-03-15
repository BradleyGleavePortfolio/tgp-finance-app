// Post-EOD submission celebration screen
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Button } from '../ui/Button';
import { StreakBadge } from '../ui/Badge';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { formatCurrency } from '../../utils/formatters';

interface SubmissionResultProps {
  newNetWorth: number;
  previousNetWorth: number;
  streak: number;
  aiInsight?: string;
  onDismiss: () => void;
}

export function SubmissionResult({
  newNetWorth,
  previousNetWorth,
  streak,
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
      <Text style={styles.checkmark}>✓</Text>
      <Text style={styles.title}>Check-in Complete</Text>

      {/* Animated net worth */}
      <Text style={styles.netWorthLabel}>NET WORTH</Text>
      <Text style={styles.netWorth}>{formatCurrency(newNetWorth)}</Text>

      {/* Change indicator */}
      <Text style={[styles.change, { color: isPositive ? Colors.profitGreen : Colors.debtCrimson }]}>
        {isPositive ? '+' : ''}{formatCurrency(change)} today
      </Text>

      {/* Streak */}
      <View style={styles.streakRow}>
        <StreakBadge streak={streak} />
        <Text style={styles.streakText}>
          {streak >= 7 ? '🔥 Keep the chain alive!' : 'Build your streak — check in tomorrow'}
        </Text>
      </View>

      {/* AI Insight */}
      {aiInsight && (
        <View style={styles.insightBox}>
          <Text style={styles.insightLabel}>FP INSIGHT</Text>
          <Text style={styles.insightText}>{aiInsight}</Text>
        </View>
      )}

      <Button title="Back to Command Center" onPress={onDismiss} variant="primary" fullWidth style={styles.btn} />
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
  checkmark: {
    fontSize: 56,
    color: Colors.profitGreen,
    marginBottom: Spacing.base,
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
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  streakText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    flex: 1,
  },
  insightBox: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: 10,
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
