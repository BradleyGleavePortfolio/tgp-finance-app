// Full-screen milestone celebration with confetti animation
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Modal, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { MILESTONE_DEFINITIONS } from '../../utils/constants';
import type { MilestoneUnlock } from '../../types';
import { ShareCard } from '../ShareCard';
import { useShareCard } from '../../hooks/useShareCard';
import { track } from '../../lib/analytics';

interface CelebrationModalProps {
  milestone: MilestoneUnlock | null;
  onDismiss: () => void;
}

export function CelebrationModal({ milestone, onDismiss }: CelebrationModalProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const { viewRef: shareRef, share } = useShareCard();

  useEffect(() => {
    if (milestone) {
      // Track goal_completed when a milestone is celebrated
      track('goal_completed', { milestone_key: milestone.milestone_key });
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
          {/* Milestone icon — emoji from data (luxury/wave4 will replace). Rendered as-is from server data. */}
          <Text style={styles.icon}>{definition.icon}</Text>
          <Text style={styles.achieved}>ACHIEVEMENT UNLOCKED</Text>
          <Text style={styles.title}>{definition.title}</Text>
          <Text style={styles.description}>{definition.description}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={() => share({ dialogTitle: 'Share your milestone' })}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Share your milestone"
            >
              <Text style={styles.shareBtnText}>Share your milestone</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={onDismiss} activeOpacity={0.8}>
              <Text style={styles.btnText}>Keep Building →</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <View style={styles.shareOffscreen} pointerEvents="none">
          <ShareCard
            ref={shareRef}
            emoji={definition.icon}
            subtitle="MILESTONE UNLOCKED"
            title={`I just hit ${definition.title.toLowerCase().startsWith('i ') ? definition.title : definition.title}`}
            primaryStat={definition.description}
            primaryStatLabel="ACHIEVEMENT"
            secondaryStat="Building wealth with @TheGrowthProject"
            theme={definition.category === 'net_worth' ? 'green' : 'gold'}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

function ConfettiDot({ index }: { index: number }) {
  const colors = [Colors.accentGold, Colors.profitGreen, Colors.debtCrimson, Colors.slateGray];
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
    borderRadius: 4, // radius.lg
    borderWidth: 2,
    borderColor: Colors.accentGold,
    padding: Spacing.xxxl,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
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
  actions: {
    gap: Spacing.md,
    alignItems: 'stretch',
    width: '100%',
  },
  btn: {
    backgroundColor: Colors.accentGold,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: 4, // radius.lg
    alignItems: 'center',
  },
  btnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.backgroundDeepNavy,
  },
  shareBtn: {
    borderWidth: 1,
    borderColor: Colors.accentGold,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: 4, // radius.lg
    alignItems: 'center',
  },
  shareBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.accentGold,
  },
  shareOffscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },
});
