// Quick-tap chat suggestion chips
import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { CHAT_QUICK_SUGGESTIONS } from '../../utils/constants';

interface QuickSuggestionsProps {
  onSelect: (suggestion: string) => void;
}

export function QuickSuggestions({ onSelect }: QuickSuggestionsProps) {
  // Rotate suggestions each render (simple variety)
  const suggestions = CHAT_QUICK_SUGGESTIONS.slice(0, 4);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {suggestions.map((s) => (
        <TouchableOpacity
          key={s}
          style={styles.chip}
          onPress={() => onSelect(s)}
          activeOpacity={0.7}
        >
          <Text style={styles.chipText}>{s}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    minHeight: 40,
    justifyContent: 'center' as const,
  },
  chipText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.frostWhite,
  },
});
