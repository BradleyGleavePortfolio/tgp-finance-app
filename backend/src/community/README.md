# Community

The "contribution loops" feed — anonymized wins from the user base,
plus reactions. The feed is a mix of synthesized canned wins (derived
from each user's profile + accounts) and user-posted wins; reactions
are unique per (`win_id`, `user_id`, `kind`).

## Files

- `community.controller.ts` — `/community/feed`,
  `/community/wins`, `/community/wins/:id/react`,
  `/users/me/badges`.
- `community.service.ts` — synthesizer + feed assembly + reaction
  upsert.
- `community.module.ts`.

## Models

- `CommunityWin` — `{ id, user_id, action, visibility, created_at }`.
  `visibility` is `circle` (only your inner circle) or `public`
  (full feed).
- `WinReaction` — `{ id, win_id, user_id, kind, created_at }`.
  `kind` is `fire` or `clap`.

## Synthesizer

`synthesizeWin(user, profile, accounts)` produces a canned win from
the user's current state — "paid off X% of their debt this month",
"hit a savings milestone of $Y", "maintained an N-day streak". The
choice is deterministic on `user.id` so a user sees a stable
synthetic identity across page loads. Names are anonymized
"FirstName L." (last initial only).

The synthetic feed is the *floor*: when there are not enough real
posted wins, the assembler tops up with synthesized rows so the feed
never feels empty. Synthesized rows are clearly marked in the
returned payload via a non-persistent `synthesized: true` flag.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/community/feed` | The feed (mix of real + synthesized). |
| POST | `/community/wins` | `{ action, visibility }` — post a win. |
| POST | `/community/wins/:id/react` | `{ kind: 'fire' \| 'clap' }` — toggle a reaction. Idempotent via the unique index. |
| GET | `/users/me/badges` | The current user's earned badges (driven by milestone + streak counts). |

## Security & tenancy

- Posting a win attributes it to `request.user.id`; the body cannot
  spoof another user.
- Reactions are unique on `(win_id, user_id, kind)` — duplicates are
  silent no-ops.
- Anonymization happens at the service layer (`anonymiseName`), not
  in the column store. Future product changes that want to surface
  full names need a deliberate change here, not a query rewrite.

## Environment variables

None unique to this module.

## Failure modes

- A user with no profile or accounts produces a `null` from the
  synthesizer; the assembler skips them.
- Reaction on a missing `win_id` returns 404. The mobile UI optimistic
  update reverts on failure.

## Tests

Community-specific specs are a near-term TODO. The synthesizer is
pure and amenable to a value-table test against fixture profiles.

## Operations

- The feed is currently unpaginated — the assembler returns a fixed
  page size. If/when the backlog grows, add cursor pagination on
  `created_at + id`. The `(visibility, created_at)` index already
  supports the descending scan.
- "Inner circle" semantics (who can see a `circle` win) are a
  follow-up — today the UI treats `circle` as "your accountability
  partner + coach" but the feed assembly does not enforce that.
