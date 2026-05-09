/**
 * CoachSearchBar — the EHR-style top-of-list search input.
 *
 * Pure controlled component; the parent owns the query string. Calls
 * onSubmit on the keyboard's "search" key for screens that want to
 * defer the network call until the user commits.
 */
import React from 'react';
import { View, TextInput, StyleSheet, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../../theme/tokens';

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  onClear?: () => void;
  autoFocus?: boolean;
}

export function CoachSearchBar({
  value,
  onChangeText,
  placeholder = 'Search clients',
  onSubmit,
  onClear,
  autoFocus,
}: Props) {
  return (
    <View style={styles.row}>
      <Ionicons name="search-outline" size={18} color={colors.stone} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.stone}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        accessibilityLabel={placeholder}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => {
            onChangeText('');
            onClear?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
        >
          <Text style={styles.clear}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  icon: {
    marginRight: 4,
  },
  input: {
    flex: 1,
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
    paddingVertical: 0,
  },
  clear: {
    ...typography.scale.caption,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
    paddingHorizontal: 4,
  },
});
