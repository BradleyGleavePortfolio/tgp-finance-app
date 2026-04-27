# Profile

CRUD over `FinancialProfile` plus the recompute helper that re-derives
`total_assets`, `total_debt`, `total_cash`, and `net_worth_snapshot`
from the user's active accounts. Most of the time these aggregates are
re-derived inside the EOD transaction; this module exists for ad-hoc
reads, profile edits during onboarding, and the manual-recompute path.

## Files

- `profile.controller.ts` — `/api/profile` GET / PUT.
- `profile.service.ts` — `getProfile`, `updateProfile`,
  `computeAndUpdateTotals`.
- `profile.module.ts`.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/profile` | Returns the profile row. Auto-creates an empty row if missing so the mobile UI never sees a 404 on first load. |
| PUT | `/api/profile` | Upserts. Computes the missing direction of `monthly_income_gross` ↔ `annual_income_gross` (one is derived from the other if only one is supplied). |

## Data flow

`computeAndUpdateTotals(userId)`:

1. Read all active `FinancialAccount` rows.
2. Run `toN()` on every `balance` (Prisma surfaces `Decimal`; mixing
   into `+` without `toN` silently coerces to a string).
3. Sum into `total_assets`, `total_debt`, `total_cash` (only checking +
   savings count as cash), and derive `net_worth_snapshot` as
   `assets - debt`.
4. Upsert the profile row with the new aggregates.

The EOD service does the same math inside its interactive transaction —
this method is the standalone path used from scripts, the seed, and
the manual recompute the mobile UI offers. Calling it does **not**
update streak / velocity / `last_eod_date`; those live in `EODService`.

## Security & tenancy

- Both endpoints are JWT-gated; tenant scoping is implicit (every action
  is on the calling user's own `user_id`).
- No cross-user access is exposed here. Coach views into a client's
  profile go through `coach.service.ts`.

## Environment variables

None unique to this module.

## Failure modes

- **Profile auto-create.** GET will create an empty row on first hit.
  This is intentional — the mobile UI relies on it. If a downstream
  caller wants strict not-found semantics it should query Prisma
  directly.
- **Stale aggregates.** If a user edits an account balance mid-day and
  doesn't submit an EOD, `FinancialProfile.total_*` and
  `net_worth_snapshot` are stale until the next EOD or until
  `computeAndUpdateTotals` is called. The mobile dashboard always shows
  *as-of-last-EOD* labels — this is by design (single daily ledger),
  not a bug.
- **Income coercion.** Supplying both monthly and annual leaves both
  intact (no override). Supplying only one derives the other.

## Tests

Profile-specific specs are folded into the EOD and net-worth tests
because the recompute logic is exercised end-to-end there.
`backend/test/networth.service.spec.ts` covers the derivation match
between `computeAndUpdateTotals` and `getCurrentNetWorth`.

## Operations

- Manual recompute is safe to call any time — it only writes if the
  derived totals differ.
- After a bulk DB import (CSV upload, partner migration), call
  `computeAndUpdateTotals` for each affected user before they next open
  the app, otherwise the dashboard will stay stale until their next
  EOD.
