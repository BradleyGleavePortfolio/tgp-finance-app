# Payday

The "deploy your paycheck" surface. A user submits an array of
allocations (account id + amount, optionally percentage) summing to ≤
the paycheck total; the service updates each account's balance
accordingly (credits debt accounts down, asset accounts up) and writes
balance log entries.

## Files

- `payday.controller.ts` — `/api/payday` POST, `/api/payday/templates`
  GET / POST.
- `payday.service.ts` — `deployPaycheck`, `saveTemplate`,
  `getTemplates`.
- `payday.module.ts`.

## Endpoints

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/api/payday` | `{ paycheck_amount, allocations: [{ account_id, amount, percentage? }] }` | Applies the allocations. Validates total. |
| GET | `/api/payday/templates` | — | Stored allocation templates from `FinancialProfile.payday_templates` JSON. |
| POST | `/api/payday/templates` | `{ name, allocations: [{ account_id, percentage }] }` | Saves a template; appends to the JSON array. |

## Allocation semantics

- `sum(allocations.amount)` must be ≤ `paycheck_amount + 0.001`. Slight
  over-allocation by floating-point drift is tolerated; meaningful
  over-allocation throws `OVER_ALLOCATED`. Under-allocation is fine —
  the un-allocated remainder is implicitly cash that doesn't move.
- Each `account_id` must exist, be active, and belong to the calling
  user.
- For debt accounts, the allocation amount **reduces** the
  outstanding balance. For asset accounts, it **increases** the
  balance. The mobile UI labels the choice as "pay down" vs "save into".

## Templates

Templates are stored as a JSON array on `FinancialProfile.payday_templates`
keyed by an in-row `id` and `created_at`. They are intentionally a
JSON column, not a separate table, because they're per-user and never
queried across users — this avoids an extra table and keeps load on a
single round trip.

## Security & tenancy

- All endpoints are JWT-gated.
- Every account in the allocation list is verified to belong to
  `request.user.id` before any write.
- Templates are scoped to the calling user via the JSON column on
  their own profile row.

## Environment variables

None unique to this module.

## Failure modes

| Code | When |
|------|------|
| `OVER_ALLOCATED` | `sum(allocations.amount) > paycheck_amount + 0.001`. |
| `FORBIDDEN` | One of the `account_id`s is not the caller's. |
| `NOT_FOUND` | One of the `account_id`s doesn't resolve. |
| Validation | Zod schema rejection on body shape. |

## Tests

Payday is exercised through end-to-end account write tests. A direct
service spec is a near-term TODO — the most valuable coverage would be
the over-allocation edge case at $0.001 boundary and the percentage→
amount derivation when the template is applied.

## Operations

- The current implementation does not run inside an interactive
  transaction. If a partial failure occurs after some accounts have
  been credited, the user can re-submit; the system errs on the side
  of "credit each account independently" because financial allocation
  is naturally idempotent at the user's level. If you ever observe
  drift in production, wrap the per-account update loop in
  `prisma.$transaction(async (tx) => { ... })` mirroring the EOD
  pattern.
- Templates have no migration path away from the JSON column. If we
  ever want to share templates across users (a coach-shared payday
  template, for example), that would justify a real table.
