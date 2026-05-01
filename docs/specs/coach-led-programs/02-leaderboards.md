# Leaderboards — coach-scoped, opt-in, balance-redacted

> **Closest existing module:** `backend/src/community/` (the existing
> anonymized contribution-loops feed; useful as a reference for the
> "no balances on the wire" pattern, though leaderboards are a different
> shape — coach-scoped, ranked, and opt-in).

## 1. Why

Coaches with a roster larger than ~10 clients ask the same question:
"who is doing the work?" Today the answer is the alerts surface
(`/api/coach/alerts`) and the weekly digest. Both flag *negative*
signals (missed check-in, low velocity) but offer nothing to surface
the *positive* tail. A coach who only ever sees red flags burns out;
a coach who can see "these three clients have the strongest
no-spend-streak score this week" can write a single warm message and
buy a quarter of compounded behaviour change.

We deliberately do **not** ship a public, app-wide leaderboard. The
fitness app does (cohort-wide ranking by workouts/week). Finance does
not, for the reasons in `00-overview.md` §1 and §10.

The leaderboard surface is therefore:

- **Coach-scoped.** A coach sees only their own roster. Clients see
  only their own leaderboards (the ones they have opted into).
- **Opt-in per assignment.** Membership is per-challenge-assignment,
  not per-user.
- **Balance-redacted.** Money never appears in the ranked row.
- **Score-bucketed.** Raw scores are bucketed before display so
  rank deltas don't reverse-engineer balances.

## 2. When

A leaderboard exists for the duration of the challenge it is
attached to (§5). It is computed lazily on read — there is no
materialised "leaderboard" row. Specifically:

- **Created** implicitly when a coach publishes a challenge with
  `leaderboard_optin = true` (challenge-level toggle).
- **Populated** as clients opt in per assignment.
- **Read** by the coach (always) and by clients who have opted in
  (each sees the same coach-scoped board).
- **Ended** at challenge `ends_at`. The board is read-only after.
- **Removed** when the challenge is archived (no separate row to
  delete; the board is a query, not a table).

When the client sees what:

- Before opting in: nothing. The leaderboard route returns `403
  NOT_OPTED_IN` for clients who have not opted into any assignment
  on a board.
- After opting in: their rank, their bucket, the bucket above and
  below them, and the *count* of participants. Never the full
  ordered list with names.

When the coach sees what:

- The full ordered list of *opted-in* participants on the board,
  with first name + last initial (matching the existing community
  feed's anonymisation in `community.service.ts`'s `anonymiseName`).
- Non-opted-in participants are not on the board, period; the
  coach reads non-opted-in progress through the existing
  `/api/coach/clients/:id/summary` endpoint.

## 3. Where

- **Backend module:** new `backend/src/leaderboards/`. Pure read
  surface; the writeable inputs are the existing
  `ChallengeAssignment.current_score` and the per-assignment
  `leaderboard_optin` flag.
- **Schema:** **no** new tables. The board is a query against
  `ChallengeAssignment` rows joined to `User` and `CoachProfile`.
- **Mobile routes:**
  - `mobile/app/leaderboard.tsx` — the client's own opt-in
    leaderboards (one screen, sectioned per challenge).
  - `mobile/app/coach/leaderboard.tsx` — coach view, sectioned per
    challenge.

## 4. Who

- **Read (coach):** challenges they own, every opted-in
  participant.
- **Read (client):** challenges they have opted into, with their
  own bucket plus neighbours.
- **Read (owner):** every challenge across every coach. Owner's
  surface is the existing admin console (federation read path),
  not a separate UI in this app.
- **Write:** there is no direct write surface. The opt-in toggle
  lives on `ChallengeAssignment`. The coach's "challenge-level
  leaderboard enabled" toggle lives on `Challenge`.

## 5. What — data and API

### 5.1 No new schema

We add only two columns, both already specified in
`01-challenges.md` §5.1:

- `Challenge.leaderboard_enabled` (boolean, default false) — the
  coach's toggle when authoring a challenge.
