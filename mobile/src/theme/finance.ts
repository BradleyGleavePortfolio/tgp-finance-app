// The Growth Project: Finance — Design System
// Single source of truth for all colors, typography, and spacing

export const Colors = {
  // Backgrounds
  backgroundDeepNavy: '#0D1117',
  cardSurfaceNavy: '#161B22',
  cardSurfaceNavyElevated: '#1C2333',

  // Accents
  accentGold: '#F9C74F',
  deepGoldPressed: '#D4A017',

  // Status
  profitGreen: '#06D6A0',
  debtCrimson: '#E63946',
  amberWarning: '#F39C12',

  // Text
  frostWhite: '#F1F5F9',
  slateGray: '#8895A7',

  // Borders
  graphiteBorder: '#3A3A4A',

  // Transparent overlays
  cardOverlay: 'rgba(22, 27, 34, 0.85)',
  glassOverlay: 'rgba(13, 17, 23, 0.6)',

  // Extended palette
  investmentTeal: '#4DD9E5',

  // Chart colors
  chartGreenGlow: 'rgba(6, 214, 160, 0.3)',
  chartCrimsonGlow: 'rgba(230, 57, 70, 0.3)',
  chartGoldGlow: 'rgba(249, 199, 79, 0.3)',

  // Tab bar
  tabBarBackground: '#0D1117',
  tabBarBorder: '#3A3A4A',
  tabBarActive: '#F9C74F',
  tabBarInactive: '#8895A7',
} as const;

export const Typography = {
  // Font families
  fontPrimary: 'Inter_400Regular',
  fontPrimaryBold: 'Inter_700Bold',
  fontPrimarySemiBold: 'Inter_600SemiBold',
  fontPrimaryMedium: 'Inter_500Medium',
  fontMono: 'JetBrainsMono_400Regular',
  fontMonoBold: 'JetBrainsMono_700Bold',

  // Font sizes (in sp/dp)
  heroNumber: 48,
  displayLarge: 36,
  displayMedium: 28,
  displaySmall: 24,
  titleLarge: 22,
  titleMedium: 20,
  titleSmall: 18,
  bodyLarge: 16,
  bodyMedium: 14,
  bodySmall: 12,
  microLabel: 11,

  // Line heights
  lineHeightHero: 56,
  lineHeightDisplay: 44,
  lineHeightTitle: 32,
  lineHeightBody: 22,
  lineHeightSmall: 18,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  section: 48,
  huge: 64,
} as const;

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  full: 9999,
} as const;

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  cardLarge: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  glow: {
    shadowColor: '#F9C74F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  glowGreen: {
    shadowColor: '#06D6A0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  glowCrimson: {
    shadowColor: '#E63946',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

// Common card style used throughout the app
export const cardStyle = {
  backgroundColor: Colors.cardSurfaceNavy,
  borderWidth: 1,
  borderColor: Colors.graphiteBorder,
  borderRadius: BorderRadius.lg,
  ...Shadows.card,
} as const;

// Gold card style for priority/featured items
export const goldCardStyle = {
  backgroundColor: Colors.cardSurfaceNavy,
  borderWidth: 1.5,
  borderColor: Colors.accentGold,
  borderRadius: BorderRadius.lg,
  ...Shadows.glow,
} as const;
