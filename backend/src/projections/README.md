# Projections

Long-horizon net-worth projections used by the dashboard's "where
will I be in N years" widget and by several what-if scenarios that
bake in the user's existing trajectory.

## Files

- `projections.controller.ts` — `/api/projections/*` reads.
- `projections.service.ts` — closed-form projection helpers.
- `projections.module.ts`.

## Math

Projections share helpers with `whatif/`:

```
fv(pv, r, n)         — future value of a lump sum
fvAnnuity(pmt, r, n) — future value of recurring contributions
```

Default returns assume an 8% annual rate (long-run S&P 500 nominal
average), tunable via the scenario parameter where it matters. The
projection is *deterministic* — no Monte Carlo today. Acceptable
because the dashboard widget is illustrative; the AI coach context
includes "8% historical average" copy so users see the assumption.

## Security & tenancy

JWT-gated. All inputs come from `request.user`'s profile; no cross-
user reads.

## Environment variables

None unique to this module.

## Failure modes

- A user with `monthly_income_gross = 0` projects flat (no
  contributions). Correct.
- Negative starting net worth + positive contributions still
  projects forward (compounding the negative principal is fine —
  users see a turn-positive crossover date).

## Operations

- Changing the default return assumption: update the constant in
  `projections.service.ts` and the matching scenario default in
  `whatif/`. The two should always be in lock step or the dashboard
  preview will disagree with the saved scenario.
