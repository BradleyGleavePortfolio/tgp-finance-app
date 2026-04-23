// Full-screen milestone celebration with confetti animation
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Modal, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { MILESTONE_DEFINITIONS } from '../../utils/constants';
import type { MilestoneUnlock } from '../../types';

interface CelebrationModalProps {
  milestone: MilestoneUnlock | null;
  onDismiss: () => void;
}

export function CelebrationModal({ milestone, onDismiss }: CelebrationModalProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (milestone) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [milestone]);

  if (!milestone) return null;

  const definition = MILESTONE_DEFINITIONS.find((m) => m.key === milestone.milestone_key);
  if (!definition) return null;

  // Animated confetti dots
  const confetti = Array.from({ length: 12 }, (_, i) => i);

  return (
    <Modal transparent animationType="fade" visible={!!milestone}>
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        {/* Confetti dots */}
        {confetti.map((i) => (
          <ConfettiDot key={i} index={i} />
        ))}

        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          <Text style={styles.icon}>{definition.icon}</Text>
          <Text style={styles.achieved}>ACHIEVEMENT UNLOCKED</Text>
          <Text style={styles.title}>{definition.title}</Text>
          <Text style={styles.description}>{definition.description}</Text>

          <TouchableOpacity style={styles.btn} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={styles.btnText}>Keep Building →</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function ConfettiDot({ index }: { index: number }) {
  const colors = [Colors.accentGold, Colors.profitGreen, Colors.debtCrimson, Colors.investmentTeal];
  const anim = useRef(new Animated.Value(0)).current;
  const color = colors[index % colors.length];
  const left = `${(index * 8) + 4}%` as `${number}%`;
  const top = `${10 + (index % 4) * 20}%` as `${number}%`;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 600 + index * 100, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 600 + index * 100, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.confetti,
        { left, top, backgroundColor: color, opacity: anim },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(13,17,23,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  confetti: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  card: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.accentGold,
    padding: Spacing.xxxl,
    alignItems: 'center',
    width: '100%',
    shadowColor: Colors.accentGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 20,
  },
  icon: {
    fontSize: 72,
    marginBottom: Spacing.base,
  },
  achieved: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodySmall,
    color: Colors.accentGold,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.displaySmall,
    color: Colors.frostWhite,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  btn: {
    backgroundColor: Colors.accentGold,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: 12,
  },
  btnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.backgroundDeepNavy,
  },
});
