// Milestone card — locked/unlocked states
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import type { MilestoneDefinition } from '../../types';
import { formatDate } from '../../utils/formatters';

interface MilestoneCardProps {
  milestone: MilestoneDefinition;
  isUnlocked: boolean;
  unlockedAt?: string;
  onPress?: () => void;
}

export function MilestoneCard({ milestone, isUnlocked, unlockedAt, onPress }: MilestoneCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, isUnlocked ? styles.unlocked : styles.locked]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.icon, !isUnlocked && styles.iconLocked]}>{milestone.icon}</Text>
      <View style={styles.content}>
        <Text style={[styles.title, !isUnlocked && styles.titleLocked]}>{milestone.title}</Text>
        <Text style={styles.description}>{milestone.description}</Text>
        {isUnlocked && unlockedAt && (
          <Text style={styles.date}>Unlocked {formatDate(unlockedAt)}</Text>
        )}
      </View>
      {isUnlocked && <Text style={styles.check}>✓</Text>}
      {!isUnlocked && <Text style={styles.lock}>🔒</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  unlocked: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderColor: Colors.accentGold,
  },
  locked: {
    backgroundColor: 'rgba(22,27,34,0.5)',
    borderColor: Colors.graphiteBorder,
    opacity: 0.7,
  },
  icon: {
    fontSize: 32,
  },
  iconLocked: {
    opacity: 0.4,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.accentGold,
  },
  titleLocked: {
    color: Colors.slateGray,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  date: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.accentGold,
  },
  check: {
    fontSize: 18,
    color: Colors.profitGreen,
  },
  lock: {
    fontSize: 14,
    opacity: 0.4,
  },
});
