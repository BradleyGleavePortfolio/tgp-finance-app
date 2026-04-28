# Users

Identity-adjacent endpoints that don't fit auth: founding-member rank
("you're member #312"), inner-circle stats, the read-only access-status
surface, and the concierge handoff for data-export / account-deletion
requests.

## Files

- `users.controller.ts` — `/users/me/*` routes.
- `users.service.ts` — founding-number / circle-stats / access-status.
- `users.module.ts`.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/users/me/founding-number` | `{ rank, total, isFoundingMember }` (rank ≤ 1000). Implementation is `count(created_at < me.created_at) + 1`, no full-table sort. |
| GET | `/users/me/circle-stats` | Aggregates for the inner-circle widget (anonymized counts of community wins / streaks). |
| GET | `/users/me/badges` | Community badges for the calling user. |
| GET | `/users/me/access-status` | `{ role, accessSource: 'self' \| 'coach_managed' \| 'owner', coach, supportContactEmail }`. Read-only surface for the Profile membership card. |
| POST | `/users/me/data-controls/contact` | Acknowledges that the mobile client routed the user to the support inbox for a data-export or account-deletion request. Returns `{ mode: 'concierge', supportContactEmail, acknowledgedFor }`. There is intentionally no automated pipeline behind this. |

## Data-export and account-deletion (concierge today)

The previous `POST /users/me/data-export` and `DELETE /users/me/account`
endpoints returned `{ requested: true, eta: 'within 24h' }` and
`{ scheduled: true, gracePeriodDays: 30 }` respectively. Neither was
backed by a real implementation — there is no background-job pipeline
and no soft-delete column on the user record. The Trust Center copy
that referenced them implied a self-serve flow that didn't exist.

Both endpoints are removed. The mobile Trust Center now opens a
`mailto:` to `SUPPORT_CONTACT_EMAIL` (default
`support@thegrowthproject.courses`) with a pre-filled subject, and
calls `POST /users/me/data-controls/contact` so the support team can
correlate the request server-side. The route returns the configured
support email and a deterministic acknowledgement payload.

When a real export pipeline lands, give it its own controller and a
soft-delete migration; do not resurrect the old shapes.

## Access-status surface

`GET /users/me/access-status` is the single source of truth for the
Profile screen's membership card. The shape is:

```jsonc
{
  "role": "student" | "coach" | "owner",
  "accessSource": "self" | "coach_managed" | "owner",
  "coach": { "id": "...", "displayName": "..." } | null,
  "supportContactEmail": "support@thegrowthproject.courses"
}
```

`accessSource` is computed from `role` and `coach_id`:

- `owner` → `accessSource: 'owner'`.
- `student` with a non-null `coach_id` → `accessSource: 'coach_managed'`,
  and the `coach` block is populated with the coach's id and
  `coach_profile.display_name` (fallback to `users.name`).
- Anyone else → `accessSource: 'self'`.

The mobile client treats this response as authoritative and does not
do a second join.

## Security & tenancy

- All endpoints scope to `request.user.id`.
- The cascade graph for a future hard-delete (or soft-delete) flow
  must be re-validated before the route is reintroduced. Verify the
  cascade graph in `schema.prisma` before adding a new model that
  references `User`.
- The access-status response only ever exposes the caller's own
  posture and the public coach display name — no coach email, no
  cross-tenant field.

## Environment variables

| Key | Effect |
|-----|--------|
| `SUPPORT_CONTACT_EMAIL` | Optional. Override for the concierge support address surfaced on the Trust Center and the access-status endpoint. Defaults to `support@thegrowthproject.courses`. |

## Failure modes

- `getFoundingNumber` falls back to `{ rank: 0, total: 0,
  isFoundingMember: false }` when `request.user.id` somehow isn't a
  current row (should never happen behind `JwtAuthGuard`, but the
  graceful default keeps the dashboard from rendering NaN).
- `getAccessStatus` returns `accessSource: 'self'` with `coach: null`
  if the user row cannot be loaded. This is a defence-in-depth path
  behind `JwtAuthGuard` — it should never trigger in production.

## Tests

- `test/users-controller.spec.ts` — the concierge handoff payload,
  and a guard against resurrecting `{ requested: true }` /
  `{ scheduled: true }`.
- `test/users-access-status.spec.ts` — student/coach/owner role
  branches, coach-managed access source, support-email fallback.

The founding-number math is still a near-term TODO for direct
coverage.

## Operations

- Founding-member rank is a stable function of `created_at`. It
  doesn't change retroactively unless we delete a user *with* an
  earlier `created_at`.
- Concierge support requests go to the inbox configured by
  `SUPPORT_CONTACT_EMAIL`. Set this to a routed alias (e.g.
  `support@…`) rather than a personal address; the support email is
  rendered to the user verbatim.
- When the self-serve export / deletion pipeline lands, ship it as
  its own controller and update the Trust Center / access-status
  copy in the same PR; do not reintroduce the old stubs.
