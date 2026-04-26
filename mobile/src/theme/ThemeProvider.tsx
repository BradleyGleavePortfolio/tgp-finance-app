/**
 * ThemeProvider — Luxury Visual System (Wave 2)
 * ══════════════════════════════════════════════
 * Reads `isFoundingMember` from the API.
 * Surfaces `freeTheme` or `founderTheme` via `useTheme()`.
 *
 * Wave 2: palette swings from dark navy to bone/cream.
 * Single oxblood accent replaces teal/gold/crimson multi-accent.
 * Founder tier: same bone/oxblood palette + mutedGold badge only (no glow).
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { colors, neutral, brand, semantic, gold, typography, spacing, radius, shadows, motion } from './tokens';
import { usersApi } from '../services/api';

// ─── Tier ────────────────────────────────────────────────────────────────────
export type Tier = 'free' | 'founder';

// ─── Resolved Theme Object ────────────────────────────────────────────────────
export interface Theme {
  /** Raw design tokens — always available */
  tokens: {
    neutral: typeof neutral;
    brand: typeof brand;
    semantic: typeof semantic;
    gold: typeof gold;
    typography: typeof typography;
    spacing: typeof spacing;
    radius: typeof radius;
    shadows: typeof shadows;
    motion: typeof motion;
  };
  /** Semantic colour assignments resolved for the active tier */
  colors: {
    background:           string;
    cardSurface:          string;
    cardSurfaceElevated:  string;
    accent:               string;
    accentPressed:        string;
    accentGlow:           string;
    textPrimary:          string;
    textSecondary:        string;
    border:               string;
    success:              string;
    warn:                 string;
    danger:               string;
    info:                 string;
    tabBarBackground:     string;
    tabBarBorder:         string;
    tabBarActive:         string;
    tabBarInactive:       string;
  };
  tier: Tier;
  isFounder: boolean;
}

// ─── Shared bone/cream base (Wave 2 light palette) ────────────────────────────
const baseColors = {
  background:           colors.bone,
  cardSurface:          colors.cream,
  cardSurfaceElevated:  colors.cream,
  textPrimary:          colors.ink,
  textSecondary:        colors.charcoal,
  border:               colors.camel,
  success:              colors.oxblood,
  warn:                 colors.oxblood,
  danger:               colors.oxblood,
  info:                 colors.oxblood,
  tabBarBackground:     colors.bone,
  tabBarInactive:       colors.stone,
};

// ─── Free tier (oxblood accent) ───────────────────────────────────────────────
export const freeTheme: Theme = {
  tokens: { neutral, brand, semantic, gold, typography, spacing, radius, shadows, motion },
  colors: {
    ...baseColors,
    accent:        colors.oxblood,
    accentPressed: '#3A0303',
    accentGlow:    'rgba(74, 4, 4, 0.08)',
    tabBarBorder:  colors.camel,
    tabBarActive:  colors.oxblood,
  },
  tier: 'free',
  isFounder: false,
};

// ─── Founder tier (same bone/oxblood + mutedGold badge marker, no glow) ──────
export const founderTheme: Theme = {
  tokens: { neutral, brand, semantic, gold, typography, spacing, radius, shadows, motion },
  colors: {
    ...baseColors,
    accent:        colors.oxblood,
    accentPressed: '#3A0303',
    accentGlow:    'rgba(74, 4, 4, 0.06)',  // even more restrained for founders
    tabBarBorder:  colors.camel,
    tabBarActive:  colors.oxblood,
  },
  tier: 'founder',
  isFounder: true,
};

// ─── Context ──────────────────────────────────────────────────────────────────
const ThemeContext = createContext<Theme>(freeTheme);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(freeTheme);

  useEffect(() => {
    // Fetch founding-member status once on mount (best-effort; falls back to freeTheme)
    usersApi
      .getFoundingNumber()
      .then((res: any) => {
        const data = res?.data?.data ?? res?.data ?? null;
        const isFounder = Boolean(data?.isFoundingMember);
        setTheme(isFounder ? founderTheme : freeTheme);
      })
      .catch(() => {
        // Network unavailable or unauthenticated — safe fallback to free tier
        setTheme(freeTheme);
      });
  }, []);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
/**
 * useTheme() — returns `{ tokens, colors, tier, isFounder }`
 *
 * @example
 *   const { colors, tokens, isFounder } = useTheme();
 *   <View style={{ backgroundColor: colors.cardSurface }} />\n */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
