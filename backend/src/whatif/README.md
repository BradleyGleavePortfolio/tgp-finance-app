# What-If Scenarios

Twelve closed-form financial scenarios. Each one consumes the user's
current profile + accounts and a small parameter object, and returns a
1-, 3-, 5-, and 10-year net worth projection plus a `result_summary`
specific to the scenario type.

## Files

- `whatif.controller.ts` — `/api/whatif/run`, `/api/whatif/saved`,
  `/api/whatif/save`, `DELETE /api/whatif/:id`.
- `whatif.service.ts` — the 12 scenario implementations, three closed-
  form math helpers (`fv`, `fvAnnuity`, `debtPayoffMonths`,
  `totalInterestPaid`), and the cost-of-living JSON loader.
- `whatif.module.ts`.

## Scenarios

`ScenarioType` enum (mirrored in Prisma):

| Type | What it answers |
|------|-----------------|
| `extra_debt_payment` | "If I throw $X/mo extra at this debt, when is it gone?" |
| `income_increase` | "What if I earn $X/mo more?" |
| `relocate_country` | "What if I move to country Y?" Reads `data/cost_of_living_2026.json`. |
| `relocate_city` | "What if I move to city Z?" Same data file. |
| `cut_expense` | "What if I cut $X/mo of expenses?" |
| `invest_lump_sum` | "What if I invest a windfall today?" |
| `sell_asset` | "What if I sell asset A?" |
| `start_business` | "What if I start a business that yields $X/mo?" |
| `pay_off_debt_early` | "Faster payoff on a single debt." |
| `salary_negotiation` | "Negotiate a raise of X%." |
| `tax_optimization` | "Max 401k / IRA / HSA." |
| `retire_early` | "Reach FI at age N." |

## Math helpers

```
fv(pv, r, n)        = pv × (1 + r)^n
fvAnnuity(pmt, r, n) = pmt × ((1+r)^n - 1) / r   (zero-r → pmt × n)
debtPayoffMonths(balance, apr, payment)
                    = ⌈ ln(payment / (payment - r·balance)) / ln(1 + r) ⌉
                      where r = apr/100/12; returns Infinity if payment ≤ r·balance.
totalInterestPaid(balance, apr, payment) = months × payment − balance
```

These are pure — no I/O — and unit-testable in isolation. If you add a
scenario that needs more advanced behavior (Monte Carlo,
sequence-of-returns risk, tax-bracketed projections), keep the closed-
form path as the default and add the new path behind a parameter flag.

## Cost-of-living JSON

`data/cost_of_living_2026.json` (project root) is consulted by the two
relocation scenarios. The loader tries multiple paths so it works under
both `ts-node` dev and the compiled `dist/` layout. If the file isn't
found at any candidate path, an empty array is returned and the
relocation scenarios degrade gracefully (no city/country comparison
data, base-case projection only). The optional `NUMBEO_API_KEY` is used
by `costliving/` to keep the JSON fresh; in production we ship the
bundled snapshot as the fallback.

## Endpoints

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/api/whatif/run` | `{ scenario_type, parameters }` | Runs the scenario, does not persist. Validation via `RunWhatIfSchema`. |
| GET | `/api/whatif/saved` | — | Saved scenarios for the calling user. |
| POST | `/api/whatif/save` | `{ scenario_type, label, parameters, result_summary, projection_*yr }` | Persists into `what_if_scenarios`. |
| DELETE | `/api/whatif/:id` | — | Soft fail if the row doesn't belong to the caller. |

## Security & tenancy

- All endpoints are JWT-gated.
- `runScenario` uses `request.user.id` to load profile + accounts; the
  body cannot specify a different user.
- `deleteScenario` verifies the saved row belongs to the calling user
  before deleting.

## Environment variables

| Key | Effect |
|-----|--------|
| `NUMBEO_API_KEY` | Optional. Keeps `data/cost_of_living_2026.json` fresh via the `costliving/` module. With it unset, the bundled snapshot is the only source. |

## Failure modes

| Code | When |
|------|------|
| `INVALID_SCENARIO` | Unknown `scenario_type`. |
| `VALIDATION_ERROR` | Zod rejection on body. |
| `NOT_FOUND` | Save / delete on a missing or non-owned row. |

Scenario internals can return `{ error: '...' }` in the
`result_summary` (e.g. extra-debt-payment with no debt accounts) so
the mobile client renders an empty-state instead of a 500.

## Tests

The math helpers and a representative scenario are covered indirectly
through the `coach.service` and `eod.service` specs (projection math
is a downstream consumer). A direct `whatif.service.spec.ts` is a
near-term TODO. If you add one, snapshot the closed-form output for
each of the 12 scenarios with a fixed fixture to catch any drift.

## Operations

- The cost-of-living refresh job lives in `costliving/`; the JSON file
  is checked into git as the production fallback. Don't delete it
  thinking it's stale — it's the *floor* the API uses when Numbeo is
  unreachable.
- Adding a new scenario: extend the `ScenarioType` enum (Prisma + the
  shared zod schema), add a `scenarioXxx` method, and add a `case` in
  the `runScenario` switch. The mobile client's
  `mobile/app/whatif/[type].tsx` route picks up new types from a
  config map — keep both ends in sync.