- `ChallengeAssignment.leaderboard_optin` (boolean, default false)
  — the client's per-assignment toggle.

A leaderboard row is computed:

```sql
SELECT
  ca.student_id,
  bucket_score(ca.current_score) AS bucket,
  -- score is the rank metric; ties broken by created_at ASC
  ca.current_score AS raw_score,
  ca.starts_at,
  ca.ends_at
FROM challenge_assignments ca
WHERE ca.challenge_id = $1
  AND ca.leaderboard_optin = TRUE
  AND ca.state IN ('active', 'complete')
ORDER BY ca.current_score DESC, ca.created_at ASC;
```

`bucket_score` is a deterministic SQL function (or, more likely, a
TypeScript helper applied in the service) that maps a raw score
to one of seven named buckets:

```ts
// src/leaderboards/buckets.ts (implementation PR)
export function bucketScore(raw: number): Bucket {
  if (raw >= 95) return 'leading';
  if (raw >= 80) return 'strong';
  if (raw >= 60) return 'building';
  if (raw >= 40) return 'engaged';
  if (raw >= 20) return 'starting';
  if (raw > 0)  return 'early';
  return 'pending';
}
```

The seven names are intentional — they map onto the existing seven
priority-waterfall levels and the seven Wealth Velocity Score
levels (`README.md` § "What is in the app"). The doctrine forbids
any of: gold-medal / silver-medal / bronze-medal chrome, percentage
displays in oxblood, and per-rank confetti. The bucket is the only
shape we render.

### 5.2 Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/leaderboards/challenges/:challenge_id` | coach (owns) | Full ordered list, first-name + last-initial, bucket + raw score. |
| GET | `/api/leaderboards/me/:assignment_id` | student (opted in) | Caller's bucket, neighbour buckets, count. |
| GET | `/api/coach/leaderboards` | coach | Coach's index of active leaderboards. |
| GET | `/api/leaderboards/me` | student | Caller's index — assignments opted into. |

There is **no** `POST` / `PUT` / `DELETE` on this surface. Opt-in
state lives on `ChallengeAssignment` (§01).

### 5.3 The DTO shape — locked down

```ts
// src/leaderboards/dto.ts (implementation PR)
export const LeaderboardEntrySchema = z.object({
  display_name: z.string(),         // "Alex T."
  bucket: z.enum(['leading','strong','building','engaged','starting','early','pending']),
  // raw_score is INT, [0, 100]. NOT a Decimal. NOT a string. NOT a money type.
  raw_score: z.number().int().min(0).max(100),
  // No money fields. If you add one, the doctrine pin test fails.
}).strict();

export const LeaderboardSchema = z.object({
  challenge: z.object({
    id: z.string().uuid(),
    title: z.string(),
    kind: ChallengeKindEnum,
    ends_at: z.string().datetime(),
  }),
  entries: z.array(LeaderboardEntrySchema),
  total_optin_count: z.number().int().min(0),
}).strict();
```

The `.strict()` on every object rejects extra keys at parse time —
a future field add is impossible without an explicit schema change.

### 5.4 Privacy budget

The bucket scheme alone does not prevent reverse-engineering. A
coach's roster of 8 clients with one client in the `leading` bucket
makes the leading client identifiable from the rank list (which
the *coach* sees in full). For the *client-facing* surface (`GET
/api/leaderboards/me/...`):

- Buckets containing **fewer than 5 participants** are merged with
  the bucket below (or above, if at the bottom) so neighbour rows
  never expose a singleton bucket.
- The neighbour view shows **exactly one bucket above, one bucket
  below**, and the count in each — never an ordered list of names.
- The client's own first-name + last-initial *is* shown in their
  own row (so they recognise themselves) but no other client's
  identifier is ever returned to a non-coach caller.

For the *coach-facing* surface, the coach sees the full ordered
list — by design. The privacy boundary for the coach is the
challenge's `leaderboard_optin` flag at the assignment level: a
coach cannot see a non-opted-in client on the board, period.

