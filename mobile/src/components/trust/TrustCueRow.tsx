/**
 * TrustCueRow — UX Psychology Report #2: "Trust as Emotion"
 *
 * Three tappable pill chips displayed below secondary content on the Home screen.
 * Tapping any chip opens TrustExplainerSheet.
 * Tokens are sourced from the existing ThemeProvider / finance theme.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme/finance';
import { HapticPressable } from '../HapticPressable';
import { TrustExplainerSheet } from './TrustExplainerSheet';
import { track } from '../../lib/analytics';

interface Chip {
  label: string;
}

const CHIPS: Chip[] = [
  { label: 'End-to-end encrypted' },
  { label: 'Your data is yours' },
  { label: 'Zero ads · Zero data sales' },
];

interface Props {
  /** Optional extra style for the outer container */
  style?: object;
}

export function TrustCueRow({ style }: Props) {
  const [sheetVisible, setSheetVisible] = useState(false);

  const handleChipPress = () => {
    track('trust_cue_tapped');
    setSheetVisible(true);
  };

  const handleSheetClose = () => {
    setSheetVisible(false);
  };

  return (
    <>
      <View style={[styles.container, style]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {CHIPS.map((chip) => (
            <HapticPressable
              key={chip.label}
              intent="light"
              onPress={handleChipPress}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
            >
              <View style={styles.chip}>
                <Text style={styles.chipText}>{chip.label}</Text>
              </View>
            </HapticPressable>
          ))}
        </ScrollView>
      </View>

      <TrustExplainerSheet
        visible={sheetVisible}
        onClose={handleSheetClose}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    letterSpacing: 0.1,
  },
});
