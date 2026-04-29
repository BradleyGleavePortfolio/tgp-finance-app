# EOD (End-of-Day)

The daily check-in that drives the entire app. One EOD submission per
user per calendar date. Writing it transactionally:

- updates each account's live `balance`,
- appends an `AccountBalanceLog` row per account (immutable history),
- creates the `EODSubmission` row with the four computed totals,
- recomputes the user's profile aggregates and streak,
- recomputes the wealth-velocity score using fresh-in-tx reads,

and then — outside the transaction — fires milestone unlock checks,
priority-level-up detection, and push notifications.

## Files

- `eod.controller.ts` — `/api/eod` POST + `/api/eod` GET (history) +
  `/api/eod/today` + `/api/eod/:id` PUT.
- `eod.service.ts` — `submitEOD`, `computeWealthVelocityScore`,
  history readers, edit-with-7-day-window.
- `eod.module.ts` — wires Milestones, Priorities, and PushSender as
  optional providers (so unit tests can omit them).

## Endpoints

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/api/eod` | `{ submission_date, account_snapshots[], notes?, mood?, habits_checked? }` | Submits today's EOD. Idempotent only via the unique constraint — duplicate dates return 409. |
| GET | `/api/eod?days=30` | — | Submissions in the trailing N days. |
| GET | `/api/eod/history?limit=10` | — | Last N submissions, capped at 50. |
| GET | `/api/eod/today` | — | Returns today's submission if it exists, otherwise null. |
| PUT | `/api/eod/:id` | Same shape as POST | Edits within the 7-day window only. Recomputes totals, rewrites the snapshot, but does **not** rewrite balance logs (history is append-only). |

## Submit transaction

Audit item H12: every write happens inside a single Prisma interactive
transaction. Specifically:

1. **Pre-flight** (outside the transaction): validate every
   `account_id` belongs to the calling user and is `is_active`. Bad
   payloads short-circuit before opening a connection.
2. **Begin Tx.**
3. **Inside Tx**:
   - Re-check the unique `(user_id, submission_date)` *inside the
     transaction* so two concurrent submits on the same date can't
     both pass the duplicate guard.
   - `eODSubmission.create` with the four computed totals.
   - For each snapshot: `financialAccount.update(balance)` +
     `accountBalanceLog.create`.
   - Upsert `financialProfile` with new aggregates and `last_eod_date`.
   - Compute `wealth_velocity_score` using `tx` (so the velocity reads
     see the just-written totals) and write it.
4. **Commit.**
5. **Post-commit enrichment** (each block guarded so a failure never
   rolls back the committed submission):
   - Run milestone checks (`checkAndUnlockMilestones`); fire a push
     per newly unlocked milestone via `PushSender`.
   - Compute the current priority; if the index increased, persist
     the new index and fire a `priority_levelup` push.
6. Return the submission + computed totals + streak + velocity +
   newly-unlocked milestones + current priority to the caller.

The post-commit enrichment is *deliberately* outside the tx — those
calls hit external services (PushSender talks to Expo) and we never
want a push failure to roll back the user's actual ledger row.

## Streak math

```
diffDays = round((today - last_eod_date) / 86_400_000)
- diffDays === 1 → streak += 1
- diffDays === 0 → unchanged (would already have hit the duplicate guard)
- otherwise      → streak resets to 1
```

UTC dates throughout — see "operations" for the timezone caveat.

## Wealth Velocity Score

`computeWealthVelocityScore` returns a 0-100 integer composed of:

- **Streak (30%)** — `streak / 30 * 30`, capped at 30.
- **Debt-payoff (25%)** — % of debt paid since the oldest EOD in the
  trailing 90 days. Zero-debt user gets a full 25.
- **Net-worth momentum (25%)** — % growth since the oldest EOD in the
  trailing 30 days. Negative growth scores 0.
- **Savings rate (20%)** — heuristic from monthly income (assumes 60%
  expense ratio).

Capped at 100 and rounded. Ties into milestones (`wealth_velocity_score`
high-water marks aren't a milestone today, but the score gates the
low-velocity coach alert at 20).

## Edit window

`updateEOD` only allows edits within 7 days of the original
submission date. Edits **do not** rewrite balance logs — those are
append-only. They do recompute the four totals and overwrite the
submission row's `account_snapshots`, `notes`, `mood`, and
`habits_checked`. Streak and velocity are not recomputed by `updateEOD`
(an edit doesn't move the calendar; the streak math doesn't change).

## Security & tenancy

- `userId` is taken from `request.user`. The submission body's
  account ids are validated against the user before any write. A coach
  cannot submit an EOD on a client's behalf via this endpoint —
  that's product policy (the daily check-in is the client's act).
- The post-commit milestone and priority pushes use
  `PushSender.send(userId, ...)`, which itself dedupes via
  `push_logs` on `milestone_key` and `priority_index`. A retried EOD
  submission can't double-notify.

## Environment variables

None unique to this module. Push hooks consult the same Expo + push
prefs that other modules use.

## Failure modes

| Code | When |
|------|------|
| `INVALID_ACCOUNTS` | Any `account_id` missing, inactive, or owned by another user. |
| `EOD_DUPLICATE` | Either the in-tx `findUnique` saw an existing row, or the create raced and hit the unique index (caught by the surrounding `try/catch` on `P2002`). |
| `EDIT_WINDOW_EXPIRED` | Edit attempted >7 days after the submission date. |
| `NOT_FOUND` | Edit targeted an id that doesn't exist or doesn't belong to the user. |

If milestone/priority/push enrichment throws, the failure is logged at
`warn` and the response degrades to the base submission payload (no
`newly_unlocked_milestones`, no `current_priority`). The committed
submission is unaffected.

## Tests

`backend/test/eod.service.spec.ts` covers:

- happy-path submit + totals derivation,
- duplicate-date guard (both branches: pre-check and `P2002` race),
- streak increments / resets,
- velocity score weights against fixture data,
- edit-window expiration,
- milestone + priority post-commit best-effort behavior.

## Operations

- **Timezone of "today"**. The submission's `submission_date` is the
  client-provided date. The duplicate guard is calendar-day exact.
  Users near midnight UTC can have a "yesterday" submission depending
  on their local timezone vs the date they pass. Notification
  reminders use `NotificationPreferences.timezone` to choose a
  reminder time, but the EOD record itself is keyed on the date the
  client sends.
- **Velocity score migration.** Score is stored on
  `financial_profiles.wealth_velocity_score`. Adding a new factor or
  changing weights changes existing scores on the next EOD; if you
  change the formula, document it in the changelog so coaches don't
  see a phantom drop in their alerts.
- **Backfilling streaks** is currently manual — there's no
  `recompute-streaks` script. The streak is only ever advanced by a
  fresh submission.
- **Edit semantics.** Because edits don't rewrite balance logs, an edit
  on a day with a typo can leave the account log row out of step with
  the corrected `account_snapshots`. We accept this — the log is a
  "what was reported when" audit, not a derivable view.
