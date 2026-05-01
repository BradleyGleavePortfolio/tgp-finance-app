# Challenges — savings, spending streaks, debt-payoff sprints

> **Closest existing module:** `backend/src/coach/` (program templates),
> `backend/src/eod/` (the daily artefact that drives challenge progress),
> `backend/src/milestones/` (the achievement model challenges intentionally
> do **not** copy).

## 1. Why

Coaches today have one structured tool for behaviour change: a
**program template** (`ProgramTemplate` in `schema.prisma`). It is a
`Json` blob of phases applied once to a student via
`POST /api/coach/templates/:id/apply/:student_id`. Once applied, there
is no progress surface, no expiration, and no feedback loop.

Coaches actually run **challenges**: short, narrowly-scoped behaviour
prompts with a clear start, end, and observable progress. The three
modes coaches ask for repeatedly:

- **Savings challenge** — "save $X over N weeks", or "raise your
  savings rate by Y points by month-end".
- **Spending streak** — "log N consecutive no-spend Sundays", "stay
  under your category budget for 21 days".
- **Debt-payoff sprint** — "pay $X over the minimum on debt account
  Y by date Z".

Today, coaches send these as messages and ask the client to reply
with progress. We lose the artefact and the audit trail. The
challenge surface fixes that.

## 2. When

A challenge has the lifecycle defined in `00-overview.md` §5
(drafted → published → assigned → archived → removed). The two
challenge-specific timing rules:

- **Active window.** A challenge has an explicit `starts_at` and
  `ends_at`. Outside that window the progress surface is read-only
  and no events are accepted.
- **Daily check-in cadence.** Progress events are bound to the
  client's daily EOD submission. A challenge does **not** ping the
  user for a per-challenge log; it derives progress from EOD data
  the user already submits. This is intentional — the doctrine
  forbids the gamified "log your win" prompt that creates anxiety.

When the client sees what:

- **On assignment** — the challenge appears in the student's
  `mobile/app/challenges/` index. Push notification is gated by the
  user's `NotificationPreferences.coach_messages` flag (default on).
- **Daily** — the EOD submission silently updates challenge progress
  if the EOD payload has the relevant data.
- **On completion** — a milestone-style unlock surfaces in the
  challenge detail. Doctrine: no confetti, no celebratory chrome
  (mirrors `mobile/DESIGN.md` §6 on milestones).
- **On expiry** — the challenge moves to "ended". A coach note is
  auto-written summarising the outcome.

## 3. Where

- **Backend module:** new `backend/src/challenges/`. Follows the
  existing module shape (controller + service + module + README).
- **Schema:** new tables (§5) added in one migration. No changes to
  existing tables.
- **Mobile routes:**
  - `mobile/app/challenges/index.tsx` — student list.
  - `mobile/app/challenges/[id].tsx` — student detail + progress.
  - `mobile/app/coach/challenges/index.tsx` — coach: own challenges.
  - `mobile/app/coach/challenges/[id].tsx` — coach: detail + roster
    progress.
  - `mobile/app/coach/challenges/new.tsx` — coach: authoring.

## 4. Who

- **Author / publish / archive:** coach (or owner).
- **Assign:** coach (or owner). A coach can assign only to clients
  on their own roster. Owner can assign cross-tenant.
- **See own progress:** the assigned client.
- **See client progress:** the assigning coach. Cross-coach reads
  are forbidden; owner has explicit bypass.
- **L1 clients:** challenges are an L2/L3 capability. L1 sees no
  challenges UI. The route returns `403 NOT_ENTITLED`.

## 5. What — data model

### 5.1 Schema sketch

