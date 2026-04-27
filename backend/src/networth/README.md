# Net Worth

Read-side roll-ups for the dashboard: current totals, history series,
cash-flow estimate, savings rate, DTI, and daily / monthly / annual
interest bleed. The mobile dashboard's hero card is built almost
entirely from `GET /api/networth/current`.

## Files

- `networth.controller.ts` — `/api/networth/current` and
  `/api/networth/history`.
- `networth.service.ts` — derivations.
- `networth.module.ts`.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/networth/current` | Live totals + cash flow + interest bleed + scores. |
| GET | `/api/networth/history?days=90` | Per-EOD net worth + asset/debt/cash trace. |

## Derivations (`getCurrentNetWorth`)

Reads the user's `FinancialProfile` plus every active
`FinancialAccount`. Computes:

- **`total_assets` / `total_debt` / `total_cash`** — same partition as
  in `EODService` and `ProfileService.computeAndUpdateTotals`. The
  `is_debt` flag governs the partition; `[checking, savings]` non-debt
  accounts are the "cash" subset. **All sums go through `toN`.**
- **`net_worth`** — assets - debt.
- **`previous_net_worth`** — last `EODSubmission.net_worth_computed`,
  used by the dashboard delta widget.
- **`monthly_cash_flow`** — `monthly_income - minimum_payments -
  estimated_expenses`. Estimated expenses are a heuristic 60% of
  income. Negative values render as a "cash flow gap" in the UI.
- **`dti_ratio`** — `monthly_minimums / monthly_income`. Used by the
  AI coach context.
- **`savings_rate`** — growth in savings + brokerage + retirement
  account balances over the trailing 30 days, divided by monthly
  income. Clamped to `[0, 1]`. **See bug fix note below.**
- **`interest_bleed_*`** — sum of `(balance × apr%) / 365` for every
  debt with an APR. The annual figure equals the daily times 365 (we
  don't compound for this widget — it's a daily-cost-of-debt
  illustration, not a payoff projection).

## Savings-rate caveat

The savings-rate filter previously used the enum strings
`['savings', 'investment', 'retirement']`, which never matched the
actual `AccountType` values (`savings`, `investment_brokerage`,
`retirement_401k`, `retirement_ira`). Until the round-2 fix the rate
was effectively always 0 for users with brokerage or retirement
accounts.

When you add a new account type, update **all** savings-bearing
filters together: `accounts.service.ts::isDebtType` (debt vs asset
classification), and the savings-rate filter here. There is no
shared constant — keep them in sync by hand.

## History endpoint

Reads every `EODSubmission` since `now() - days`, returns the four
metric fields per row (`net_worth`, `total_assets`, `total_debt`,
`total_cash`) keyed by `submission_date`. The
`DecimalToNumberInterceptor` converts the `Decimal` columns to numbers
on the way out.

## Security & tenancy

- Both endpoints are JWT-gated and operate on `request.user.id` only.
- Coach views into a client's net worth go through `coach.service.ts
  ::getStudentDetailWithHistory` (which returns the same shape but
  ownership-checked).

## Environment variables

None unique to this module.

## Failure modes

- **No EODs yet** → `previous_net_worth` falls back to the live
  `net_worth` so the delta widget renders 0 instead of `NaN`.
- **No income on profile** → `dti_ratio = 0`, `savings_rate = 0`,
  `monthly_cash_flow` reflects the zero income (likely deeply
  negative). The mobile UI guards against this case before render.
- **No debt with APR** → `interest_bleed_*` are all 0. Correct.

## Tests

`backend/test/networth.service.spec.ts` covers:

- the savings-rate fix (asserts non-zero rate with a brokerage +
  retirement fixture),
- partition correctness for cash vs assets,
- DTI math,
- interest-bleed formula.

## Operations

- The history endpoint is unbounded by total row count (only by date
  window). For a multi-year-tenured user with daily EODs that's ~365
  rows per year, well within a single request budget.
- `interest_bleed_daily` is a UI motivator, not a compounding
  calculator. For real "interest paid over N years on debt X" use the
  `whatif/` extra-debt-payment scenario, which uses the closed-form
  amortization helper.
