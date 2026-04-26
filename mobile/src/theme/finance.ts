/**
 * The Growth Project: Finance — Design System
 * ════════════════════════════════════════════
 * Wave 2: This file now RE-EXPORTS from tokens.ts (the canonical source).
 * Legacy named exports are preserved so existing component imports continue to
 * compile. Migrate call-sites to import directly from tokens.ts over time.
 */
export {
  colors,
  neutral,
  gold,
  semantic,
  brand,
  typography,
  spacing,
  radius,
  shadows,
  motion,
} from './tokens';

import {
  colors,
  typography,
  spacing,
  radius,
  shadows,
} from './tokens';

// ── Legacy named exports (kept for backward-compat) ──────────────────────────

/** @deprecated Import from tokens.ts instead. All color values are in `colors`. */
export const Colors = {
  // Backgrounds → bone/cream
  backgroundDeepNavy:       colors.bone,      // was '#0D1117'
  cardSurfaceNavy:          colors.cream,     // was '#161B22'
  cardSurfaceNavyElevated:  colors.cream,     // was '#1C2333'

  // Finance accent — single oxblood replaces all four old accents
  accentGold:      colors.oxblood,    // was '#F9C74F'
  deepGoldPressed: colors.oxblood,    // was '#D4A017'
  profitGreen:     colors.oxblood,    // was '#06D6A0'
  debtCrimson:     colors.oxblood,    // was '#E63946'
  amberWarning:    colors.oxblood,    // was '#F39C12'
  investmentTeal:  colors.oxblood,    // was '#4DD9E5'

  // Text → ink/stone on bone background
  frostWhite: colors.ink,     // was '#F1F5F9'
  slateGray:  colors.stone,   // was '#8895A7'

  // Borders
  graphiteBorder: colors.camel,  // was '#3A3A4A' → hairline camel

  // Overlays (legacy — phase out)
  cardOverlay:  'rgba(245, 239, 228, 0.85)' as const,
  glassOverlay: 'rgba(245, 239, 228, 0.60)' as const,

  // Chart glows — deleted (Wave 1)
  // chartGreenGlow, chartCrimsonGlow, chartGoldGlow removed

  // Tab bar (Wave 3 will migrate these to bone/oxblood/stone)
  tabBarBackground: colors.bone,
  tabBarBorder:     colors.camel,
  tabBarActive:     colors.oxblood,
  tabBarInactive:   colors.stone,

  // Founding badge (use mutedGold, never as fill)
  mutedGold: colors.mutedGold,
} as const;

/** @deprecated Import from tokens.ts instead. */
export const Typography = {
  // Font families
  fontPrimary:         typography.families.regular,
  fontPrimaryBold:     typography.families.bold,
  fontPrimarySemiBold: typography.families.semiBold,
  fontPrimaryMedium:   typography.families.medium,
  fontSerif:           typography.families.serif,
  fontSerifMedium:     typography.families.serifMedium,
  fontMono:            typography.families.mono,
  fontMonoBold:        typography.families.monoBold,

  // Font sizes (legacy flat values — prefer typography.scale.* objects)
  heroNumber:    44,   // was 48 — display size
  displayLarge:  44,   // was 36
  displayMedium: 32,   // was 28
  displaySmall:  24,
  titleLarge:    18,   // was 22
  titleMedium:   16,   // was 20
  titleSmall:    16,   // was 18
  bodyLarge:     16,
  bodyMedium:    14,
  bodySmall:     12,
  microLabel:    11,

  // Line heights
  lineHeightHero:    46,   // was 56
  lineHeightDisplay: 35,   // was 44
  lineHeightTitle:   26,   // was 32
  lineHeightBody:    26,   // was 22 (brief: 1.625 ratio)
  lineHeightSmall:   18,
} as const;

/** @deprecated Import from tokens.ts instead. */
export const Spacing = {
  xs:      spacing.xs,
  sm:      spacing.sm,
  md:      spacing.md,
  base:    spacing.base,
  lg:      spacing.lg,
  xl:      spacing.xl,
  xxl:     spacing['2xl'],
  xxxl:    40,
  section: spacing['3xl'],
  huge:    spacing['4xl'],
} as const;

/** @deprecated Import from tokens.ts instead. */
export const BorderRadius = {
  sm:   radius.sm,    // 0
  md:   radius.md,    // 2
  lg:   radius.lg,    // 4
  xl:   radius.lg,    // collapsed — no value > 4
  xxl:  radius.lg,    // collapsed — no value > 4
  full: radius.pill,  // 999 (chips only)
} as const;

/** @deprecated Import from tokens.ts instead. */
export const Shadows = {
  card:      shadows.md,
  cardLarge: shadows.lg,
  // glow, glowGreen, glowCrimson — deleted (Wave 1)
} as const;
