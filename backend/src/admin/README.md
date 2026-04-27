# Admin

OWNER-only operations: promote users into `coach` or `owner`, list the
coach roster, and inspect any single coach's recent activity. This is the
intended replacement for the dev-only `COACH_ACCESS_CODE` self-promotion
flow.

## Files

- `admin.controller.ts` — `/api/admin/*` routes. Guarded by
  `JwtAuthGuard + RoleGuard` with `@Roles('owner')`. The role decorator
  is technically redundant because `RoleGuard` already auto-passes for
  OWNER, but we keep it explicit so the intent is greppable from the
  route definition and a future change to the OWNER bypass cannot
  silently widen access.
- `admin.service.ts` — promotion + ensureCoachProfile + roster aggregator.
- `admin.module.ts` — exports `AdminService` so other modules
  (`InvitesService` in particular) can call `ensureCoachProfile`.

## Endpoints

| Method | Path | Body / Query | Returns |
|--------|------|--------------|---------|
| POST | `/api/admin/promote` | `{ user_id, role: 'coach' | 'owner' }` | `{ user, coach_profile: { id, invite_code, is_active } }` |
| GET | `/api/admin/coaches` | — | Array of coach summaries with `student_count` and `template_count`. |
| GET | `/api/admin/coaches/:id` | — | One coach plus 7-day activity stats. |

## Data flow

`promoteUser`:

1. Look up the target user. 404 if not found.
2. Update the role (`coach` or `owner`).
3. Lazily ensure a `CoachProfile` row exists with a fresh `invite_code`
   (URL-safe base64, 8 random bytes from `crypto.randomBytes`). Owners
   get one too — they can run their own client roster.
4. Return the user + `coach_profile` so the caller can immediately share
   the invite link.

`listCoaches` joins `users.role IN ('coach', 'owner')` with their
`coach_profile`, computes one bulk `groupBy` for student counts, and
includes `program_template` count per row. Designed to populate an admin
dashboard in a single query.

`getCoachDetail` returns the coach plus four stats over a 7-day window:
`student_count`, `active_students_last_7_days` (any EOD touched),
`eod_submissions_last_7_days`, and total `coach_notes_total`.

## Invite-code generation

`AdminService.generateInviteCode()` returns a URL-safe base64 string from
8 random bytes (~13 chars). Collisions are vanishingly unlikely; the
`coach_profiles.invite_code` column has a UNIQUE index, and
`ensureCoachProfile` retries up to three times on a Prisma `P2002`
collision before surfacing `INVITE_CODE_COLLISION`.

The code is a *bearer secret*. Anyone who knows it can sign up under that
coach (Phase 1C). When a coach goes inactive, set
`coach_profiles.is_active = false`; both `register` and `attach` reject
inactive codes.

## Security & tenancy

OWNER-only — the entire controller is gated by `RoleGuard` with the
explicit `@Roles('owner')`. Outside the OWNER bypass there is no public
or coach-level path into this module.

## Environment variables

None unique to this module. Inherits everything from `auth/`.

## Failure modes

- **Promote a non-existent user** → 404 `NOT_FOUND`.
- **Validation failure** (`user_id` non-UUID, role outside the enum) →
  400 `VALIDATION_ERROR` from the inline Zod schema.
- **Three consecutive `invite_code` collisions** → 400
  `INVITE_CODE_COLLISION`. Has never been observed; the byte budget is
  64 bits.
- **`promoteUser` to `coach` for someone already a `coach`** — succeeds
  (idempotent). Their existing `CoachProfile` is reused.

## Operations

- The first OWNER must be promoted manually in the database (or via a
  one-shot script) — we don't expose a "first-owner" bootstrap endpoint
  on purpose. After that, OWNERs can promote each other and any coach.
- Demoting a coach back to `student` is **not** exposed by this module
  yet. If you need to disable a coach today, set
  `coach_profiles.is_active = false` (the `register` and `attach` flows
  fail closed against an inactive code), and reassign their students via
  direct DB update. Coach demotion semantics — what happens to their
  client roster, their templates, their notes — are an open product
  decision; expect a follow-up.

## Tests

The promote flow is covered indirectly via `invites.service.spec.ts`
(`ensureCoachProfile` on attach paths). Direct admin-controller tests
are a near-term TODO; the service is small and pure, but coverage on the
`P2002` retry loop would catch any future schema change to the unique
constraint.
