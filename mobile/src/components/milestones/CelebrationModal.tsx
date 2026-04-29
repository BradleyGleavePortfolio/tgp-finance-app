// Calm milestone acknowledgement. Per doctrine §10 item 11: no confetti, no
// spring animation, no emoji icon, no social-share button. A centered card,
// soft fade-in, single text-link to dismiss.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Modal, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing } from '../../theme/finance';
import { MILESTONE_DEFINITIONS } from '../../utils/constants';
import type { MilestoneUnlock } from '../../types';
import { track } from '../../lib/analytics';

interface CelebrationModalProps {
  milestone: MilestoneUnlock | null;
  onDismiss: () => void;
}

export function CelebrationModal({ milestone, onDismiss }: CelebrationModalProps) {
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (milestone) {
      track('goal_completed', { milestone_key: milestone.milestone_key });
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    } else {
      opacityAnim.setValue(0);
    }
  }, [milestone]);

  if (!milestone) return null;

  const definition = MILESTONE_DEFINITIONS.find((m) => m.key === milestone.milestone_key);
  if (!definition) return null;

  return (
    <Modal transparent animationType="fade" visible={!!milestone}>
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        <View style={styles.card}>
          <View style={styles.hairline} />
          <Text style={styles.eyebrow}>Milestone</Text>
          <Text style={styles.title}>{definition.title}</Text>
          <Text style={styles.description}>{definition.description}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onDismiss}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.closeLink}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
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
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeLink: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
});
