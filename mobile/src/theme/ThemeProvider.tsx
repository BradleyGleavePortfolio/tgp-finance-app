/**
 * ThemeProvider — Premium Visual System (Psych Report UX #5)
 * ════════════════════════════════════════════════════════════
 * Reads `isFoundingMember` from the API (same pattern as home/profile tabs).
 * Surfaces `freeTheme` or `founderTheme` via `useTheme()`.
 *
 * founderTheme overlays gold accents onto the base dark palette;
 * everything else is identical so non-founders get the same polished UI.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { neutral, brand, semantic, gold, typography, spacing, radius, shadows, motion } from './tokens';
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

// ─── Shared palette ───────────────────────────────────────────────────────────
const baseColors = {
  background:           neutral[950],
  cardSurface:          neutral[900],
  cardSurfaceElevated:  neutral[800],
  textPrimary:          neutral[100],
  textSecondary:        neutral[400],
  border:               neutral[700],
  success:              semantic.success,
  warn:                 semantic.warn,
  danger:               semantic.danger,
  info:                 semantic.info,
  tabBarBackground:     neutral[950],
  tabBarInactive:       neutral[400],
};

// ─── Free tier (brand-teal accents) ──────────────────────────────────────────
export const freeTheme: Theme = {
  tokens: { neutral, brand, semantic, gold, typography, spacing, radius, shadows, motion },
  colors: {
    ...baseColors,
    accent:        gold[400],          // keep gold as the primary accent (existing brand)
    accentPressed: gold[500],
    accentGlow:    gold.overlay12,
    tabBarBorder:  neutral[700],
    tabBarActive:  gold[400],
  },
  tier: 'free',
  isFounder: false,
};

// ─── Founder tier (gold accents + elevated glow) ─────────────────────────────
export const founderTheme: Theme = {
  tokens: { neutral, brand, semantic, gold, typography, spacing, radius, shadows, motion },
  colors: {
    ...baseColors,
    accent:        gold[400],
    accentPressed: gold[500],
    accentGlow:    gold.overlay20,     // more vivid glow for founders
    tabBarBorder:  neutral[700],
    tabBarActive:  gold[400],
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
 *   <View style={{ backgroundColor: colors.cardSurface }} />
 */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
