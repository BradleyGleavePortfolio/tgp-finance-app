// Quiet acknowledgement shown once after the 3-question onboarding.
// Per doctrine §10: no confetti, no spring/gamified animation, no gold pill,
// no trophy/emoji, no celebratory copy. A centered card, soft fade-in,
// single restrained CTA. Mirrors CelebrationModal's pattern.
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

export function FirstWinCelebration({
  identityTitle,
  bankConnected,
  onDismiss,
}: FirstWinCelebrationProps) {
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    track('first_win_celebrated', {
      identity_title: identityTitle,
      bank_connected: bankConnected,
    });
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const ctaLabel = bankConnected ? 'Review your accounts' : 'Set your first goal';

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.card, { opacity: opacityAnim }]}>
        <View style={styles.hairline} />
        <Text style={styles.eyebrow}>Goal set</Text>
        <Text style={styles.title}>The work begins.</Text>

        <Text style={styles.identityLabel}>Your identity</Text>
        <Text style={styles.identityTitle}>{identityTitle}</Text>

        <Text style={styles.body}>
          A clear goal is the first move. The rest follows.
        </Text>

        <TouchableOpacity
          style={styles.ctaButton}
          onPress={onDismiss}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
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
  card: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: 4,
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xxxl,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  hairline: {
    width: 24,
    height: 1,
    backgroundColor: Colors.accentGold,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodySmall,
    color: Colors.accentGold,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.displaySmall,
    color: Colors.frostWhite,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  identityLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  identityTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    textAlign: 'center',
    marginBottom: Spacing.xl,
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
    borderWidth: 1,
    borderColor: Colors.accentGold,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: 4,
    alignItems: 'center',
    width: '100%',
  },
  ctaText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMedium,
    color: Colors.accentGold,
    letterSpacing: 1,
  },
});