### 5.5 The mobile UX

- **Index screen.** A list of active leaderboards. For each, the
  challenge title, the days remaining, the participant count
  (rounded down to the nearest 5), and a single hairline divider.
  No bar chart, no podium graphic, no avatar montage. The list
  composes inside the existing `Card` primitive in
  `mobile/src/theme/`.
- **Detail (coach).** The seven bucket bands as horizontal rows;
  inside each band, the opted-in clients listed with first-name +
  last-initial and the integer raw score. No portrait avatars on
  the row (avatars are §03; even with avatars shipped, the
  leaderboard row uses initials only — see §03 for the rationale).
- **Detail (client).** A vertical strip of three bands: "above
  you", "you", "below you". The client's row shows their name and
  raw score; the neighbour rows show only the bucket name and a
  count.

## 6. How — the implementation pattern

### 6.1 Authorization

- `GET /api/leaderboards/challenges/:challenge_id` requires the
  caller to be the coach who owns the challenge or the owner.
  Other coaches and clients on other rosters get `404 NOT_FOUND`.
- `GET /api/leaderboards/me/:assignment_id` requires the caller
  to be the student of the assignment AND the assignment to have
  `leaderboard_optin = true`. Otherwise `403 NOT_OPTED_IN`.

### 6.2 Computation cost

The query is bounded by roster size (≤ 100 for `coach_premium`,
≤ 25 for `coach`). We do not cache; the read latency is dominated
by the join, not the bucket math. If the cohort grows to where
caching matters, the cache key is `(challenge_id,
last_eod_date_max_in_roster)` — invalidate on EOD submission for
any opted-in client.

### 6.3 Doctrine pin test

`test/leaderboards-doctrine.spec.ts`:

- The DTO returned by every leaderboard endpoint has no `Decimal`
  field, no key matching `/balance|cash|debt|net_worth|dollar/i`.
- Bucket merging produces no bucket of size 1–4 in the
  client-facing payload.
