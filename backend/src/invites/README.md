# Invites

The Phase 1C source-of-truth pass: a client (role=student) cannot exist
without a coach. This module is how a coach's `invite_code` is resolved
during signup, and how an OAuth-created client gets attached to a coach
after the fact.

## Files

- `invites.controller.ts` — `/api/invites/*` routes.
- `invites.service.ts` — preview / attach / my-code logic, with idempotent
  attach handling and an explicit refusal to re-bind a client to a
  different coach.
- `invites.module.ts` — imports `AdminModule` for `ensureCoachProfile`.

## Endpoints

| Method | Path | Auth | Body / Query | Behavior |
|--------|------|------|--------------|----------|
| GET | `/api/invites/preview?code=...` | `@Public()` | `code` | Returns coach name + `coach_id` (no PII beyond display name). Used by the mobile signup form to show "you'll be coached by Alice". |
| POST | `/api/invites/attach` | JWT | `{ invite_code }` | Attaches the calling user to the coach behind that code. Idempotent if already attached to the same coach; rejects a re-bind to a different coach. |
| GET | `/api/invites/my-code` | JWT + `coach`/`owner` | — | Returns the calling coach's invite code and a `share_path` the mobile app composes against its deep-link host. Lazily creates a `CoachProfile` if one is missing (one-shot fix for any pre-Phase-1B coach). |

## Data flow

### Signup (email/password) with a code

`AuthService.register` resolves the code **before** creating any Supabase
or DB rows so a bad code can't leave a half-created user behind. The
flow:

1. If `FEATURE_REQUIRE_COACH_CODE` is on, an `invite_code` is required.
2. If a code is supplied, look up `coach_profiles.invite_code`; refuse
   inactive codes or codes pointing at a non-coach/non-owner user.
3. Resolve the coach's user id → `coachIdToAttach`.
4. Create the Supabase user, then the local `User` row with
   `coach_id = coachIdToAttach`.

### Signup (Google OAuth) without a code

Google sign-in creates the Supabase user before we see them. The local
`User` row is lazily created on first authenticated request with
`coach_id = null`. Such a user must call `/api/invites/attach` with a
valid code; the `ClientCoachLinkedGuard` blocks all other client routes
until they do. The allowlist in that guard explicitly permits the
`/api/auth/me`, `/api/auth/logout`, `/api/auth/select-role`, and
`/api/invites/*` paths so the onboarding UI can render.

### Coach sharing

`getMyInvite` uses `AdminService.ensureCoachProfile` so a coach who
predates the Phase 1B migration gets a `CoachProfile` (and a fresh
invite code) the first time they fetch their share link. Returns:

```json
{
  "invite_code": "...",
  "is_active": true,
  "share_path": "/signup?coach=..."
}
```

The mobile app composes `share_path` against its deep-link host.

## Security & tenancy

- **No coach reassignment via the client surface.** `attach` rejects a
  client who is already attached to a *different* coach. Reassignment
  must go through an admin or coach action, not a user-initiated invite
  code, so a leaked code from a competing coach can't poach existing
  clients.
- **Inactive coaches fail closed.** Both `register` and `attach` look up
  `coach_profiles.invite_code` and refuse the row when
  `is_active = false`. Set the flag to disable a coach immediately
  without rotating the code.
- **Defensive role check.** A `CoachProfile` whose `user.role` is
  somehow not `coach` or `owner` (orphaned after a demote) is treated as
  invalid, even if `is_active` is still true.
- **Coaches and owners cannot attach.** Calling `attach` from a coach or
  owner returns `INVALID_ROLE` — they sit at the top of the hierarchy
  and don't belong to another coach.
- **Public preview surface is intentionally narrow.** Returns only the
  coach's `id`, display name, and the code itself. No email, no roster
  size, no internal stats.

## Environment variables

| Key | Effect |
|-----|--------|
| `FEATURE_REQUIRE_COACH_CODE` | When `true`/`1`, `register` rejects codeless signups and `ClientCoachLinkedGuard` blocks unattached clients. |

## Failure modes

| Code | When |
|------|------|
| `CODE_REQUIRED` | Empty/missing `code` query param. |
| `COACH_CODE_REQUIRED` | Codeless register attempt while the flag is on. |
| `INVALID_CODE` / `INVALID_COACH_CODE` | Code doesn't match an active coach profile. |
| `COACH_ALREADY_ATTACHED` | The user is already attached to a *different* coach. |
| `INVALID_ROLE` | Coach or owner tried to call `attach`. |
| `NOT_FOUND` | The current user no longer exists (race during account deletion). |

## Tests

`backend/test/invites.service.spec.ts` covers:

- preview success / inactive code / non-coach target
- attach happy path (no prior coach)
- attach idempotency (same coach already attached)
- attach refusal (different coach already attached)
- attach role guard (coach / owner refused)
- `getMyInvite` autocreates a `CoachProfile` for a freshly-promoted coach

## Operations

- Rotate a leaked invite code by issuing the coach a new one. The
  current API doesn't expose rotation directly; do it via DB update —
  set `coach_profiles.invite_code` to a fresh `randomBytes(8).toString
  ('base64url')` and the next `getMyInvite` call returns the new value.
- Bulk-imported coaches who pre-date the migration: rely on
  `getMyInvite`'s lazy creation, or run `ensureCoachProfile` for each
  one in a script.
- The Phase 1C rollout is staged. Turn the flag on in staging first;
  watch `COACH_LINK_REQUIRED` 403s in the access log. Existing students
  already have `coach_id`; the gate only catches future unattached
  signups.
