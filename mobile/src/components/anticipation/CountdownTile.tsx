/**
 * CountdownTile — UX Psychology Report #4: Healthy Anticipation
 * ═══════════════════════════════════════════════════════════════
 * Shows "Next paycheck in 4 days" or "Budget resets in 2 days".
 * Compact horizontal chip — multiple tiles can stack in a row.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { neutral, gold, semantic, typography, spacing, radius } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { HapticPressable } from '../HapticPressable';
import type { CountdownEvent } from '../../lib/milestones';

interface CountdownTileProps {
  event: CountdownEvent;
  onPress?: () => void;
}

// ─── Event icon + accent ──────────────────────────────────────────────────────
function eventMeta(type: CountdownEvent['type']): { icon: string; accent: string } {
  switch (type) {
    case 'paycheck':     return { icon: '💸', accent: semantic.success };
    case 'budget_reset': return { icon: '📅', accent: gold[400] };
    case 'goal_deadline':return { icon: '🎯', accent: semantic.info };
    default:             return { icon: '⏱️', accent: neutral[400] };
  }
}

function daysLabel(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

export function CountdownTile({ event, onPress }: CountdownTileProps) {
  const { isFounder } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(8)).current;

  const { icon, accent } = eventMeta(event.type);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const borderColor = isFounder ? gold[400] : neutral[700];

  return (
    <Animated.View
      style={[
        styles.container,
        { borderColor, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <HapticPressable
        intent="light"
        onPress={onPress}
        disabled={!onPress}
        style={styles.inner}
      >
        {/* Left: icon */}
        <Text style={styles.icon}>{icon}</Text>

        {/* Center: label + days */}
        <View style={styles.textBlock}>
          <Text style={styles.label}>{event.label}</Text>
          <Text style={[styles.days, { color: accent }]}>
            {daysLabel(event.daysUntil)}
          </Text>
        </View>

        {/* Right: day count badge */}
        <View style={[styles.badge, { backgroundColor: accent + '22' }]}>
          <Text style={[styles.badgeCount, { color: accent }]}>
            {event.daysUntil === 0 ? '!' : event.daysUntil}
          </Text>
          <Text style={[styles.badgeUnit, { color: accent }]}>
            {event.daysUntil === 0 ? '' : 'd'}
          </Text>
        </View>
      </HapticPressable>
    </Animated.View>
  );
}

// ─── Wrapper for stacking multiple tiles in a row ─────────────────────────────

interface CountdownTileRowProps {
  events: CountdownEvent[];
  onPress?: (event: CountdownEvent) => void;
}

export function CountdownTileRow({ events, onPress }: CountdownTileRowProps) {
  if (!events || events.length === 0) return null;
  return (
    <View style={rowStyles.row}>
      {events.slice(0, 2).map((evt) => (
        <View key={evt.type} style={rowStyles.tileWrapper}>
          <CountdownTile
            event={evt}
            onPress={onPress ? () => onPress(evt) : undefined}
          />
        </View>
      ))}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tileWrapper: {
    flex: 1,
  },
});

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: neutral[900],
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  icon: {
    fontSize: 22,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontFamily: typography.families.medium,
    fontSize: 12,
    lineHeight: 16,
    color: neutral[400],
  },
  days: {
    fontFamily: typography.families.bold,
    fontSize: 14,
    lineHeight: 18,
  },
  badge: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
  },
  badgeCount: {
    fontFamily: typography.families.monoBold,
    fontSize: 16,
    lineHeight: 20,
  },
  badgeUnit: {
    fontFamily: typography.families.semiBold,
    fontSize: 10,
    lineHeight: 12,
    textTransform: 'uppercase',
  },
});
