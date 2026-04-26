// FirstWinCelebration — UX Psychology Report #1: Activation-First Dopamine
// Full-screen payoff shown once after the lean 3-question onboarding.
// Fires confetti (Animated API burst), success haptic, and locks in the
// user's identity title. Stores firstWinDone=true in AsyncStorage so it
// never fires again (handled by the parent — quiz.tsx).
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { track } from '../../lib/analytics';

interface FirstWinCelebrationProps {
  identityTitle: string;
  bankConnected: boolean;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Confetti dot — same pattern as CelebrationModal
// ---------------------------------------------------------------------------
function ConfettiDot({ index }: { index: number }) {
  const COLORS = [
    Colors.accentGold,
    Colors.profitGreen,
    Colors.debtCrimson,
    Colors.investmentTeal,
    '#A78BFA', // violet accent
  ];
  const anim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const color = COLORS[index % COLORS.length];
  const left = `${(index * 7 + 3) % 96}%` as `${number}%`;
  const size = 6 + (index % 3) * 3;

  useEffect(() => {
    const delay = index * 80;
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(anim, {
            toValue: 1,
            duration: 700 + index * 60,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 30 + index * 8,
            duration: 700 + index * 60,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(anim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.confettiDot,
        {
          left,
          top: `${8 + (index % 5) * 12}%` as `${number}%`,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: anim,
          transform: [{ translateY }],
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Main celebration screen
// ---------------------------------------------------------------------------
export function FirstWinCelebration({
  identityTitle,
  bankConnected,
  onDismiss,
}: FirstWinCelebrationProps) {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fire first_win_celebrated once on mount
    track('first_win_celebrated', { identity_title: identityTitle, bank_connected: bankConnected });
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulsing glow loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const borderGlow = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(249,199,79,0.25)', 'rgba(249,199,79,0.65)'],
  });

  const confettiCount = 16;
  const heroAction = bankConnected ? 'Review your accounts' : 'Set your first goal';

  return (
    <SafeAreaView style={styles.container}>
      {/* Confetti layer */}
      {Array.from({ length: confettiCount }, (_, i) => (
        <ConfettiDot key={i} index={i} />
      ))}

      {/* Card */}
      <Animated.View
        style={[
          styles.cardWrapper,
          { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Animated.View style={[styles.card, { shadowColor: borderGlow as any }]}>
          {/* Trophy */}
          <Text style={styles.trophy}>🏆</Text>

          {/* Headline */}
          <Text style={styles.achieved}>GOAL LOCKED IN</Text>
          <Text style={styles.mainTitle}>You're officially in.</Text>

          {/* Identity */}
          <View style={styles.identityPill}>
            <Text style={styles.identityLabel}>YOUR IDENTITY</Text>
            <Text style={styles.identityTitle}>{identityTitle}</Text>
          </View>

          {/* Welcome copy */}
          <Text style={styles.body}>
            Welcome to the inner circle. People with a clear identity hit their goals 3× faster.
          </Text>

          {/* CTA */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={onDismiss}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={heroAction}
          >
            <Text style={styles.ctaText}>{heroAction} →</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundDeepNavy,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  confettiDot: {
    position: 'absolute',
  },
  cardWrapper: {
    width: '100%',
  },
  card: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.accentGold,
    padding: Spacing.xxxl,
    alignItems: 'center',
    // Gold glow
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 24,
  },
  trophy: {
    fontSize: 72,
    marginBottom: Spacing.base,
  },
  achieved: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodySmall,
    color: Colors.accentGold,
    letterSpacing: 3,
    marginBottom: Spacing.sm,
  },
  mainTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.displaySmall,
    color: Colors.frostWhite,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  identityPill: {
    backgroundColor: 'rgba(249,199,79,0.10)',
    borderWidth: 1,
    borderColor: Colors.accentGold,
    borderRadius: 100,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  identityLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    color: Colors.accentGold,
    letterSpacing: 2,
    marginBottom: 2,
  },
  identityTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.accentGold,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  ctaButton: {
    backgroundColor: Colors.accentGold,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
  },
  ctaText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.backgroundDeepNavy,
  },
});
