// Quick Actions row: EOD Check-in | What-If | Add Account | AI Coach
// UX Psychology Report #3: light haptic on each tap + visible press states via HapticPressable
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticPressable } from '../HapticPressable';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';

interface QuickAction {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  highlighted?: boolean;
}

interface QuickActionsProps {
  onEOD: () => void;
  onWhatIf: () => void;
  onAddAccount: () => void;
  onAICoach: () => void;
}

export function QuickActions({ onEOD, onWhatIf, onAddAccount, onAICoach }: QuickActionsProps) {
  const actions: QuickAction[] = [
    { icon: 'checkmark-circle', label: 'Check-in', onPress: onEOD, highlighted: true },
    { icon: 'git-branch', label: 'What-If', onPress: onWhatIf },
    { icon: 'add-circle', label: 'Account', onPress: onAddAccount },
    { icon: 'chatbubble-ellipses', label: 'AI Coach', onPress: onAICoach },
  ];

  return (
    <View style={styles.row}>
      {actions.map((action) => (
        <HapticPressable
          key={action.label}
          intent="light"
          onPress={action.onPress}
          style={[styles.action, action.highlighted && styles.highlighted]}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          pressScale={0.95}
          pressOpacity={0.8}
        >
          <Ionicons
            name={action.icon}
            size={24}
            color={action.highlighted ? Colors.backgroundDeepNavy : Colors.accentGold}
          />
          <Text style={[styles.label, action.highlighted && styles.highlightedLabel]}>
            {action.label}
          </Text>
        </HapticPressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    gap: Spacing.xs,
    minHeight: 70,
  },
  highlighted: {
    backgroundColor: Colors.accentGold,
    borderColor: Colors.accentGold,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.accentGold,
    textAlign: 'center',
  },
  highlightedLabel: {
    color: Colors.backgroundDeepNavy,
  },
});
