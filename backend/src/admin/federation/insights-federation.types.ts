/**
 * Insights federation response contract.
 *
 * Consumed by `growth-project-backend`'s
 * `src/insights/finance-insights.client.ts` -> `FinanceInsightsSummary`.
 * Both shapes must move together; the backend client treats this as the
 * authoritative source for what the federation surface returns.
 *
 * Bucketing:
 *   - One row per ISO week (YYYY-Www) that has at least one EODSubmission
 *     on or before the end of that week. Weeks with no EOD coverage are
 *     omitted; the backend's `alignWeekly` correctly handles a sparse
 *     series.
 *   - `weekKey` matches the algorithm in
 *     growth-project-backend/src/common/correlation/pearson.ts::isoWeekKey.
 *
 * Values:
 *   - `savings_rate_pct` is a percentage in [0, 100]. Computed from the
 *     week-over-week change in `total_cash_computed` normalized against
 *     the weekly share of `monthly_income_gross`. Negative cash growth
 *     clamps to 0; cash growth above 100% of weekly income clamps to 100.
 *   - `spending_kusd` is the approximate outflow that week, in thousands
 *     of USD, derived from cash deltas. Zero when cash grew. Negative is
 *     impossible by construction.
 *   - `debt_to_income` is `total_debt / monthly_income_gross` for the last
 *     EOD of the week. Clamped to [0, 5].
 */

export interface FinanceInsightsWeek {
  weekKey: string;
  savings_rate_pct: number;
  spending_kusd: number;
  debt_to_income: number;
}

export interface FinanceInsightsSummary {
  weeks: FinanceInsightsWeek[];
  generated_at: string;
}
