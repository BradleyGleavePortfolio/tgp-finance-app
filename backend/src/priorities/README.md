# Priorities

The seven-step priority waterfall — the financial sequencing rule the
product is built around. Each step has a `check(profile, accounts)`
function that returns `{ complete, progress, target, current }`; the
service walks the list and returns the first incomplete step.

## Files

- `priorities.service.ts` — `PRIORITY_WATERFALL` (the seven entries),
  `getCurrentPriority`, `getAllPriorities`.
- `priorities.controller.ts` — `/api/priorities/current` and
  `/api/priorities/all`.
- `priorities.module.ts`.

## The waterfall

```
0  Build $1,000 Cash Buffer            (cash)
1  Pay Off High-APR Unsecured Debt     (debt, ≥ 10% APR, unsecured)
2  Build 3-Month Emergency Fund        (cash, max(3×expenses, $10k))
3  Maximize Tax-Advantaged Investing   (invest, 401k → IRA)
4  Build Taxable Brokerage             (invest, post-tax-advantaged)
5  Eliminate All Other Debt            (debt, secured / low-APR)
6  Wealth Acceleration                 (invest, surplus cash flow)
```

Order matters — the EOD post-commit logic uses index advancement to
fire the `priority_levelup` push notification, and the AI coach
context relays `current_priority_index` to the model so its advice
matches the user's stage.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/priorities/current` | The first incomplete priority (or the last one when everything's done). Includes `progress` (0..1) and `target`/`current` for the bar UI. |
| GET | `/api/priorities/all` | Every priority with its computed status, used by the "where am I in the journey" mobile screen. |

## Integration with EOD

`EODService.submitEOD` calls `prioritiesService.getCurrentPriority`
after the transaction commits. If the index increased (the user
*just* advanced), it persists the new index on `FinancialProfile`
and fires a `priority_levelup` push. That push is deduped by
`PushSender` against `data.priority_index`, so a retried EOD submit
can't double-notify.

## Security & tenancy

JWT-gated. Reads `request.user.id`. The `advance` admin endpoint
(`POST /api/priorities/advance` with `student_id`) is only used by
coach actions — controllers gate it with `RoleGuard + @Roles('coach')`
plus `OwnsStudentGuard` ownership checks (the same belt-and-braces
pattern used throughout `coach/`).

## Environment variables

None unique to this module.

## Failure modes

- A user with no `FinancialProfile` short-circuits to priority 0
  (cash buffer) — defensive default.
- A user past every priority returns the last entry with
  `progress = 1`. The mobile UI labels this "Wealth Acceleration"
  and switches to free-form chart mode.

## Tests

Priority waterfall behavior is exercised in `eod.service.spec.ts`
(level-up detection) and via fixtures in `coach.service.spec.ts`. A
direct service spec on each step's `check` predicate is a near-term
TODO — a value-table test would be cheap and high-signal.

## Operations

- Tweaking thresholds (e.g. raising the high-APR cutoff from 10% to
  9%) changes which step a given user is on without any data
  migration. Plan for the next-EOD push wave if you do this — it can
  fire level-up pushes for users whose state didn't actually change.
- Adding a new priority shifts every higher index. The `EOD` post-
  commit comparison (`computed.current_index > prevIndex`) keeps
  working, but `FinancialProfile.current_priority_index` values
  persisted under the old indexing scheme will be off by one. If you
  insert a step in the middle, write a migration that shifts
  `current_priority_index` for every row past the insertion.
