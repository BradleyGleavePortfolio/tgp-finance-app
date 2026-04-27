# Milestones

Twenty-two unlockable milestones across five categories (cash, debt,
net worth, streak, income). Unlocks are stored in `MilestoneUnlock`
(unique on `(user_id, milestone_key)`) so re-checking is idempotent.

## Files

- `milestones.service.ts` — the `MILESTONES` definition list, the
  unlock check loop, and helpers used by EOD and the public reads.
- `milestones.controller.ts` — `/api/milestones` GET, `POST /check`,
  `POST /:key/celebrate`.
- `milestones.module.ts`.

## Categories

```
CASH:        $1k → $5k → $10k → $20k
DEBT:        first_debt_paid → debt_half → debt_zero
NET WORTH:   nw_positive → $1k → $5k → $10k → $25k → $50k → $100k → $250k → $500k → $1m
STREAK:      streak_7 → streak_30 → streak_90 → streak_365
INCOME:      income_100k → income_200k
```

The `check` function for each milestone is a pure predicate over
`(profile, accounts, onboardDebt)`. `onboardDebt` is the user's
total debt at onboarding — used by `debt_half` so that a user who
joined already debt-free doesn't accidentally unlock the milestone
the moment they sign up.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/milestones` | Every milestone with `unlocked_at` (or null), `celebrated`, and the underlying definition. |
| POST | `/api/milestones/check` | Force a recheck. Idempotent. Returns the keys that just unlocked. |
| POST | `/api/milestones/:key/celebrate` | Marks the unlock as `celebrated = true` so the mobile app stops re-firing the celebration animation. |

## Integration with EOD

`EODService.submitEOD` runs `checkAndUnlockMilestones(userId)` after
the transaction commits. New unlocks trigger:

1. A row in `milestone_unlocks` (idempotent via the unique index).
2. A `net_worth_milestone` push via `PushSender`. Push dedupe is keyed
   on `data.milestone_key`, so even a retried EOD submit can't
   double-notify.

The unlock check is wrapped in a try/catch — milestone failures
**must not** roll back the EOD submission. The user's daily ledger
is the source of truth; pushes degrade.

## Security & tenancy

JWT-gated. All checks operate on `request.user.id`. The unlock list
is per-user; there is no cross-user view in this module (coach views
of student milestones come through `coach.service.ts`).

## Environment variables

None unique to this module.

## Failure modes

- A milestone unlock that fails to write returns the partial set of
  successfully unlocked keys; the next `check` call will retry the
  failing rows.
- A celebrate call on a non-existent unlock 404s — the mobile UI
  guards against this by only offering "Celebrate" on rows whose
  `unlocked_at` is non-null.

## Tests

Indirectly exercised via `eod.service.spec.ts` (the post-commit
unlock list is asserted there). A direct
`milestones.service.spec.ts` would be cheap and is a near-term TODO
— a value-table test against the 22 `check` predicates with fixture
profiles.

## Operations

- Adding a milestone: append to the `MILESTONES` array. The
  `(user_id, milestone_key)` unique constraint means the next
  `check` for an existing user will unlock it on the spot, which
  also fires the push. If you want to backfill silently, set
  `celebrated: true` in the unlock row inline so the mobile UI
  doesn't trigger a celebration animation.
- Renaming a milestone key requires a migration on the `milestone_unlocks`
  rows — `milestone_key` is the persisted string. Avoid renames; add
  a new key and let the old one sit dormant.
