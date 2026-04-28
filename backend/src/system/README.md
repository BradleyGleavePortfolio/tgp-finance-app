# System

Cross-cutting platform endpoints — the "trust meta" surface the mobile
Trust Center reads, plus the `release-info` ops endpoint the mobile
splash, the coach console, and on-call humans use to confirm what's
actually running.

## Files

- `system.controller.ts` — `/system/trust-meta`, `/system/release-info`.
- `release-info.ts` — pure builder for the release-info payload (so it
  can be unit-tested without standing up Nest).
- `system.module.ts`.

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/system/trust-meta` | Public | Static-ish payload describing security posture: encryption level, data residency, audit policy version, plus *truthful* capability flags: `dataExportSupported`, `accountDeletionSupported`, `readOnlyAccountAccess`. Also surfaces `dataControlsMode: 'concierge'` and `supportContactEmail` so the Trust Center can route the data-controls CTAs to the support inbox. Read by the mobile Trust Center screen. |
| GET | `/system/release-info` | Public | Build/runtime metadata: app name, version, release SHA + name, Fly region + machine id, Node version, environment, process start time. Read by the mobile splash / coach console / on-call. Never includes secrets. |

## Security & tenancy

Both endpoints are public and return identical content for every
caller. `release-info` deliberately does NOT expose secrets, request
headers, or any user data. The fields that look operational
(`region`, `machine_id`) come from Fly.io's injected env and are safe
to surface — Fly publishes that information itself.

## Environment variables

`release-info` reads (all optional; missing values become `null`):

| Var | Source | Purpose |
|-----|--------|---------|
| `FLY_APP_NAME` | Fly.io runtime | App identifier (defaults to `tgp-finance-api`). |
| `FLY_REGION` | Fly.io runtime | Region the VM is running in (e.g. `sjc`). |
| `FLY_MACHINE_ID` | Fly.io runtime | The exact machine handling the request. |
| `FLY_RELEASE_VERSION` | Fly.io runtime | Fly's release counter — used as `release_sha` fallback. |
| `RELEASE_SHA` | Release pipeline | Preferred git SHA for the running build. |
| `RELEASE_NAME` | Release pipeline | Human-readable release name. |
| `npm_package_version` | npm at boot | Falls back to the package.json version. |

## Truthfulness rule for `trust-meta`

The capability flags (`dataExportSupported`, `accountDeletionSupported`,
`readOnlyAccountAccess`, `dataControlsMode`) must reflect what the
backend actually implements end-to-end. Asserting a capability that
isn't wired up — for example flipping `dataExportSupported` to `true`
while the export pipeline is still concierge — is treated as a
sale-readiness regression. The mobile Trust Center renders these flags
verbatim into the UI, so a flip here is a flip in front of every user.

The asserted flags are pinned by `test/system-trust-meta.spec.ts`
(capability flags + the `SUPPORT_CONTACT_EMAIL` fallback). Update that
spec in the same PR that flips a capability.

## Environment variables

`trust-meta` reads:

| Key | Effect |
|-----|--------|
| `SUPPORT_CONTACT_EMAIL` | Override for the concierge support address surfaced to the Trust Center. Defaults to `support@thegrowthproject.courses`. |

`release-info` reads the Fly.io and release vars listed above.

## Operations

- The trust-meta payload is hand-curated and should reflect reality.
  When you add a new third-party (push, analytics, AI provider),
  update the listing here in the same PR — out-of-date trust copy is
  worse than no copy.
- Console-integration smoke check: `curl https://<host>/system/release-info`
  should return non-null `version` and `started_at`. The deep health
  probe lives at `/health/deep` (see `src/health/`).
