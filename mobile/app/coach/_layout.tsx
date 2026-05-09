/**
 * Coach module layout — Stack navigator for the entire coach surface.
 *
 * The finance app's tab bar exposes a single "Coach" tab that, for users
 * with role==='coach', deep-links into this stack. Each route below is
 * a single screen file. We deliberately avoid bottom tabs inside the
 * coach module so coaches can navigate freely without being trapped in
 * a nested tabbar.
 *
 * Header is owned per-screen — most screens render a custom hero header
 * with serif headlines. Stack header is hidden globally.
 */
import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '../../src/theme/tokens';

export default function CoachLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bone },
        animation: 'slide_from_right',
      }}
    />
  );
}
