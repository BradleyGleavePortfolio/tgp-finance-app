// Mood selector 1-5 emoji scale
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { MOOD_EMOJIS, MOOD_LABELS } from '../../utils/constants';

interface MoodSelectorProps {
  value?: number; // 1-5
  onChange: (mood: number) => void;
}

export function MoodSelector({ value, onChange }: MoodSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>How are you feeling about your finances today?</Text>
      <View style={styles.emojis}>
        {MOOD_EMOJIS.map((emoji, index) => {
          const mood = index + 1;
          const isSelected = value === mood;
          return (
            <TouchableOpacity
              key={mood}
              style={[styles.emojiBtn, isSelected && styles.selected]}
              onPress={() => onChange(mood)}
              activeOpacity={0.7}
            >
              <Text style={styles.emoji}>{emoji}</Text>
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
  emojis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  emojiBtn: {
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    flex: 1,
    marginHorizontal: 2,
  },
  selected: {
    borderColor: Colors.accentGold,
    backgroundColor: 'rgba(249,199,79,0.08)',
  },
  emoji: {
    fontSize: 28,
  },
  moodLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: Colors.accentGold,
    marginTop: 2,
    textAlign: 'center',
  },
});