```prisma
enum ChallengeKind {
  savings_target          // "raise total cash by $X by date Y"
  savings_rate            // "raise savings_rate by Y points by date Z"
  no_spend_streak         // "N consecutive no-spend days on category C"
  category_under_budget   // "stay under $X in category C for N days"
  debt_payoff_sprint      // "pay $X over minimum on debt account A by date Y"
}

enum ChallengeState {
  draft
  published
  archived
  removed
}

enum ChallengeAssignmentState {
  pending
  active
  complete
  abandoned
  rescinded
}

model Challenge {
  id              String          @id @default(uuid())
  coach_id        String
  coach           User            @relation(fields: [coach_id], references: [id])
  kind            ChallengeKind
  title           String
  description     String          // markdown, sanitized server-side
  // Behavioural prompt only — no product recommendation. URLs are
  // allowlisted at write time (see 09-compliance.md §How).
  duration_days   Int             // canonical length; per-assignment overrides allowed
  // The metric envelope. Schema is kind-specific; validated by the
  // Zod variant matching `kind`.
  metric          Json
  state           ChallengeState  @default(draft)
  published_at    DateTime?
  archived_at     DateTime?
  removed_at      DateTime?
  created_at      DateTime        @default(now())
  updated_at      DateTime        @updatedAt
  assignments     ChallengeAssignment[]

  @@index([coach_id, state])
  @@map("challenges")
}

model ChallengeAssignment {
  id              String                  @id @default(uuid())
  challenge_id    String
  challenge       Challenge               @relation(fields: [challenge_id], references: [id])
  student_id      String
  student         User                    @relation(fields: [student_id], references: [id])
  starts_at       DateTime
  ends_at         DateTime
  state           ChallengeAssignmentState @default(pending)
  // Computed daily by the EOD pipeline. Score in [0, 100].
  // Money never appears here.
  current_score   Int                     @default(0)
  // The single audit string written when state changes. Append-only.
  state_history   Json                    @default("[]")
  // Visibility opt-in for leaderboards. See 02-leaderboards.md.
  leaderboard_optin Boolean               @default(false)
  created_at      DateTime                @default(now())
  updated_at      DateTime                @updatedAt
  events          ChallengeEvent[]

  @@unique([challenge_id, student_id])
  @@index([student_id, state])
  @@map("challenge_assignments")
}

model ChallengeEvent {
  id            String              @id @default(uuid())
  assignment_id String
  assignment    ChallengeAssignment @relation(fields: [assignment_id], references: [id], onDelete: Cascade)
  // Derived from EOD; we never accept a "manual log" event from the
  // client. The source field documents which derivation path wrote it.
  source        String              // 'eod_pipeline', 'coach_override', 'system'
  // The score delta, [-100, 100]. The sum (clamped to [0,100]) is
  // ChallengeAssignment.current_score.
  delta         Int
  note          String?
  created_at    DateTime            @default(now())

  @@index([assignment_id, created_at])
  @@map("challenge_events")
}
```

### 5.2 The `metric` envelope per kind

```ts
// Zod, in src/challenges/dto.ts (implementation PR)
const SavingsTargetMetric = z.object({
  delta_dollars: MoneyAmountPositive(),
});

const SavingsRateMetric = z.object({
  delta_points: z.number().min(0.5).max(50),
});

const NoSpendStreakMetric = z.object({
  streak_days: z.number().int().min(3).max(60),
  category: z.enum([...spendingCategories]),
});

const CategoryUnderBudgetMetric = z.object({
  category: z.enum([...spendingCategories]),
  budget_dollars: MoneyAmountPositive(),
  duration_days: z.number().int().min(7).max(45),
});

const DebtPayoffSprintMetric = z.object({
  account_id: z.string().uuid(),
  delta_over_minimum_dollars: MoneyAmountPositive(),
});

export const ChallengeMetric = z.discriminatedUnion('kind', [
  SavingsTargetMetric.extend({ kind: z.literal('savings_target') }),
  SavingsRateMetric.extend({ kind: z.literal('savings_rate') }),
  NoSpendStreakMetric.extend({ kind: z.literal('no_spend_streak') }),
  CategoryUnderBudgetMetric.extend({ kind: z.literal('category_under_budget') }),
  DebtPayoffSprintMetric.extend({ kind: z.literal('debt_payoff_sprint') }),
]);
```

The discriminated union is the **only** writable shape; an attacker
who sends `metric: { delta_dollars: '1', whatever: 'extra' }` gets
the request rejected at the boundary by the strict Zod variant.

