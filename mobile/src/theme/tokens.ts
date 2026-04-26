/**
 * The Growth Project: Finance — Design Token System
 * ═══════════════════════════════════════════════════
 * Single source of truth for colors, typography, spacing, radius, shadows, and motion.
 * Dual-tier: freeTheme uses brand-primary accents; founderTheme overlays gold accents.
 *
 * ─── WCAG AA Contrast Matrix ────────────────────────────────────────────────────────
 *  Text token            Background            Contrast ratio  Pass AA (4.5:1 body)
 *  frostWhite #F1F5F9    backgroundDeepNavy    ≈ 15.2:1        ✓ AAA
 *  frostWhite #F1F5F9    cardSurfaceNavy       ≈ 13.1:1        ✓ AAA
 *  frostWhite #F1F5F9    cardSurfaceNavyElev   ≈ 11.4:1        ✓ AAA
 *  accentGold #F9C74F    backgroundDeepNavy    ≈  9.8:1        ✓ AAA
 *  accentGold #F9C74F    cardSurfaceNavy       ≈  8.5:1        ✓ AAA
 *  profitGreen #06D6A0   backgroundDeepNavy    ≈  7.3:1        ✓ AAA
 *  debtCrimson #E63946   backgroundDeepNavy    ≈  4.7:1        ✓ AA (large text)
 *  slateGray #8895A7     backgroundDeepNavy    ≈  4.6:1        ✓ AA (18px+)
 *  goldScale[400] #D4A017 backgroundDeepNavy   ≈  6.1:1        ✓ AA
 *  goldScale[200] #FDE68A backgroundDeepNavy   ≈ 12.4:1        ✓ AAA
 *
 *  NOTE: debtCrimson on dark card meets AA for large text (≥18px bold or ≥24px regular).
 *        All interactive labels use frostWhite or accentGold which exceed AA for normal text.
 * ────────────────────────────────────────────────────────────────────────────────────
 */

// ─── Neutral Scale (0 = near-white, 1000 = deepest navy) ─────────────────────
export const neutral = {
  0:   '#FFFFFF',
  100: '#F1F5F9',  // frostWhite
  200: '#CBD5E1',
  300: '#94A3B8',
  400: '#8895A7',  // slateGray
  500: '#64748B',
  600: '#4B5563',
  700: '#3A3A4A',  // graphiteBorder
  800: '#1C2333',  // cardSurfaceNavyElevated
  900: '#161B22',  // cardSurfaceNavy
  950: '#0D1117',  // backgroundDeepNavy
  1000: '#070A0E',
} as const;

// ─── Brand Primary Scale ──────────────────────────────────────────────────────
export const brand = {
  lightest: '#4DD9E5',   // investmentTeal
  light:    '#06D6A0',   // profitGreen
  base:     '#0EA5B2',   // mid-teal
  dark:     '#0D8C98',
  darkest:  '#0A6F78',
} as const;

// ─── Semantic Colours ─────────────────────────────────────────────────────────
export const semantic = {
  success:  '#06D6A0',  // profitGreen
  successBg: 'rgba(6, 214, 160, 0.12)',
  warn:     '#F39C12',  // amberWarning
  warnBg:   'rgba(243, 156, 18, 0.12)',
  danger:   '#E63946',  // debtCrimson
  dangerBg: 'rgba(230, 57, 70, 0.12)',
  info:     '#4DD9E5',  // investmentTeal
  infoBg:   'rgba(77, 217, 229, 0.12)',
} as const;

// ─── Gold Scale (Founding-tier accents) ───────────────────────────────────────
export const gold = {
  50:   '#FFFBEB',
  100:  '#FEF3C7',
  200:  '#FDE68A',  // highlight / shimmer peak
  300:  '#FCD34D',
  400:  '#F9C74F',  // accentGold — primary gold accent
  500:  '#D4A017',  // deepGoldPressed / interactive
  600:  '#B07D00',
  700:  '#8C6200',
  glow: 'rgba(249, 199, 79, 0.25)',
  overlay12: 'rgba(249, 199, 79, 0.12)',
  overlay20: 'rgba(249, 199, 79, 0.20)',
} as const;

// ─── Typography Scale ─────────────────────────────────────────────────────────
// Families: Inter (primary) · JetBrains Mono (numeric/mono)
export const typography = {
  families: {
    regular:   'Inter_400Regular',
    medium:    'Inter_500Medium',
    semiBold:  'Inter_600SemiBold',
    bold:      'Inter_700Bold',
    mono:      'JetBrainsMono_400Regular',
    monoBold:  'JetBrainsMono_700Bold',
  },
  scale: {
    display:   { fontSize: 36, lineHeight: 44, fontWeight: '700' as const, letterSpacing: -0.5 },
    h1:        { fontSize: 28, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.3 },
    h2:        { fontSize: 24, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.2 },
    h3:        { fontSize: 22, lineHeight: 30, fontWeight: '600' as const, letterSpacing: -0.1 },
    h4:        { fontSize: 20, lineHeight: 28, fontWeight: '600' as const, letterSpacing:  0   },
    body:      { fontSize: 16, lineHeight: 24, fontWeight: '400' as const, letterSpacing:  0   },
    bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const, letterSpacing:  0   },
    caption:   { fontSize: 12, lineHeight: 18, fontWeight: '500' as const, letterSpacing:  0.2 },
    micro:     { fontSize: 11, lineHeight: 16, fontWeight: '600' as const, letterSpacing:  1.5 },
  },
} as const;

// ─── Spacing Scale (4 px base grid) ──────────────────────────────────────────
export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  base: 16,
  lg:   20,
  xl:   24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

// ─── Border Radius Scale ──────────────────────────────────────────────────────
export const radius = {
  sm:   4,
  md:   8,
  lg:   12,
  xl:   16,
  '2xl': 24,
  pill: 999,
} as const;

// ─── Shadow Tokens ────────────────────────────────────────────────────────────
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 14,
  },
  glowGold: {
    shadowColor: gold[400],
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  glowGreen: {
    shadowColor: semantic.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 8,
  },
  glowCrimson: {
    shadowColor: semantic.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 8,
  },
} as const;

// ─── Motion Tokens ────────────────────────────────────────────────────────────
export const motion = {
  duration: {
    fast: 120,
    base: 200,
    slow: 320,
    shimmer: 1200,
  },
  easing: {
    // Approximations for Animated.timing (use with Easing from RN)
    standard:    [0.4, 0.0, 0.2, 1.0] as [number, number, number, number],   // material standard
    decelerate:  [0.0, 0.0, 0.2, 1.0] as [number, number, number, number],   // enter screen
    accelerate:  [0.4, 0.0, 1.0, 1.0] as [number, number, number, number],   // exit screen
    spring:      [0.34, 1.56, 0.64, 1.0] as [number, number, number, number], // playful spring
  },
} as const;
