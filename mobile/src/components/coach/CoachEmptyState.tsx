/**
 * CoachEmptyState — branded empty + error states for coach screens.
 *
 * Differs from src/components/ui/EmptyState in two ways:
 *   1. Eyebrow + serif headline + ledger lead — matches the coach-screen
 *      typography rhythm (where the rest of the app uses sans).
 *   2. Optional retry handler so error states are first-class. Pass
 *      `tone="error"` to use oxblood instead of stone for the eyebrow.
 *
 * Stage 2 doctrine: every list/section that can be empty has a designed
 * state. No "No results yet" placeholders — the copy is specific to the
 * surface ("No clients yet. Send an invite to get started.").
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens';

interface Props {
  eyebrow: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'error';
}

export function CoachEmptyState({ eyebrow, title, body, actionLabel, onAction, tone = 'neutral' }: Props) {
  const eyebrowColor = tone === 'error' ? colors.oxblood : colors.charcoal;
  return (
    <View style={styles.container} accessibilityRole="summary">
      <Text style={[styles.eyebrow, { color: eyebrowColor }]}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  eyebrow: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
  },
  title: {
    ...typography.scale.h2,
    fontFamily: typography.families.serif,
    color: colors.ink,
  },
  body: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
    marginTop: 4,
  },
  action: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
  },
  actionText: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.bone,
  },
});
