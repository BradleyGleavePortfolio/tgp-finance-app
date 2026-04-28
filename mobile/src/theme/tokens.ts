/**
 * The Growth Project: Finance — Design Token System (Wave 2: Luxury)
 * ═══════════════════════════════════════════════════════════════════
 * Canonical source of truth. finance.ts re-exports from here.
 *
 * PALETTE: Old-money bone/cream + single oxblood accent.
 * TYPOGRAPHY: Cormorant Garamond (display) + Inter (body/UI).
 * No dark navy, no neon, no four-accent system.
 *
 * Wave history:
 *   Wave 1 — deleted gradients, glows, shimmer, four-accent decoration
 *   Wave 5 — deleted InterestBleedTicker (anxiety theatre)
 *   Wave 2 — new token system: bone/oxblood, Cormorant + Inter, motion/radius/shadow
 *   Wave 3 — hero screen rewrites (index.tsx → navy bg)
 */

// ─── Core Palette ─────────────────────────────────────────────────────────────
export const colors = {
  // Backgrounds / surfaces
  bone:      '#F5EFE4',   // primary background (replaces #0D1117 dark)
  cream:     '#F1E8D5',   // card surface, warm

  // Text
  ink:       '#1A1A18',   // primary text (replaces frostWhite on dark)
  charcoal:  '#3D3D3A',   // secondary text on light
  stone:     '#B1A89F',   // tertiary text, hairlines, meta

  // Finance accent — single semantic accent (replaces profitGreen / debtCrimson / accentGold / investmentTeal)
  oxblood:   '#4A0404',   // PRIMARY accent

  // Optional dark variant for hero (Wave 3 applies to finance home)
  navy:      '#1B2A41',

  // Sparingly — specific use cases only
  mutedGold: '#C5A253',   // founding badge typography ONLY — never as fill
  camel:     '#B08D57',   // hairline borders ONLY

  // ── Legacy aliases (kept for gradual migration; prefer named slots above) ──
  // Background
  backgroundDeepNavy:       '#0D1117',  // → colors.bone (most screens) | colors.navy (home, Wave 3)
  cardSurfaceNavy:          '#161B22',  // → colors.cream
  cardSurfaceNavyElevated:  '#1C2333',  // → colors.cream

  // Text
  frostWhite: '#F1F5F9',  // → colors.ink (on bone/cream bg)
  slateGray:  '#8895A7',  // → colors.stone

  // Old accents — all mapped to oxblood for semantic uses
  accentGold:      '#F9C74F',  // → colors.oxblood (semantic) | colors.mutedGold (badge only)
  deepGoldPressed: '#D4A017',  // → colors.oxblood
  profitGreen:     '#06D6A0',  // → colors.oxblood
  debtCrimson:     '#E63946',  // → colors.oxblood
  amberWarning:    '#F39C12',  // → colors.oxblood
  investmentTeal:  '#4DD9E5',  // → colors.oxblood | delete

  // Borders (legacy)
  graphiteBorder: '#3A3A4A',   // → colors.camel (hairline) | colors.stone

  // Overlays (legacy — phase out)
  cardOverlay:  'rgba(22, 27, 34, 0.85)',
  glassOverlay: 'rgba(13, 17, 23, 0.6)',

  // Chart glows — deleted (Wave 1); kept as tombstones for grep safety
  // chartGreenGlow, chartCrimsonGlow, chartGoldGlow — removed

  // Tab bar (legacy — Wave 3 will update)
  tabBarBackground: '#0D1117',  // → colors.bone
  tabBarBorder:     '#3A3A4A',  // → colors.camel
  tabBarActive:     '#F9C74F',  // → colors.oxblood
  tabBarInactive:   '#8895A7',  // → colors.stone
} as const;

// ── Neutral scale (kept for any code still referencing neutral.NNN) ───────────
export const neutral = {
  0:   '#FFFFFF',
  100: '#F1F5F9',
  200: '#CBD5E1',
  300: '#94A3B8',
  400: '#8895A7',
  500: '#64748B',
  600: '#4B5563',
  700: '#3A3A4A',
  800: '#1C2333',
  900: '#161B22',
  950: '#0D1117',
  1000: '#070A0E',
} as const;

// ── Gold scale (kept only for badge-level references; prefer colors.mutedGold) ─
export const gold = {
  50:   '#FFFBEB',
  100:  '#FEF3C7',
  200:  '#FDE68A',
  300:  '#FCD34D',
  400:  '#F9C74F',   // accentGold legacy — map to colors.mutedGold for badge use
  500:  '#D4A017',
  600:  '#B07D00',
  700:  '#8C6200',
  // glow, overlay12, overlay20 — deleted (Wave 1)
} as const;

// ── Semantic colours (single-accent — all point to oxblood) ───────────────────
export const semantic = {
  success:  colors.oxblood,
  successBg: 'rgba(74, 4, 4, 0.08)',
  warn:     colors.oxblood,
  warnBg:   'rgba(74, 4, 4, 0.08)',
  danger:   colors.oxblood,
  dangerBg: 'rgba(74, 4, 4, 0.08)',
  info:     colors.oxblood,
  infoBg:   'rgba(74, 4, 4, 0.08)',
} as const;

