# System

Cross-cutting platform endpoints. Today it's the "trust meta" surface
the mobile Trust Center reads; new ops endpoints (release info, ping
shape, etc.) belong here too.

## Files

- `system.controller.ts` — `/system/trust-meta`.
- `system.module.ts`.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/system/trust-meta` | Static-ish payload describing security posture: encryption-at-rest, third-party SDK list, retention policy, audit cadence. Read by the mobile Trust Center screen. |

## Security & tenancy

JWT-gated. The payload is the same for every authenticated user;
there is no per-user data. We still gate it because the body lists
the integrations we're using, which is not information we publish
publicly.

## Environment variables

None unique to this module.

## Operations

- The trust-meta payload is hand-curated and should reflect reality.
  When you add a new third-party (push, analytics, AI provider),
  update the listing here in the same PR — out-of-date trust copy is
  worse than no copy.
