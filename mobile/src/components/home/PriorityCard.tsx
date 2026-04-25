// Current priority card with gold border and progress bar
// UX Psychology Report #3: light haptic on "View all", medium on "Next Step"
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { Button } from '../ui/Button';
import { Colors, Typography, Spacing } from '../../theme/finance';
import type { Priority } from '../../types';

interface PriorityCardProps {
  priority: Priority | null;
  onNextStep?: () => void;
  onViewAll?: () => void;
}

export function PriorityCard({ priority, onNextStep, onViewAll }: PriorityCardProps) {
  if (!priority) {
    return (
      <Card variant="gold">
        <Text style={styles.emptyText}>Complete your onboarding to set your first priority.</Text>
      </Card>
    );
  }

  const progressPct = priority.progressPercent || 0;

  return (
    <Card variant="gold" style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.priorityLabel}>CURRENT PRIORITY</Text>
        <TouchableOpacity
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
            onViewAll?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="View all priorities"
        >
          <Text style={styles.viewAll}>View all →</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>{priority.title}</Text>
      <Text style={styles.description}>{priority.description}</Text>

      <ProgressBar
        progress={progressPct}
        height={8}
        showLabel
        label={`${progressPct.toFixed(0)}% complete`}
        variant="savings"
        style={styles.progress}
      />

      {priority.estimatedCompletionDate && (
        <Text style={styles.eta}>
          Estimated completion: <Text style={styles.etaValue}>{priority.estimatedCompletionDate}</Text>
        </Text>
      )}

      <View style={styles.actions}>
        {priority.actionItems[0] && (
          <Text style={styles.nextStep}>
            <Text style={styles.nextStepLabel}>Next step: </Text>
            {priority.actionItems[0]}
          </Text>
        )}
        <Button
          title="Next Step →"
          onPress={onNextStep || (() => {})}
          variant="outline"
          size="sm"
          style={styles.btn}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  priorityLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    color: Colors.accentGold,
    letterSpacing: 1,
  },
  viewAll: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    marginBottom: Spacing.sm,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  progress: {
    marginBottom: Spacing.md,
  },
  eta: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    marginBottom: Spacing.md,
  },
  etaValue: {
    color: Colors.accentGold,
    fontFamily: 'JetBrainsMono_400Regular',
  },
  actions: {
    gap: Spacing.sm,
  },
  nextStep: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.frostWhite,
  },
  nextStepLabel: {
    fontFamily: 'Inter_600SemiBold',
    color: Colors.accentGold,
  },
  btn: {
    alignSelf: 'flex-start',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    textAlign: 'center',
  },
});
