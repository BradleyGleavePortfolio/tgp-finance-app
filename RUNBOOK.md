# Backend Runbook — `tgp-finance-api`

Daily-ops handbook for the finance-pillar backend (Fly.io app `tgp-finance-api`, region `sjc`). Read this first when something is on fire. For deeper deploy procedure see `backend/docs/DEPLOY.md` and the release script at `backend/scripts/release.sh`.

Last verified: 2026-05-09. Latest commit on `main`: `cdcacba feat(stage-3): coach practice type — finance side storage`.

---

## App identity

| Field | Value |
|---|---|
| Fly app | `tgp-finance-api` |
| Region | `sjc` (primary) |
| Database | Supabase Postgres (separate projects for staging vs production) |
| Release script | `bash ./scripts/release.sh` (invoked by Fly's `release_command`) |
| Federation surface | `/api/admin/federation/*` gated by `FEDERATION_SERVICE_TOKEN` |
| Companion app | `backend-spring-lake-3890` (fitness backend; same `FEDERATION_SERVICE_TOKEN`) |

---

## Deploy

```bash
flyctl deploy -a tgp-finance-api
```

The release-VM runs `bash ./scripts/release.sh`, which wraps `prisma migrate deploy` with baseline-recovery fallback for Prisma errors P3005 / P3009 / P3018. If migration fails for any other reason the release aborts and no traffic is shifted. The script is invoked via `bash` (not `sh`) because Fly's release-VM `/bin/sh` is dash, which rejects the script's `set -euo pipefail`.

To run migrations only (without redeploying the app):

```bash
flyctl ssh console -a tgp-finance-api -C "npx prisma migrate deploy"
```

To inspect a migration before applying:

```bash
flyctl ssh console -a tgp-finance-api -C "npx prisma migrate status"
```

### Known-degraded — `flyctl deploy --remote-only`

Remote builder deploys have intermittently failed with builder-OOM and intermittent network errors. Diagnostic steps when `--remote-only` errors:

1. Check the builder VM resource state at the top of the Fly logs. If the OOM signature appears (`Killed` or `out of memory` in the build phase), retry with `--local-only` to use Docker on your workstation.
2. Confirm the multi-stage `Dockerfile` is not pulling in dev dependencies that bloat the production image. The production stage should be `node:20-slim` plus the prebuilt `dist/` plus `node_modules` (production-only) plus the Prisma CLI bundled for the release-VM.
3. `flyctl secrets list -a tgp-finance-api` — confirm no secret was unset by the previous failed run; rerunning `flyctl secrets set` triggers a redeploy automatically.
4. If still failing, `flyctl deploy --local-only` from a workstation with Docker. Local builds bypass the remote builder entirely.

The local-only path is reliable; the remote-only path is what is intermittently broken. Track in the issue tracker as a separate ticket.

---

## Roll back

There is no `fly releases rollback` shortcut for a botched release that already passed migrations. Safe pattern:

```bash
flyctl releases -a tgp-finance-api
flyctl deploy -a tgp-finance-api --image registry.fly.io/tgp-finance-api:<tag>
```

Pick the last-good image tag from the releases list. If the bad release introduced a forward-only schema change, roll the migration manually before re-deploying — migrations are forward-only in production. The down step lives in source for emergencies but is not auto-applied.

Never rebuild from a stale local checkout. Always deploy from `main` HEAD plus an explicit image tag.

---

## Logs

```bash
flyctl logs -a tgp-finance-api
flyctl logs -a tgp-finance-api -i <machine-id>   # filter by machine
```

Structured JSON; pipe through `jq` locally.

---

## Status and health

```bash
flyctl status -a tgp-finance-api
flyctl machine list -a tgp-finance-api
flyctl checks list -a tgp-finance-api
```

The app exposes the Trust Center capability flags at `/api/system/trust-meta` and a release-info endpoint at `/api/system/release-info` returning `RELEASE_SHA`, `RELEASE_NAME`, and the `package.json` version.

---

## Database (Supabase)

`DATABASE_URL` points at Supabase Postgres. Production pool sizing: append `?connection_limit=10&pool_timeout=10` to the URL.

```bash
psql "$DATABASE_URL"
```

Common queries:

```sql
-- Promote the first owner (no bootstrap endpoint by design)
UPDATE users SET role = 'owner' WHERE email = '...';

-- Disable a coach (register / attach fail closed against an inactive code)
UPDATE coach_profiles SET is_active = false WHERE id = '...';

-- Find recent migrations
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
ORDER BY finished_at DESC
LIMIT 10;
```

---

## Secrets

```bash
flyctl secrets list -a tgp-finance-api
flyctl secrets set FOO=bar -a tgp-finance-api    # triggers a redeploy
flyctl secrets unset FOO -a tgp-finance-api
```

The boot validator rejects placeholder values for required vars and rejects `CORS_ORIGINS=*`. If a deploy fails on boot, the logs name the failing rule.

### Rotating `FEDERATION_SERVICE_TOKEN`

Coordinated with the fitness backend.

```bash
NEW=$(openssl rand -hex 32)
flyctl secrets set FEDERATION_SERVICE_TOKEN=$NEW -a tgp-finance-api
flyctl secrets set FEDERATION_SERVICE_TOKEN=$NEW -a backend-spring-lake-3890
```

Smoke check:

```bash
curl -sH "Authorization: Bearer $NEW" https://tgp-finance-api.fly.dev/api/admin/federation/health
# expects {"ok":true,"identityMapping":"email", ...}
```

Without the bearer, the same request must return `401 FEDERATION_UNAUTHENTICATED`. With the env var unset, every request must return `503 FEDERATION_DISABLED`.

### Rotating `COACH_ACCESS_CODE`

Coach role-selection code lives in `COACH_ACCESS_CODE`. Rotate before exposing the `.env.example` to anyone who does not own the production stack. The mobile app does not embed this value — it is server-side only.

---

## Sentry

`SENTRY_DSN` optional. When unset, errors are not forwarded — the boot logs the no-op state at info level. `RELEASE_SHA` is surfaced on `/api/system/release-info`; verify the value matches the running deploy when triaging an error.

---

## Common incidents

### Boot loop on deploy

Most often a missing or placeholder env var. The boot validator logs every failing rule. Set the missing secret with `flyctl secrets set` and Fly will redeploy automatically.

### `JWT verification failed: kid not in JWKS`

Mixed Supabase project keys. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` must all come from the same Supabase project ref. Pick one project and pin all four values to it.

### Federation surface returning 503

`FEDERATION_SERVICE_TOKEN` not set on this app, or the fitness backend has a different value. Compare with `flyctl secrets list -a backend-spring-lake-3890`.

### "I'm a Coach" returns 403 in production

This is the audit-flagged stop-the-press bug. The current gate is `ENABLE_DEV_BACKDOOR=true && NODE_ENV !== 'production'`, which hard-blocks coach self-promotion in production. Sprint A is replacing with a deep-link token flow signed with `FEDERATION_SERVICE_TOKEN` (or a dedicated `COACH_SIGNUP_SECRET`). Until that lands, promote new coaches via the OWNER admin path: `POST /api/admin/promote` with body `{ email, role: 'coach' }`.

### Migration P3005 / P3009 / P3018 on deploy

The release script handles these via baseline-recovery; if it still fails, the schema is in an unexpected state. Open `backend/docs/DEPLOY.md` and follow the baseline-repair procedure.

### Perplexity sliding-window rate limit hits

20 requests / user / hour, DB-backed. If a user reports the AI coach is unresponsive, check the rate-limit table for their user id; the `Retry-After` header on the 429 response indicates the next allowed call.

---

## Companion docs

- `README.md` — operator-facing reference (env vars, what is in the app, operator actions)
- `backend/docs/DEPLOY.md` — full Fly deploy procedure plus baseline-recovery
- `backend/src/admin/README.md` — federation surface module-level doc
- `mobile/DESIGN.md` — editorial register and brand doctrine
- `EAS-BUILD.md` — mobile production build commands
- `ONBOARDING.md` — new-engineer codebase tour
