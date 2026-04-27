// Mood selector — 1-to-5 numeric scale, no emoji.
// Per mobile/DESIGN.md §4, the mood scale is numeric with text labels.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { MOOD_GLYPHS, MOOD_LABELS } from '../../utils/constants';

interface MoodSelectorProps {
  value?: number; // 1-5
  onChange: (mood: number) => void;
}

export function MoodSelector({ value, onChange }: MoodSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>How are you feeling about your finances today?</Text>
      <View style={styles.glyphs}>
        {MOOD_GLYPHS.map((glyph, index) => {
          const mood = index + 1;
          const isSelected = value === mood;
          return (
            <TouchableOpacity
              key={mood}
              style={[styles.glyphBtn, isSelected && styles.selected]}
              onPress={() => onChange(mood)}
              activeOpacity={0.7}
            >
              <Text style={styles.glyph}>{glyph}</Text>
              {isSelected && (
                <Text style={styles.moodLabel}>{MOOD_LABELS[index]}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  glyphs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  glyphBtn: {
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    flex: 1,
    marginHorizontal: 2,
  },
  selected: {
    borderColor: Colors.frostWhite,
    backgroundColor: 'transparent',
  },
  glyph: {
    fontSize: 22,
    fontFamily: 'Inter_500Medium',
    color: Colors.frostWhite,
  },
  moodLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: Colors.slateGray,
    marginTop: 2,
    textAlign: 'center',
  },
});
