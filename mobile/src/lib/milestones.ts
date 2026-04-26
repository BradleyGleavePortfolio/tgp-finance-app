/**
 * milestones.ts — Pure milestone resolver (no side effects, no API calls)
 * UX Psychology Report #4: Healthy Anticipation
 *
 * Returns the next N milestones the user is closest to achieving, derived
 * from live goal targets, budget cycles, and debt payoff progress.
 */

import type { FinancialProfile, FinancialAccount } from '../types';
import { MILESTONE_DEFINITIONS } from '../utils/constants';

// ─── Result Types ─────────────────────────────────────────────────────────────

export type MilestoneCategory = 'cash' | 'debt' | 'net_worth' | 'streak' | 'budget' | 'paycheck';

export interface ResolvedMilestone {
  key: string;
  title: string;
  description: string;
  icon: string;
  category: MilestoneCategory;
  /** 0–1 fractional progress */
  progress: number;
  /** Friendly label: "$1,200 / $5,000" */
  progressLabel: string;
  /** Motivational copy shown below the bar */
  motivationalCopy: string;
  /** True when progress >= 0.8 — triggers pulse animation */
  isNearTarget: boolean;
  /** Target value (numeric) */
  targetValue: number;
  /** Current value (numeric) */
  currentValue: number;
}

