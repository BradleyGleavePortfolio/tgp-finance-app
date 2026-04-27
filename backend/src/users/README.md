# Users

Identity-adjacent endpoints that don't fit auth: founding-member rank
("you're member #312"), inner-circle stats, and the GDPR-style data
export + account delete pair.

## Files

- `users.controller.ts` — `/users/me/*` routes.
- `users.service.ts` — founding-number / circle-stats / data-export /
  delete-account.
- `users.module.ts`.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/users/me/founding-number` | `{ rank, total, isFoundingMember }` (rank ≤ 1000). Implementation is `count(created_at < me.created_at) + 1`, no full-table sort. |
| GET | `/users/me/circle-stats` | Aggregates for the inner-circle widget (anonymized counts of community wins / streaks). |
| POST | `/users/me/data-export` | Triggers a data-export job. Returns immediately; the export is delivered via email. |
| DELETE | `/users/me/account` | Hard-deletes the user. Cascade rules in Prisma drop every child row. |

## Security & tenancy

- All endpoints scope to `request.user.id`.
- Account deletion cascades through Prisma's `onDelete: Cascade`
  rules. Verify the cascade graph in `schema.prisma` before adding a
  new model that references `User`.
- Data export contains user-identifying information; never short-
  circuit the auth on these routes.

## Environment variables

None unique to this module.

## Failure modes

- `getFoundingNumber` falls back to `{ rank: 0, total: 0,
  isFoundingMember: false }` when `request.user.id` somehow isn't a
  current row (should never happen behind `JwtAuthGuard`, but the
  graceful default keeps the dashboard from rendering NaN).
- `delete account` is irreversible. There is no soft-delete here —
  the soft path is "log out and stop using the app." If a product
  decision adds a 30-day grace period, that goes here.

## Tests

The founding-number math is a near-term TODO for direct coverage. The
delete cascade is exercised indirectly via Prisma's referential
integrity (any FK without a cascade rule will fail loudly during
`migrate dev`).

## Operations

- Founding-member rank is a stable function of `created_at`. It
  doesn't change retroactively unless we delete a user *with* an
  earlier `created_at`.
- Data-export job is fire-and-forget today. If volume grows, move
  it onto a job queue (BullMQ on Redis) and add a "your export is
  ready" push.
