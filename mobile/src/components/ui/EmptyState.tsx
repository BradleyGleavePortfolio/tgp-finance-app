// Action-prompted empty states — never a blank screen
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from './Button';
import { Colors, Typography, Spacing } from '../../theme/finance';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  secondaryText?: string;
  onSecondary?: () => void;
}

export function EmptyState({
  icon = '📊',
  title,
  description,
  actionText,
  onAction,
  secondaryText,
  onSecondary,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
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
  icon: {
    fontSize: 48,
    marginBottom: Spacing.base,
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