export interface CountdownEvent {
  label: string;
  daysUntil: number;
  /** 'paycheck' | 'budget_reset' | 'goal_deadline' */
  type: 'paycheck' | 'budget_reset' | 'goal_deadline';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatAmount(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${Math.round(value).toLocaleString()}`;
}

function buildMotivationalCopy(
  title: string,
  remaining: number,
  unit: 'dollars' | 'days' | 'percent',
): string {
  if (remaining <= 0) return `${title} — milestone unlocked!`;

  if (unit === 'dollars') {
    const str = formatAmount(remaining);
    return `Just ${str} away from your ${title} milestone`;
  }
  if (unit === 'days') {
    return `${remaining} day${remaining === 1 ? '' : 's'} left — keep the streak going!`;
  }
  return `${Math.round(remaining)}% left to reach ${title}`;
}

// ─── Cash milestones ──────────────────────────────────────────────────────────

const CASH_TARGETS: { key: string; target: number }[] = [
  { key: 'cash_1k',  target: 1_000 },
  { key: 'cash_5k',  target: 5_000 },
  { key: 'cash_10k', target: 10_000 },
  { key: 'cash_20k', target: 20_000 },
];

function resolveCashMilestones(
  totalCash: number,
  unlockedKeys: Set<string>,
): ResolvedMilestone[] {
  return CASH_TARGETS
    .filter(({ key }) => !unlockedKeys.has(key))
    .map(({ key, target }) => {
      const def = MILESTONE_DEFINITIONS.find((m) => m.key === key);
      if (!def) return null;
      const progress = clamp(totalCash / target, 0, 1);
      const remaining = Math.max(0, target - totalCash);
      return {
        key,
        title: def.title,
        description: def.description,
        icon: def.icon,
        category: 'cash' as MilestoneCategory,
        progress,
        progressLabel: `${formatAmount(totalCash)} / ${formatAmount(target)}`,
        motivationalCopy: buildMotivationalCopy(def.title, remaining, 'dollars'),
        isNearTarget: progress >= 0.8,
        targetValue: target,
        currentValue: totalCash,
      };
    })
    .filter((m): m is ResolvedMilestone => m !== null);
}

// ─── Debt milestones ──────────────────────────────────────────────────────────

function resolveDebtMilestones(
  totalDebt: number,
  initialDebt: number,
  unlockedKeys: Set<string>,
): ResolvedMilestone[] {
  const results: ResolvedMilestone[] = [];

  // First debt paid — approximated: if any individual account debt approaches 0
  // (we don't have per-account history here, so skip 'first_debt_paid' — resolved server-side)

  // Halfway there: 50% of initial debt cleared
  if (!unlockedKeys.has('debt_half') && initialDebt > 0) {
    const halfTarget = initialDebt * 0.5;
    const amountPaidOff = Math.max(0, initialDebt - totalDebt);
    const progress = clamp(amountPaidOff / halfTarget, 0, 1);
    const remaining = Math.max(0, halfTarget - amountPaidOff);
    const def = MILESTONE_DEFINITIONS.find((m) => m.key === 'debt_half');
    if (def) {
      results.push({
        key: 'debt_half',
        title: def.title,
        description: def.description,
        icon: def.icon,
        category: 'debt',
        progress,
        progressLabel: `${formatAmount(amountPaidOff)} / ${formatAmount(halfTarget)} paid off`,
        motivationalCopy: buildMotivationalCopy('Halfway There', remaining, 'dollars'),
        isNearTarget: progress >= 0.8,
        targetValue: halfTarget,
        currentValue: amountPaidOff,
      });
    }
  }

  // Debt zero
  if (!unlockedKeys.has('debt_zero') && initialDebt > 0 && totalDebt > 0) {
    const amountPaidOff = Math.max(0, initialDebt - totalDebt);
    const progress = clamp(amountPaidOff / initialDebt, 0, 1);
    const remaining = totalDebt;
    const def = MILESTONE_DEFINITIONS.find((m) => m.key === 'debt_zero');
    if (def) {
      results.push({
        key: 'debt_zero',
        title: def.title,
        description: def.description,
        icon: def.icon,
        category: 'debt',
        progress,
        progressLabel: `${formatAmount(amountPaidOff)} / ${formatAmount(initialDebt)} paid off`,
        motivationalCopy: buildMotivationalCopy('Debt Free', remaining, 'dollars'),
        isNearTarget: progress >= 0.8,
        targetValue: initialDebt,
        currentValue: amountPaidOff,
      });
    }
  }

  return results;
}

// ─── Net worth milestones ─────────────────────────────────────────────────────

const NET_WORTH_TARGETS: { key: string; target: number }[] = [
  { key: 'nw_1k',  target: 1_000 },
  { key: 'nw_5k',  target: 5_000 },
  { key: 'nw_10k', target: 10_000 },
  { key: 'nw_25k', target: 25_000 },
  { key: 'nw_50k', target: 50_000 },
  { key: 'nw_100k',target: 100_000 },
  { key: 'nw_250k',target: 250_000 },
  { key: 'nw_500k',target: 500_000 },
  { key: 'nw_1m',  target: 1_000_000 },
];

function resolveNetWorthMilestones(
  netWorth: number,
  unlockedKeys: Set<string>,
): ResolvedMilestone[] {
  if (netWorth <= 0) return [];
  return NET_WORTH_TARGETS
    .filter(({ key }) => !unlockedKeys.has(key))
    .filter(({ target }) => netWorth < target)
    .slice(0, 2) // only show next 2 to avoid overwhelming
    .map(({ key, target }) => {
      const def = MILESTONE_DEFINITIONS.find((m) => m.key === key);
      if (!def) return null;
      const progress = clamp(netWorth / target, 0, 1);
      const remaining = Math.max(0, target - netWorth);
      return {
        key,
        title: def.title,
        description: def.description,
        icon: def.icon,
        category: 'net_worth' as MilestoneCategory,
        progress,
        progressLabel: `${formatAmount(netWorth)} / ${formatAmount(target)}`,
        motivationalCopy: buildMotivationalCopy(def.title, remaining, 'dollars'),
        isNearTarget: progress >= 0.8,
        targetValue: target,
        currentValue: netWorth,
      };
    })
    .filter((m): m is ResolvedMilestone => m !== null);
}

// ─── Streak milestones ────────────────────────────────────────────────────────

const STREAK_TARGETS: { key: string; target: number }[] = [
  { key: 'streak_7',   target: 7 },
  { key: 'streak_30',  target: 30 },
  { key: 'streak_90',  target: 90 },
  { key: 'streak_365', target: 365 },
];

function resolveStreakMilestones(
  streakDays: number,
  unlockedKeys: Set<string>,
): ResolvedMilestone[] {
  return STREAK_TARGETS
    .filter(({ key }) => !unlockedKeys.has(key))
    .filter(({ target }) => streakDays < target)
    .slice(0, 1)
    .map(({ key, target }) => {
      const def = MILESTONE_DEFINITIONS.find((m) => m.key === key);
      if (!def) return null;
      const progress = clamp(streakDays / target, 0, 1);
      const remaining = Math.max(0, target - streakDays);
      return {
        key,
        title: def.title,
        description: def.description,
        icon: def.icon,
        category: 'streak' as MilestoneCategory,
        progress,
        progressLabel: `${streakDays} / ${target} days`,
        motivationalCopy: buildMotivationalCopy(def.title, remaining, 'days'),
        isNearTarget: progress >= 0.8,
        targetValue: target,
        currentValue: streakDays,
      };
    })
    .filter((m): m is ResolvedMilestone => m !== null);
}

// ─── Main Resolver ────────────────────────────────────────────────────────────

export interface MilestoneResolverInput {
  profile: FinancialProfile | null;
  accounts: FinancialAccount[];
  /** Keys already unlocked (from milestonesStore) */
  unlockedKeys?: string[];
  /** Max milestones to return (default 3) */
  limit?: number;
}

/**
 * Returns next N milestones ordered by progress descending (closest first).
 * Pure function — no side effects.
 */
export function resolveNextMilestones(input: MilestoneResolverInput): ResolvedMilestone[] {
  const { profile, accounts, unlockedKeys = [], limit = 3 } = input;

  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const unlockedSet = new Set(unlockedKeys);

  // Compute derived values
  const totalCash = safeAccounts
    .filter((a) => !a.is_debt && ['checking', 'savings'].includes(a.account_type))
    .reduce((s, a) => s + (Number(a.balance) || 0), 0);

  const totalDebt = safeAccounts
    .filter((a) => a.is_debt)
    .reduce((s, a) => s + (Number(a.balance) || 0), 0);

  // Approximate initial debt: current debt + any zero-balance debt accounts (not tracked here)
  // Use total_debt from profile snapshot as the "initial" debt proxy
  const initialDebt = Math.max(
    totalDebt,
    isFinite(Number(profile?.total_debt)) ? Number(profile?.total_debt) : totalDebt,
  );

  const netWorth = isFinite(Number(profile?.net_worth_snapshot))
    ? Number(profile?.net_worth_snapshot)
    : safeAccounts.reduce((s, a) => s + (a.is_debt ? -1 : 1) * (Number(a.balance) || 0), 0);

  const streakDays = isFinite(Number(profile?.streak_days)) ? Number(profile?.streak_days) : 0;

  // Gather all candidate milestones
  const candidates: ResolvedMilestone[] = [
    ...resolveCashMilestones(totalCash, unlockedSet),
    ...resolveDebtMilestones(totalDebt, initialDebt, unlockedSet),
    ...resolveNetWorthMilestones(netWorth, unlockedSet),
    ...resolveStreakMilestones(streakDays, unlockedSet),
  ];

  // Sort: closest to target first (highest progress)
  candidates.sort((a, b) => b.progress - a.progress);

  return candidates.slice(0, limit);
}

// ─── Countdown Resolver ───────────────────────────────────────────────────────

/**
 * Resolves upcoming time-based events for the CountdownTile.
 * Returns events sorted by daysUntil ascending.
 */
export function resolveCountdownEvents(profile: FinancialProfile | null): CountdownEvent[] {
  const events: CountdownEvent[] = [];
  const now = new Date();

  // Budget reset: assume monthly on the 1st of next month
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysUntilReset = Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  events.push({
    label: 'Budget resets',
    daysUntil: daysUntilReset,
    type: 'budget_reset',
  });

  // Paycheck: assume bi-weekly on Fridays (next upcoming Friday if no profile data)
  // A real implementation would use income_sources frequency — defaulting to bi-weekly here
  const daysUntilFriday = (() => {
    const day = now.getDay(); // 0=Sun, 5=Fri
    const diff = (5 - day + 7) % 7;
    return diff === 0 ? 7 : diff; // if today is Friday, next Friday
  })();

  const incomeSources = Array.isArray(profile?.income_sources) ? profile!.income_sources : [];
  const hasWeeklyIncome = incomeSources.some((s) => s.frequency === 'weekly');
  const hasBiWeekly = !hasWeeklyIncome; // default assumption

  if (hasWeeklyIncome) {
    events.push({ label: 'Next paycheck', daysUntil: daysUntilFriday, type: 'paycheck' });
  } else if (hasBiWeekly) {
    // Bi-weekly: next occurring 14-day boundary
    const paycheckDays = daysUntilFriday <= 7 ? daysUntilFriday : daysUntilFriday + 7;
    events.push({ label: 'Next paycheck', daysUntil: Math.min(paycheckDays, 14), type: 'paycheck' });
  }

  // Goal deadline: if profile has a goal_timeline_months set
  if (profile?.primary_goal && profile?.goal_timeline_months && profile.goal_timeline_months > 0) {
    // Rough estimate: created_at + goal_timeline_months
    const createdAt = profile.updated_at ? new Date(profile.updated_at) : now;
    const goalDate = new Date(createdAt);
    goalDate.setMonth(goalDate.getMonth() + profile.goal_timeline_months);
    const daysUntilGoal = Math.ceil((goalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilGoal > 0 && daysUntilGoal < 365) {
      events.push({ label: 'Goal deadline', daysUntil: daysUntilGoal, type: 'goal_deadline' });
    }
  }

  // Sort by soonest first
  events.sort((a, b) => a.daysUntil - b.daysUntil);

  return events;
}
