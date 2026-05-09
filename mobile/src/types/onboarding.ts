/**
 * Onboarding wire contract — explicit string-literal types for the values
 * that the mobile quiz POSTs to the backend `/api/onboarding/quiz` endpoint.
 *
 * Stage-1 fix: replaces the previous `Record<string, unknown>` payload that
 * allowed silent enum drift between mobile and backend (the income-bucket
 * mismatch that pinned every user to $75 000/yr default).
 *
 * Backend authority:
 *   - `backend/src/common/validators/schemas.ts` (SubmitQuizSchema, Zod)
 *   - `backend/src/onboarding/onboarding.service.ts` (mapRiskTolerance,
 *     mapInvestmentHorizon, mapIncomeRange)
 *
 * Any change to the unions below must land in lockstep with the backend
 * mappers — the unit tests in `src/lib/__tests__/onboarding.contract.test.ts`
 * pin both sides.
 */

/**
 * Display-side risk tolerance (title-case). Mirrors the backend
 * `mapRiskTolerance` switch cases. Lowercase storage enum is owned by
 * Prisma — UI uses the title-case string the backend translates.
 */
export type RiskToleranceWire =
  | 'Conservative'
  | 'Moderate'
  | 'Aggressive';

/**
 * Investment horizon buckets. Strings exactly match backend
 * `mapInvestmentHorizon` cases — divergence here re-introduces the Stage-0
 * "default 48 months for everyone" bug.
 */
export type InvestmentHorizonWire =
  | 'Less than 1 year'
  | '1-3 years'
  | '3-5 years'
  | '5+ years';

/**
 * Income-range bucket strings. Strings exactly match backend
 * `mapIncomeRange` cases. Stage-0 used `'under_50k' | '50k_100k' | 'over_100k'`
 * which silently fell through to default 75 000.
 *
 * Preferred path: send `monthly_take_home` (numeric) instead of a bucket;
 * the backend grosses up by 0.75 and computes annual itself. The bucket
 * is kept for skip-with-defaults and for users who decline to share a
 * specific number.
 */
export type IncomeRangeWire =
  | 'Under $50k'
  | '$50k-$100k'
  | '$100k-$200k'
  | '$200k+';

/**
 * Goal strings. The backend persists this verbatim into
 * `FinancialProfile.primary_goal` (no enum). Identity-title resolution and
 * milestones do substring matching (`includes('debt')`, etc.), so spaces and
 * lowercase are intentional. Keep the union closed so a future option must
 * be added explicitly here AND in the goal screen.
 */
export type FinancialGoalWire =
  | 'debt payoff'
  | 'save more'
  | 'build wealth';

/**
 * Submit-quiz payload. The backend `SubmitQuizSchema` accepts these fields
 * inside an `{ answers: ... }` envelope.
 *
 * `monthly_take_home` is sent as a string because backend `MoneyAmount`
 * Zod coerces from string → Prisma.Decimal without IEEE-754 drift. Mobile
 * forms produce strings naturally from `<TextInput>`.
 *
 * `bank_connected` is included for activation analytics. The backend Zod
 * schema is non-strict, so unknown keys are stripped server-side and do
 * not cause validation failures — but we still type them to keep the
 * payload shape honest.
 *
 * `skipped` flags the row as defaults-only for analytics/recovery. The
 * reconciler (`reconcileOnboarding`) re-prompts these users on next open.
 */
export interface SubmitQuizAnswers {
  risk_tolerance: RiskToleranceWire;
  investment_horizon: InvestmentHorizonWire;
  financial_goal: FinancialGoalWire;
  income_range: IncomeRangeWire;
  monthly_take_home?: string;
  monthly_dream_cost?: string;
  dream_description?: string;
  future_self_letter?: string;
  /** 'yes' | 'no' — best-effort signal for funnel analytics. */
  bank_connected?: 'yes' | 'no';
  /** When true, the user skipped the flow and the answers are defaults. */
  skipped?: boolean;
}

/**
 * Defaults used by the explicit "Skip" path. Picks values that map to
 * sensible backend defaults (the same fallbacks the mappers would have
 * picked) so the resulting profile is internally consistent — not the
 * accidental "$75k for everyone" we used to ship.
 */
export const SKIP_DEFAULTS: SubmitQuizAnswers = {
  risk_tolerance: 'Moderate',
  investment_horizon: '3-5 years',
  financial_goal: 'save more',
  income_range: '$50k-$100k',
  skipped: true,
};