// ─── Brand scale (legacy alias — maps to oxblood) ─────────────────────────────
export const brand = {
  lightest: colors.oxblood,
  light:    colors.oxblood,
  base:     colors.oxblood,
  dark:     '#3A0303',
  darkest:  '#2A0202',
} as const;

// ─── Typography Tokens ────────────────────────────────────────────────────────
// Families: Cormorant Garamond (display/serif) · Inter (body/UI)
// Note: fontWeight '800' is the single biggest amateur tell — display is always '400'
export const typography = {
  families: {
    // Serif display (Cormorant Garamond)
    serif:         'CormorantGaramond_400Regular',
    serifMedium:   'CormorantGaramond_500Medium',
    // Sans body/UI (Inter)
    regular:       'Inter_400Regular',
    medium:        'Inter_500Medium',
    semiBold:      'Inter_600SemiBold',
    bold:          'Inter_700Bold',
    // Mono (kept for numeric display)
    mono:          'JetBrainsMono_400Regular',
    monoBold:      'JetBrainsMono_700Bold',
  },
  // scale: size + line-height + spacing only — fontFamily comes from typography.families.*
  // This lets components do: { fontFamily: typography.families.serif, ...typography.scale.h1 }
  scale: {
    // ── Serif display sizes (use with typography.families.serif) — weight 400 always ──
    display:   { fontSize: 44, lineHeight: 46,  letterSpacing: 0.4,  fontWeight: '400' as const },
    h1:        { fontSize: 32, lineHeight: 35,  letterSpacing: 0.6,  fontWeight: '400' as const },
    h2:        { fontSize: 24, lineHeight: 29,  letterSpacing: 0.5,  fontWeight: '400' as const },
    // ── Sans body/UI sizes (use with typography.families.regular / medium) ──
    body:      { fontSize: 16, lineHeight: 26,  letterSpacing: -0.16, fontWeight: '400' as const },
    bodyMd:    { fontSize: 16, lineHeight: 26,  letterSpacing: -0.16, fontWeight: '500' as const },
    caption:   { fontSize: 12, lineHeight: 18,  letterSpacing: 0.96,  fontWeight: '500' as const },
    eyebrow:   { fontSize: 11, lineHeight: 13,  letterSpacing: 1.98,  fontWeight: '500' as const, textTransform: 'uppercase' as const },
    // ── Legacy keys (kept for gradual migration) ──
    h3:        { fontSize: 18, lineHeight: 24,  letterSpacing: 0,     fontWeight: '500' as const },
    h4:        { fontSize: 16, lineHeight: 22,  letterSpacing: 0,     fontWeight: '500' as const },
    bodySmall: { fontSize: 14, lineHeight: 20,  letterSpacing: 0,     fontWeight: '400' as const },
    micro:     { fontSize: 11, lineHeight: 16,  letterSpacing: 1.5,   fontWeight: '500' as const },
  },
} as const;

// ─── Spacing Scale (4 px base grid) ──────────────────────────────────────────
export const spacing = {
  xs:    4,
  sm:    8,
  md:    12,
  base:  16,
  lg:    20,
  xl:    24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

// ─── Border Radius Scale ──────────────────────────────────────────────────────
// Old-money scale: nearly zero radius. Pill ONLY on small chips.
export const radius = {
  sm:   0,    // buttons, primary CTAs (was 4)
  md:   2,    // inputs (was 8)
  lg:   4,    // cards (was 12)
  // xl, 2xl removed — any literal borderRadius > 4 is flagged in FINANCE_RADIUS_HITS.md
  pill: 999,  // SMALL CHIPS ONLY (status, tier badge) — never primary surfaces
} as const;

// ─── Shadow Tokens ────────────────────────────────────────────────────────────
// Luxury: opacity capped at 0.08. No glow. Shadow color is ink, not pure black.
export const shadows = {
  sm: {
    shadowColor:   colors.ink,
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius:  2,
    elevation:     1,
  },
  md: {
    shadowColor:   colors.ink,
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius:  6,
    elevation:     2,
  },
  lg: {
    shadowColor:   colors.ink,
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius:  12,
    elevation:     4,
  },
  // glowGold, glowGreen, glowCrimson — deleted (Wave 1)
} as const;

// ─── Motion Tokens ────────────────────────────────────────────────────────────
// Velvet, not confetti. Decel curve: cubic-bezier(0.16, 1, 0.3, 1)
export const motion = {
  duration: {
    fast:       120,   // haptic feedback only
    base:       400,   // standard transition (was 200 — twice as slow)
    slow:       800,   // content reveals, image fades (was 320)
    deliberate: 1200,  // hero reveals, scene changes
    // shimmer — deleted (Wave 1)
  },
  easing: {
    decel:  [0.16, 1, 0.3, 1] as const,   // expo-out — primary for all transitions
    smooth: [0.4, 0, 0.2, 1] as const,    // standard, used sparingly
    // spring, accelerate, standard — deleted (Wave 2)
  },
} as const;
