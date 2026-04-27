// Action-prompted empty states — never a blank screen.
// Per mobile/DESIGN.md §2, emoji are not a permitted decoration.
// `icon` is accepted for back-compat with older callers but is not
// rendered. Empty states use an eyebrow caption + headline instead.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from './Button';
import { Colors, Typography, Spacing } from '../../theme/finance';

interface EmptyStateProps {
  icon?: string;
  eyebrow?: string;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  secondaryText?: string;
  onSecondary?: () => void;
}

export function EmptyState({
  icon: _icon,
  eyebrow,
  title,
  description,
  actionText,
  onAction,
  secondaryText,
  onSecondary,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      {actionText && onAction && (
        <Button
          title={actionText}
          onPress={onAction}
          variant="primary"
          style={styles.button}
        />
      )}

      {secondaryText && onSecondary && (
        <Button
          title={secondaryText}
          onPress={onSecondary}
          variant="ghost"
          style={styles.secondaryButton}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
    minHeight: 200,
  },
  eyebrow: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    color: Colors.slateGray,
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleMedium,
    color: Colors.frostWhite,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    textAlign: 'center',
    lineHeight: Typography.lineHeightBody,
    marginBottom: Spacing.xl,
  },
  button: {
    minWidth: 200,
  },
  secondaryButton: {
    marginTop: Spacing.sm,
  },
});