- Coach-facing payload preserves the raw bucket order.
- A new field added to `LeaderboardEntrySchema` without
  amending this test is an automatic regression (the test reads
  the schema's keys and matches against an explicit allowlist).

## 7. Privacy & security

- **No balances, ever.** Pinned by §5.3 + §6.3.
- **Coach scope.** Pinned by `assertCoachOwnsChallenge` in §01.
- **Singleton bucket protection.** §5.4.
- **Anonymisation reuse.** First-name + last-initial uses the same
  helper as `community.service.ts` so a future change to the rule
  applies in both places.
- **No leaking opt-in state.** A non-opted-in client's existence
  on a coach's roster is not revealed by the leaderboard endpoint.
  The total count is rounded for the client view (§5.5); the
  coach view returns the exact count, but the coach already has
  the roster.

## 8. Abuse & moderation

1. **Reverse-engineering balances from rank.** Bucketing + privacy
   budget (§5.4). Pinned by test.
2. **Doxx by display name.** Coach can rename a client in the
   coach UI (?). **No** — the `display_name` is derived from the
   user's `name` column. We do not let the coach rename the client.
   If a client wants to appear on the leaderboard under a chosen
   handle, that's a profile-name change in the user settings, not
   a per-leaderboard override.
3. **Coach harassment by ranking.** "Look how badly you're doing
   compared to others." **Mitigation:** the client opt-in is
   *per assignment*. A client who has opted out is invisible to
   the board; a client who has opted in can opt out at any time
   from the assignment detail screen. The opt-out is immediate
   (no "you'll be removed in 24 hours" delay).
4. **Coach inflates their roster engagement metric.** Coach
   creates a synthetic client account, opts it into every
   leaderboard. **Mitigation:** the owner moderation queue
   includes a "synthetic client" detection signal — a client
   account that has had no EOD submissions but is on every
   leaderboard. This is a soft signal, surfaced for review.

## 9. Feature flags

- Global: piggybacks on `FEATURE_CHALLENGES_ENABLED`. There is no
  challenges-without-leaderboards or leaderboards-without-challenges
  state — the two ship together.
- Per-coach: `coach_profiles.feature_flags.leaderboards_enabled`.
  Default `false` even when challenges are enabled. A coach
  explicitly opts in. Reasoning: a coach who is uncomfortable with
  the social-comparison doctrine (some are) can run challenges
  without ever exposing the surface.
- Per-challenge: `Challenge.leaderboard_enabled`. The coach toggles
  this when authoring.
- Per-assignment: `ChallengeAssignment.leaderboard_optin`. The
  client toggles this on the detail screen.

A leaderboard renders to a client iff all four are on.

## 10. Analytics

- `leaderboards.viewed_by_coach` — `{ coach_id, challenge_id }`.
- `leaderboards.viewed_by_client` — `{ student_id,
  assignment_id }`.
- `leaderboards.optin_changed` — `{ student_id, assignment_id,
  optin: true|false }`.

Healthy signal: opt-in rate per challenge above 30%. Below that,
the coach's UI surfaces a quiet hint: "few of your clients are
opting in to this leaderboard — consider whether the challenge
framing invites participation".

## 11. Rollout

- Phase 1: founders + leaderboards disabled at the per-coach level.
  Validates the implementation lands without changing the surface.
- Phase 2: enable leaderboards for the founding cohort coaches.
  Run for 30 days. Watch the opt-in rate.
- Phase 3: GA — the `leaderboards_enabled` flag becomes the coach's
  own decision rather than an owner-set toggle.

Rollback: flip `FEATURE_CHALLENGES_ENABLED=false`. Both
challenges and leaderboards go dark together.

## 12. Tests

- `test/leaderboards.service.spec.ts` — query shape, bucket
  computation, neighbour-merging.
- `test/leaderboards.controller.spec.ts` — auth gating, opt-in
  requirement.
- `test/leaderboards-doctrine.spec.ts` (§6.3).

## 13. Risks

1. **A coach builds a culture around the leaderboard.** "Top of
   the board this week wins a free session." That's the coach's
   prerogative; the doctrine concern is the **chrome**, not the
   coach's running of their practice. The chrome stays muted; the
   coach can still attach extrinsic rewards out of band. **Watch
   for:** a per-leaderboard "prize" field appearing in a future
   PR. Reject it.
2. **The bucket scheme feels too coarse.** Clients ask for
   percent rank instead. **Response:** percent rank is a balance
   inference vector when the bucket-merging is not sufficient (a
   board of 10 with 1 leader yields a 10th-percentile gap); we
   keep buckets and the privacy budget.
3. **The leaderboard becomes the only progress signal a client
   sees.** The detail screen still surfaces the full progress
   timeline (events, score, days remaining). The leaderboard is
   a side panel, not the primary progress surface. The mobile UX
   layout reflects this.

## 14. Dependencies

- `01-challenges.md` — the source of all data.
- `08-entitlements.md` — L2/L3 gating.
- `community` module — `anonymiseName` helper.

## 15. Acceptance criteria

- [ ] No new tables; only computed views.
- [ ] DTO `.strict()` rejects every field not in
      `LeaderboardEntrySchema`.
- [ ] Bucket-merging covers the singleton case in the
      client-facing payload (test pins this).
- [ ] Per-coach, per-challenge, and per-assignment opt-in toggles
      all default to false.
- [ ] No oxblood progress ring, no podium, no medal chrome on the
      mobile surfaces.

## 16. Operator handoff

When the implementation PR ships:

1. Apply the migration that adds the two boolean columns
   (folded into `01-challenges.md`).
2. The leaderboard endpoint is dark by default — the per-coach
   flag is off.
3. Founding cohort: `UPDATE coach_profiles SET feature_flags =
   feature_flags || '{"leaderboards_enabled":true}' WHERE
   user_id = '...';` for the validating coaches.
4. The opt-in rate is the GA gate — below 30% across founding
   cohort, hold rollout and revisit the framing.
