/**
 * CoachStatusPill — small chip rendering a client status or assignment
 * status with subtle tone-aware coloring. Bone-on-ink for active/in-good-
 * standing, oxblood-on-tinted-bone for at-risk/inactive.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, radius } from '../../theme/tokens';

export type StatusTone = 'good' | 'warn' | 'bad' | 'neutral';

interface Props {
  label: string;
  tone?: StatusTone;
}

const TONE_STYLES: Record<StatusTone, { bg: string; fg: string; border: string }> = {
  good: { bg: 'rgba(44, 74, 54, 0.08)', fg: '#1F3A2A', border: 'rgba(44, 74, 54, 0.20)' },
  warn: { bg: 'rgba(197, 162, 83, 0.14)', fg: '#5A4220', border: 'rgba(197, 162, 83, 0.30)' },
  bad:  { bg: 'rgba(74, 4, 4, 0.08)',   fg: colors.oxblood, border: 'rgba(74, 4, 4, 0.18)' },
  neutral: { bg: colors.cream, fg: colors.charcoal, border: 'rgba(177, 168, 159, 0.4)' },
};

export function CoachStatusPill({ label, tone = 'neutral' }: Props) {
  const t = TONE_STYLES[tone];
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: t.bg, borderColor: t.border },
      ]}
    >
      <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 0.5,
    borderRadius: radius.pill,
  },
  label: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    letterSpacing: 1.2,
  },
});
