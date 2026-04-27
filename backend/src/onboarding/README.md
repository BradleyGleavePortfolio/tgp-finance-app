# Onboarding

Maps the mobile app's onboarding quiz answers into `FinancialProfile`
fields and flips `onboarding_complete = true`. Two endpoints — submit
and status read.

## Files

- `onboarding.controller.ts` — `/api/onboarding/quiz` POST,
  `/api/onboarding/status` GET.
- `onboarding.service.ts` — quiz mapping + read.
- `onboarding.module.ts`.

## Quiz mapping

The mobile quiz produces a flat string-keyed object. The service maps
known keys into typed profile fields:

| Quiz key | Profile field | Coercion |
|----------|---------------|----------|
| `risk_tolerance` | `risk_tolerance` | `Conservative/Moderate/Aggressive/Very Aggressive` → enum, default `moderate`. |
| `financial_goal` | `primary_goal` | Free text. |
| `investment_horizon` | `goal_timeline_months` | `<1 yr` → 6, `1-3 yr` → 24, `3-5 yr` → 48, `5+ yr` → 120, default 24. |
| `income_range` | `annual_income_gross` | `Under $50k` → 35000, `$50k-$100k` → 75000, `$100k-$200k` → 150000, `$200k+` → 250000, default 75000. |
| `monthly_take_home` | `monthly_income_gross` (and `annual`) | Parsed as float. Take-home is converted to gross at a 75% effective rate (`gross = take_home / 0.75`). Annual is then `monthly × 12`. |
| `monthly_dream_cost` | `dream_lifestyle_cost_mo` | Parsed as float. |
| `dream_description` | `dream_description` | Free text. |
| `future_self_letter` | `future_self_letter` | Free text. Revealed at day 90 by the mobile UI. |

Either `monthly_take_home` (if provided) or `income_range` is the
income source — `monthly_take_home` wins when both are present, so
later, more precise inputs override the bucketed range.

## Endpoints

| Method | Path | Body / Returns |
|--------|------|----------------|
| POST | `/api/onboarding/quiz` | `{ answers: Record<string, string> }` → `{ success: true, message }`. Upserts the profile and sets `onboarding_complete = true`. |
| GET | `/api/onboarding/status` | `{ completed, profile }` for the resume-where-you-left-off mobile flow. |

## Security & tenancy

JWT-gated. Operates on `request.user.id` only; the body cannot
specify a different user.

## Environment variables

None unique to this module.

## Failure modes

- Unknown / mistyped quiz keys are silently ignored — extra keys in
  the body don't error out the upsert. This is intentional so we can
  add quiz steps in the mobile app ahead of the schema migration.
- A second submit overwrites the existing answers — there's no "lock"
  after the first run. The UI guards against re-running the quiz once
  `onboarding_complete = true`, but the API does not.

## Tests

Onboarding mapping is exercised end-to-end via `coach.service.spec.ts`
and `eod.service.spec.ts` (those tests seed profiles via the same
upsert path). A direct `onboarding.service.spec.ts` is a near-term
TODO — a value-table test for the four mapping helpers would be cheap
and high-signal.

## Operations

- Adding a new quiz question: extend the mobile quiz screen, then the
  mapping table here. New free-text fields can be added straight onto
  `FinancialProfile`; new enum-shaped fields need a Prisma migration
  and an update to the corresponding `mapXxx` helper.
- The 75% take-home → gross conversion is a heuristic. We keep it for
  consistency with the AI coach context, which uses 78% take-home.
  The two rates differ on purpose: onboarding errs conservatively
  (assumes higher tax burden so the income figure is robust to
  surprises), AI context errs realistic (after standard 401k +
  pre-tax deductions).
