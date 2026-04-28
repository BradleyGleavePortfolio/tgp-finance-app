# Backend deploy runbook

Production target: `tgp-finance-api.fly.dev` (Fly.io app `tgp-finance-api`,
primary region `sjc`).

## Two paths

There are two supported ways to deploy. They run the same `release_command`
on the Fly side (`bash ./scripts/release.sh` → `prisma migrate deploy` with
baseline-recovery fallback). The script is bash-only (`set -euo pipefail`),
so `fly.toml` invokes it with `bash` explicitly — invoking via plain `sh`
fails on Fly's release VM where `/bin/sh` is dash (`set: Illegal option -`).

### Windows contributors / line endings

The release script must reach the Fly VM with **LF** line endings. If a
Windows client commits `scripts/release.sh` with CRLF, bash reads
`set -euo pipefail\r` and aborts with `set: invalid option name…pipefail`,
killing the deploy before any migration runs.

The repo enforces this in `.gitattributes` at the root (`*.sh text eol=lf`,
plus `Dockerfile`, `*.toml`, `*.yml`/`*.yaml`, `.dockerignore`, and the
`docker-entrypoint*` family — anything interpreted on a Linux runner). New
clones honor it automatically; pre-existing Windows checkouts may already
hold CRLF copies. To recover a checkout:

```sh
# From the repo root, on the deploying Windows machine:
git config core.autocrlf false   # do not let git rewrite endings on checkout
git rm --cached -r .             # drop the index
git reset --hard                 # rewrite the working tree from the LF blobs
```

Or, surgically, just for the release script:

```sh
git checkout-index --force -- backend/scripts/release.sh
file backend/scripts/release.sh   # should NOT report "CRLF line terminators"
```

If you edit `scripts/release.sh` on Windows, make sure your editor is set to
LF (VS Code: bottom-right status bar; JetBrains: File → File Properties →
Line Separators). The CI deploy job runs on Linux, so PRs that introduce
CRLF will be caught before they reach Fly only if you locally diff against
`origin/main` — `.gitattributes` prevents new CRLF from being committed but
cannot retroactively fix a working tree that was checked out before this
file landed.

### 1. GitHub Actions (preferred)

The workflow at `.github/workflows/deploy-backend.yml` runs:

1. `npm ci` against the chosen ref (defaults to `main`)
2. `tsc --noEmit`
3. `nest build`
4. `jest --ci`
5. Required-env gate (mirrors `src/main.ts` so a missing secret can never reach Fly)
6. `flyctl deploy --remote-only --strategy rolling`
7. Smoke checks against `/health` (and best-effort `/health/deep` + `/system/release-info`)

Triggers:

- **Manual** (`workflow_dispatch`) — preferred for production releases. Choose
  the ref to deploy and supply a `reason` for the audit trail.
- **Push to `main`** that touches `backend/**`, the workflow file, or
  `fly.toml`. CI then redeploys `main`. If you don't want this, gate it behind
  a separate "release" branch and remove the `push` trigger.

Required GitHub secrets:

| Secret | Purpose |
|---|---|
| `FLY_API_TOKEN` | Fly.io deploy token (`flyctl auth token`). |
| `DATABASE_URL` | Used by the env gate only. The Fly app reads its own copy from `flyctl secrets`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | Env gate. |
| `JWT_SECRET` | Env gate. |
| `PERPLEXITY_API_KEY` | Env gate. |

The repo's GitHub Environment `production` is the gate point — add required
reviewers there to enforce a manual approval before any deploy proceeds.

### 2. Local `flyctl` (operator override)

```sh
cd backend
fly deploy --remote-only --config fly.toml --strategy rolling
```

Use this when:

- Fly is having an incident and the GitHub side is delayed.
- You're rolling back to a known-good image (`fly releases list` then
  `fly deploy --image <hash>`).
- You're testing the `release.sh` migration recovery path against a one-off
  branch.

A local deploy still triggers the same `release_command`, so migrations and
the `_prisma_migrations` recovery flow are identical to the CI path.

## Pre-deploy checklist

- [ ] PR is merged into `main` and CI is green.
- [ ] `prisma/migrations/` has any new migration committed and reviewed.
- [ ] `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations` is empty (schema and migrations agree).
- [ ] `flyctl secrets list -a tgp-finance-api` includes every key from the env table above.
- [ ] If introducing a new required env var: add it to `src/main.ts:assertRequiredEnv`,
      the env gate in `deploy-backend.yml`, and the env table in `backend/README.md`
      **before** the deploy that needs it.
- [ ] If the deploy enables the federation surface for the unified admin
      console: `FEDERATION_SERVICE_TOKEN` is set on **both** this backend
      and the fitness backend, and is identical on both. Without the env
      var, every `/api/admin/federation/*` request returns
      `503 FEDERATION_DISABLED` — the fail-closed default.
- [ ] If the deploy ships sale-readiness changes: confirm
      `SUPPORT_CONTACT_EMAIL` is set to a routed alias and that
      `dataExportSupported` / `accountDeletionSupported` on
      `/system/trust-meta` are still `false` (they remain concierge
      until the export pipeline is built).

## Post-deploy checks

The CI workflow already runs smoke checks. If you're deploying manually, do
the same by hand:

```sh
curl -fsS https://tgp-finance-api.fly.dev/health | jq
curl -fsS https://tgp-finance-api.fly.dev/health/deep | jq      # PR #86, optional
curl -fsS https://tgp-finance-api.fly.dev/system/release-info | jq  # PR #86, optional
```

If `/health/deep` returns `status: degraded`, the DB ping failed but the VM
is still serving — investigate Supabase before rolling forward.

If the federation surface is enabled, also smoke-check it once after
the deploy:

```sh
# Without the bearer → 401 FEDERATION_UNAUTHENTICATED
curl -fsS https://tgp-finance-api.fly.dev/api/admin/federation/health

# With the bearer → 200 + identityMapping: 'email'
curl -fsS -H "Authorization: Bearer $FEDERATION_SERVICE_TOKEN" \
  https://tgp-finance-api.fly.dev/api/admin/federation/health | jq
```

A 503 with the bearer set means the env var is missing on the Fly app
(check `flyctl secrets list -a tgp-finance-api`).

## Rollback

Fastest path:

```sh
fly releases list -a tgp-finance-api
fly deploy --remote-only --image registry.fly.io/tgp-finance-api:deployment-<hash>
```

If a migration is the cause: `prisma migrate resolve --rolled-back <name>`
inside a one-off Fly machine, then redeploy. `release.sh` already auto-marks
failed migrations as rolled back, but it does not undo *successful*
migrations — for those use a forward-fix migration, not a manual `DROP`.

## Concurrency

The workflow defines a `concurrency: deploy-backend` group with
`cancel-in-progress: false`, so two deploys queue rather than overlap.
Two deploys can never push image digests to Fly at the same time.
