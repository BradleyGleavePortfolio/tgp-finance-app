// useTrophyTrigger — UX Psychology Report #5: Trophy-Grade Milestone Artifact
// Central hook for triggering the trophy screen from any surface.
// Encodes the headline/theme/surface into navigation params, then pushes /trophy.
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import type { TrophyTheme } from '../components/trophy/TrophyArtifact';

export interface TrophyParams {
  headline: string;
  subtitle?: string;
  identityTitle?: string;
  isFounder?: boolean;
  theme?: TrophyTheme;
  surface: string;
}

/**
 * useTrophyTrigger
 * Returns a `triggerTrophy(params)` function that navigates to /trophy.
 * Safe to call even if /trophy is not reachable — catches navigation errors.
 */
export function useTrophyTrigger() {
  const router = useRouter();

  const triggerTrophy = useCallback((params: TrophyParams) => {
    try {
      router.push({
        pathname: '/trophy',
        params: {
          headline:      params.headline,
          subtitle:      params.subtitle ?? '',
          identityTitle: params.identityTitle ?? '',
          isFounder:     params.isFounder ? '1' : '0',
          theme:         params.theme ?? 'gold',
          surface:       params.surface,
        },
      });
    } catch {
      // Gracefully no-op if navigation is unavailable
    }
  }, [router]);

  return { triggerTrophy };
}

// ─── Milestone-key → trophy params helper ────────────────────────────────────

const MILESTONE_HEADLINE_MAP: Record<string, { headline: string; theme: TrophyTheme }> = {
  // Cash / savings
  cash_1k:       { headline: '$1K SAVED',     theme: 'gold' },
  cash_5k:       { headline: '$5K SAVED',     theme: 'gold' },
  cash_10k:      { headline: '$10K SAVED',    theme: 'gold' },
  cash_20k:      { headline: '$20K SAVED',    theme: 'gold' },
  // Debt
  first_debt_paid: { headline: 'DEBT SLAYER', theme: 'debt' },
  debt_free:       { headline: 'DEBT FREE',   theme: 'debt' },
  // Net worth
  networth_positive:  { headline: 'NET WORTH +', theme: 'net_worth' },
  networth_10k:       { headline: '$10K NW',     theme: 'net_worth' },
  networth_25k:       { headline: '$25K NW',     theme: 'net_worth' },
  networth_50k:       { headline: '$50K NW',     theme: 'net_worth' },
  networth_100k:      { headline: '$100K NW',    theme: 'net_worth' },
  // Streak
  streak_7:  { headline: '7-DAY STREAK',  theme: 'brand' },
  streak_30: { headline: '30-DAY STREAK', theme: 'brand' },
  streak_90: { headline: '90-DAY STREAK', theme: 'brand' },
  // Income
  income_goal:  { headline: 'INCOME GOAL HIT', theme: 'brand' },
};

export function milestoneKeyToTrophyParams(
  milestoneKey: string,
  subtitle: string,
  identityTitle?: string,
  isFounder?: boolean,
): TrophyParams {
  const mapping = MILESTONE_HEADLINE_MAP[milestoneKey] ?? {
    headline: 'GOAL CRUSHED',
    theme: 'gold' as TrophyTheme,
  };
  return {
    headline: mapping.headline,
    subtitle,
    identityTitle,
    isFounder,
    theme: mapping.theme,
    surface: 'milestone',
  };
}

// ─── Round-number savings milestones ─────────────────────────────────────────
// Called from home screen net-worth / cash tracking.

const SAVINGS_THRESHOLDS = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];

/**
 * Returns the highest crossed savings threshold from oldValue → newValue,
 * or null if no threshold was crossed.
 */
export function getSavingsMilestone(
  oldValue: number,
  newValue: number,
): number | null {
  for (const t of [...SAVINGS_THRESHOLDS].reverse()) {
    if (oldValue < t && newValue >= t) return t;
  }
  return null;
}

export function savingsMilestoneToTrophyParams(
  amount: number,
  identityTitle?: string,
  isFounder?: boolean,
): TrophyParams {
  const formatted = amount >= 1_000
    ? `$${Math.round(amount / 1_000)}K SAVED`
    : `$${amount} SAVED`;
  return {
    headline: formatted,
    subtitle: `You hit a round-number savings milestone`,
    identityTitle,
    isFounder,
    theme: 'gold',
    surface: 'savings_milestone',
  };
}