### 5.3 Endpoint table

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/coach/challenges` | coach + L?  | Create draft. Body validated by `CreateChallengeSchema`. |
| PATCH | `/api/coach/challenges/:id` | coach (owns) | Edit draft / publish / archive. |
| DELETE | `/api/coach/challenges/:id` | coach (owns) | Soft-delete (sets `state=archived`). Hard-delete is owner-only. |
| GET | `/api/coach/challenges` | coach | Coach's own list. Owner sees all. |
| POST | `/api/coach/challenges/:id/assign` | coach (owns) | `{ student_id, starts_at, ends_at?, leaderboard_optin? }`. |
| POST | `/api/coach/challenges/assignments/:id/rescind` | coach (owns) | State → `rescinded`. Writes a coach note. |
| GET | `/api/challenges` | student (L2/L3) | Caller's active + recent assignments. |
| GET | `/api/challenges/:id` | student (L2/L3) | Single assignment detail with derived progress. |
| POST | `/api/challenges/assignments/:id/leaderboard-optin` | student | Opt in / out of leaderboard for this assignment only. |

`POST /api/coach/challenges/:id/assign` is **not** idempotent on
`(challenge_id, student_id)` — the unique index will reject a
duplicate. Coaches re-running a challenge for the same client must
clone (server-side; we don't expose a clone endpoint, the coach
authors a new challenge).

### 5.4 The progress derivation

The EOD pipeline (`backend/src/eod/`) is extended with one hook that
runs after the existing `computeAndUpdateTotals`:

```ts
// EODService.submit, after totals recompute, inside the same tx
await this.challengesService.deriveProgressForUser(prisma, userId, eodPayload);
```

`deriveProgressForUser`:

1. Loads all `active` `ChallengeAssignment` rows for the user.
2. For each, computes the kind-specific delta from the EOD payload
   (e.g. `savings_target` reads the delta in `total_cash` since
   assignment start; `no_spend_streak` reads the EOD's
   `category_spent` map for category `C`).
3. Writes a `ChallengeEvent` with the delta and a `source =
   'eod_pipeline'`.
4. Updates `current_score` (clamped to `[0, 100]`).
5. If `current_score === 100` and `state === 'active'`, transitions
   the assignment to `complete`, appends `state_history`, and
   schedules a push (gated by `coach_messages` pref).

Critically: this lives **inside** the EOD transaction. If the EOD
write rolls back, the challenge progress rolls back with it.

### 5.5 What the UI renders (mobile)

Doctrine references `mobile/DESIGN.md` §1, §2, §5, §6.

- The challenge index screen is a list of cards with the
  challenge title, the days remaining, and a hairline progress bar
  (no percentage in oxblood, no glow). The progress bar is a single
  thin line; doctrine forbids the "ring" / "trophy" chrome that
  the fitness app uses.
- The detail screen has the challenge description (markdown,
  sanitized — see §7 abuse vectors), the active-window dates, the
  current score, and a list of the last 14 progress events with
  their date and delta.
- A "leaderboard opt-in" toggle is only visible if the coach's
  challenge has `leaderboard_optin` enabled (challenge-level), and
  even then it is off by default per assignment.
- There is **no** "log my progress" button. Progress is derived,
  not logged.

## 6. How — the implementation pattern

### 6.1 Authorization

- Every mutation under `/api/coach/challenges/*` is guarded by
  `JwtAuthGuard + RoleGuard('coach') + OwnsChallengeGuard`. The new
  guard mirrors `OwnsStudentGuard` and rejects with the same generic
  `NOT_FOUND` shape on cross-coach attempts.
- Service-layer guard `assertCoachOwnsChallenge(coachId,
  challengeId)` is called before every mutating Prisma operation.
- Student reads under `/api/challenges/*` are guarded by
  `JwtAuthGuard + EntitlementGuard('challenges')` (see
  `08-entitlements.md` §6.1 for the helper).

### 6.2 Tenancy

- A coach can read only their own challenges; the index endpoint
  is `where: { coach_id: user.id }`.
- A student can read only their own assignments; the index is
  `where: { student_id: user.id }`.
- Owner bypass branches in the service layer (`if (role === 'owner')
  ...`), explicit, per `backend/docs/TENANCY.md` §1.

### 6.3 Idempotency, transactions, retries

- The EOD-side hook (§5.4) runs inside the EOD transaction and is
  idempotent: rerunning the EOD for the same date overwrites the
  events for that date, not appends.
- Assignment state transitions are guarded by an optimistic version
  field on `ChallengeAssignment` (`updated_at` as the `where`
  clause; on conflict retry once, then surface `STATE_CONFLICT` to
  the client).
- Assignment creation is wrapped in a Prisma transaction with the
  unique-index constraint catching duplicates.

### 6.4 Doctrine pin tests

- `test/challenges-doctrine.spec.ts`:
  - The mobile-payload DTO contains no `Decimal` fields except in
    explicit per-account-balance sub-objects that the *student*
    requests (their own debt account; never on a leaderboard
    surface).
  - Auto-generated coach notes on rescind / completion contain no
    audience framing, no emoji (regex from
    `ai-prompt-doctrine.spec.ts`).
- `test/challenges.service.spec.ts`:
  - `assertCoachOwnsChallenge` rejects cross-tenant.
  - EOD-side hook is idempotent on rerun for the same date.
  - State machine transitions: `pending → active` (on `starts_at`),
    `active → complete` (score=100), `active → abandoned` (no
    progress for `duration_days * 1.5`), `* → rescinded` (coach
    action).

## 7. Privacy & security

- **No money on the wire** outside the student's own per-account
  surfaces. The challenge detail returns `current_score` (an int),
  not "you saved $342 of $500".
  - The existing detail screen for a debt-payoff sprint does
    surface the *target* dollar amount the coach set (this is
    coach-authored copy and unavoidable), but **never** the
    client's actual current balance progress in dollars. The score
    tells you "you are 60% of the way" — that's it.
- **The leaderboard opt-in is per-assignment, not per-user.** A
  client opts in for one challenge and is invisible on every
  other.
- **Coach reads of progress** include `current_score`,
  `state_history`, and `events` (last 14). They do **not** include
  the underlying EOD payload that produced them; that already
  lives behind `coach.service.ts` and is not duplicated here.

## 8. Abuse & moderation

Concrete vectors and the planned mitigation:

1. **Coach embeds a financial-product link in the challenge
   description.** "Open this Robinhood account by Friday."
   **Mitigation:** the `description` field is markdown, sanitized
   server-side, and links are matched against an allowlist
   (educational domains only — see `09-compliance.md` §How — URL
   allowlist). Non-allowlisted URLs are stripped at write time;
   the coach gets a non-blocking warning ("link removed; financial
   product domains are not permitted").
2. **Coach assigns a self-harming challenge.** "Skip rent for the
   month to pay debt." This is a coaching-quality issue, not a
   technical one. **Mitigation:** every published challenge surfaces
   the standard disclaimer (`README.md` § Disclaimer) on the
   client's detail screen, server-rendered so the coach cannot
   suppress it. Reports route to the owner queue
   (`10-rollout-and-ops.md` § Moderation).
3. **Client opts into a leaderboard, then a peer reverse-engineers
   their balance from rank delta.** **Mitigation:** the score
   metric is privacy-budgeted (see `02-leaderboards.md` § Privacy
   budget). Score is bucketed; raw deltas don't leak.
4. **Coach uses challenge title to harass.** ("Stop being broke,
   challenge: you can do better.") **Mitigation:** title is short
   (≤80 chars), passes through the same shared markdown sanitizer
   as `description`, and is reportable from the client detail
   screen. The doctrine pin test (§6.4) covers no-audience-framing
   on auto-generated copy; on coach-authored copy, the moderation
   queue is the answer.

## 9. Feature flags

- Global: `FEATURE_CHALLENGES_ENABLED`. When false, every
  `/api/coach/challenges/*` and `/api/challenges/*` endpoint
  returns `404 NOT_FOUND`. The mobile route hides itself
  client-side based on the `system/release-info` capability flag
  (which is wired off the same env var).
- Per-coach: `coach_profiles.feature_flags.challenges_enabled`.
  When true, the coach can author and assign even when the global
  flag is off (founders' rollout).
- Kill-switch: flip the global flag off; in-flight assignments
  remain readable to clients but no new progress events are
  derived.

## 10. Analytics

- `challenges.created` — `{ coach_id, kind }`.
- `challenges.published` — `{ coach_id, challenge_id, kind }`.
- `challenges.assigned` — `{ coach_id, student_id, challenge_id }`.
- `challenges.progress_event` — `{ assignment_id, source, delta }`
  emitted from the EOD hook.
- `challenges.completed` — `{ assignment_id, days_to_complete }`.
- `challenges.abandoned` — `{ assignment_id, days_inactive }`.

The "healthy" signal is `(completed + active) / assigned > 0.6`
within a 30-day window. Below that, the coach surface tab in the
admin dashboard flags the coach.

## 11. Rollout

Phased on top of the entitlement rollout (§08 §11):

1. **Founders only.** Owner enables `FEATURE_CHALLENGES_ENABLED`
   globally, sets `challenges_enabled=true` on the founding-cohort
   coaches' `feature_flags`, validates one challenge end-to-end
   with one founding client.
2. **Validating coaches** — invite five coaches who have explicitly
   asked for the surface. Targeted feedback.
3. **GA** — flip on for every L2-tier client whose coach has
   `coach_premium` *or* `coach + challenges_enabled`.

Rollback: flip the global flag off. Existing data is retained;
re-enabling the flag re-activates the surface unchanged.

## 12. Tests

Required before the implementation PR ships:

- `test/challenges.service.spec.ts` — state machine, EOD hook
  idempotency, tenancy.
- `test/challenges.controller.spec.ts` — auth + Zod boundary.
- `test/challenges-doctrine.spec.ts` — no money on the wire,
  no audience framing in auto-generated copy.
- `test/challenges-eod-hook.spec.ts` — round-trip from EOD payload
  to `current_score` for each kind.
- `test/admin-federation.service.spec.ts` (extend) — federation
  surface includes a per-coach `active_challenges_count`.

## 13. Risks

1. **Derived-progress drift.** EOD payloads change shape over
   time; a future field rename silently zeros challenge progress.
   **Response:** the EOD payload is Zod-validated upstream; the
   challenge service reads it via a versioned adaptor that fails
   loudly on shape drift instead of returning zero.
2. **Leaderboard opt-in by inattention.** Clients accept defaults;
   the default must stay off. **Response:** the toggle is off by
   default at every level (challenge-level, assignment-level), and
   a doctrine pin test asserts it.
3. **Coaches gaming the metric.** A coach authors a trivial
   challenge to inflate their completion-rate dashboard.
   **Response:** the analytics rollup uses *median completion time
   per coach*, not raw count, and surfaces a "challenge difficulty"
   z-score across the whole coach population on the owner
   dashboard.

## 14. Dependencies

- `08-entitlements.md` — L2/L3 gating + `EntitlementGuard`.
- `06-assignments.md` — the shared assignment lifecycle (folded
  into this module's `ChallengeAssignment`).
- `02-leaderboards.md` — the opt-in surface.
- `09-compliance.md` — URL allowlist, disclaimer rendering.
- `eod` module — adds the post-tx hook.

## 15. Acceptance criteria

- [ ] Schema migration adds the three tables with the indexes
      called out.
- [ ] All five challenge kinds round-trip end-to-end (author →
      assign → EOD → progress → complete) in a smoke test.
- [ ] No money-bearing field appears in any DTO returned by
      `/api/challenges/*` or `/api/coach/challenges/*` except the
      coach-authored target dollar amount.
- [ ] Both feature flags exist and the off-state is verified.
- [ ] The standard disclaimer renders verbatim on every published
      challenge detail screen.
- [ ] The federation surface exposes
      `active_challenges_count` per coach.
- [ ] `mobile/DESIGN.md` review: no oxblood progress ring, no
      emoji, no audience framing in coach-authored copy
      placeholders.

## 16. Operator handoff

When the implementation PR ships:

1. Apply the migration. Migration is non-destructive (new tables
   only).
2. `flyctl secrets set FEATURE_CHALLENGES_ENABLED=false -a
   tgp-finance-api` (deploy dark for one cycle; verify the
   off-state).
3. For each founding coach: `UPDATE coach_profiles SET
   feature_flags = feature_flags || '{"challenges_enabled":true}'
   WHERE user_id = '<id>';`.
4. Validate end-to-end with one founding client.
5. `flyctl secrets set FEATURE_CHALLENGES_ENABLED=true -a
   tgp-finance-api` for GA.
6. Add the `challenges.completed` funnel to the existing PostHog
   board.
7. The moderation queue is the existing concierge inbox
   (`SUPPORT_CONTACT_EMAIL`); reports surface there until a
   dedicated owner moderation surface ships.
