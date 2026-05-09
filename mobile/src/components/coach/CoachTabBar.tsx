/**
 * CoachTabBar — horizontal segmented tabs used inside ClientDetail.
 *
 * Generic over the value type so screens can pass an enum-like list of
 * tabs. Renders a scrollable hairline-divided row; the active tab gets
 * an oxblood underline.
 */
import React from 'react';
import { View, ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme/tokens';

interface CoachTab<T extends string> {
  key: T;
  label: string;
}

interface Props<T extends string> {
  tabs: CoachTab<T>[];
  active: T;
  onChange: (key: T) => void;
}

export function CoachTabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
              <View style={[styles.underline, isActive && styles.underlineActive]} />
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.hairline} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bone,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  tab: {
    paddingTop: spacing.sm,
    paddingBottom: 0,
    alignItems: 'center',
  },
  label: {
    ...typography.scale.caption,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
    paddingBottom: spacing.sm,
    letterSpacing: 0.6,
  },
  labelActive: {
    color: colors.ink,
  },
  underline: {
    height: 2,
    width: '100%',
    backgroundColor: 'transparent',
  },
  underlineActive: {
    backgroundColor: colors.oxblood,
  },
  hairline: {
    height: 0.5,
    backgroundColor: colors.stone,
  },
});
