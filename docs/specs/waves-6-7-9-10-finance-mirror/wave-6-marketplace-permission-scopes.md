# Wave 6 — App marketplace permission scopes (financial data)

> **Status:** draft, documentation-only.
>
> The marketplace allows third-party (and first-party but
> separately-deployed) apps to install into a coach's surface.
> Some of those apps will read or write **financial data** — the
> coach's revenue rollups, the client's net-worth slice, the
> sub-coach's payout share. This spec defines the **permission
> scope** model that gates that access.

## 0. Cross-repo dependencies

- **Hard:** `growth-project-backend/docs/marketplace/app-permissions-spec.md`
  (Wave 6 backend) — declares the platform-wide app-permission
  framework, the consent UX shape, the audit ledger.
- **Hard:** This repo PR #108 §05 (`05-marketplace-discovery.md`) —
  declares the marketplace surface this spec gates.
- **Hard:** This repo PR #109 §1 — declares `org_memberships` and
  the org-scope-vs-coach-scope distinction.
- **Hard:** This repo PR #110 §02 (ledger) and §07 (anti-fraud) —
  the ledger reads through scopes; fraud queue is OWNER-only.

## 1. WHY a scope model

PR #108 §05 declares the marketplace exists. Apps installed via the
marketplace expose tools to the coach. Some tools need to read
finance data:

- A "tax-time prep" app might need read access to the coach's monthly
  revenue rollup.
- A "weekly recap" app might need read access to client EOD
  (end-of-day) signals — bucketed only.
- A "payout dashboard" app might need read access to affiliate
  accruals.

A scope model is the only safe way to gate this. Without scopes:

- Apps gain ambient access to all finance data on install.
- Audit becomes "either the app could read everything or nothing."
- Revoking access is all-or-nothing.

This spec adds **named, named, finely-scoped permissions** that the
coach approves at install time and can revoke at any point.

## 2. Closed scope enum (finance-side)

Closed enum `finance_scope`. **Adding a new scope requires this spec
to be updated and the doctrine pin
`marketplace-permission-scope.spec.ts` to be extended.**

| Scope | Reads / writes | Default sensitivity | Notes |
|---|---|---|---|
| `read:profile` | coach name, slug, tier (`coach`/`coach_premium`) | low | identifying but already-public-on-storefront |
| `read:offers` | offer catalog (titles, kinds, price bands) | low | bands not amounts |
| `read:revenue:summary` | coach's own `/payouts/reports/summary` | medium | bands/amounts (own data) |
| `read:revenue:by-sub-coach` | head-coach-only; `org_revenue_by_sub_coach` | medium | gated by `org_role='head_coach'` |
| `read:client:bucketed` | client list with bucketed signals (savings band, debt band, EOD streak band) | medium | **never raw money** |
| `read:client:eod-history` | client EOD events (bucketed) | medium | requires the coach to be the client's coach |
| `read:affiliate:accruals` | own affiliate accruals (bucketed) | medium | own data only |
| `read:fraud-queue` | OWNER-only proxy | high | **OWNER role required**; refuses non-OWNER |
| `read:reconciliation-report` | OWNER-only | high | same |
| `write:offers` | create/update offers | medium | excludes price > $10k cap |
| `write:reward:trigger` | enqueue a reward grant within caps | medium | guarded by `RewardCapGuard` from PR #110 §06 |
| `write:funnel-analytics:opt-in` | opt the coach into funnel analytics | low | per Wave 9 W9_FUNNEL_CONSENT_DEFAULT decision |

**No scope grants raw client balance access.** This is non-negotiable
and the doctrine pin asserts it: every `read:client:*` scope returns
bucketed bands per PR #106 §02 leaderboard bucketing.

**No scope grants cross-coach access.** A coach's installed apps see
only that coach's clients, that coach's revenue, that coach's
affiliates. The federation surface (Wave 10) is the **only** path
to cross-coach data, and it is OWNER-only.

## 3. Schema additions

```
table  app_install_grants
  id                          uuid          PK
  coach_user_id               uuid          NOT NULL  FK users(id)
  app_id                      uuid          NOT NULL  FK apps(id)
  scopes                      text[]        NOT NULL  -- subset of finance_scope
  granted_at                  timestamptz   NOT NULL DEFAULT now()
  revoked_at                  timestamptz   NULL
  granted_by                  uuid          NOT NULL  -- usually coach themselves
  revoked_by                  uuid          NULL
  consent_version             int           NOT NULL  -- the version of the consent UX seen
  consent_payload             jsonb         NOT NULL  -- what scopes were displayed at consent

  UNIQUE(coach_user_id, app_id) WHERE revoked_at IS NULL
```

The UNIQUE constraint enforces a single active grant per (coach,
app); revoking and re-installing creates a new row.

```
table  app_install_audit
  id                          uuid          PK
  coach_user_id               uuid
  app_id                      uuid
  action                      text          'granted' | 'revoked' | 'scope_added' | 'scope_removed' | 'consent_re_required'
  before_scopes               text[]
  after_scopes                text[]
  reason                      text          NULL
  posted_at                   timestamptz   NOT NULL DEFAULT now()
```

Append-only (RLS + trigger; same posture as Wave 8 ledger).

## 4. Consent UX

When a coach installs an app:

1. App developer registers required + optional scopes in the app's
   manifest (managed in `growth-project-backend` Wave 6 backend).
2. Coach hits "Install" on the marketplace card.
3. Consent screen renders:
   - Required scopes (cannot install without).
   - Optional scopes (each defaulted off; coach toggles on).
   - For every scope, the verbatim copy from
     `marketplace/scope-copy.constants.ts` (reserved name; runtime
     PR adds).
4. Coach approves.
5. Backend writes `app_install_grants` row with `consent_version`
   and `consent_payload` (the exact scope list shown).

The doctrine pin asserts:

- The verbatim copy contains the substrings: `"finance"`, `"never
  shows raw"`, `"can revoke"`.
- No optional scope is enabled by default.
- Consent payload is captured verbatim.

When the consent copy changes (e.g. a scope's description is
updated), the version bumps. Coaches who installed under the old
version receive a `consent_re_required` action on their next
session and must re-approve before the app continues to function.

## 5. Token shape

App access uses scoped service tokens (mirrors PR #93's
federation-bearer pattern). Token shape:

```
{
  "iss": "tgp-finance-api",
  "aud": "<app_id>",
  "sub": "<coach_user_id>",
  "scope": "read:profile read:offers read:revenue:summary",
  "exp": <unix_ts>,
  "jti": <opaque_token_id>,
  "kid": <signing_key_id>
}
```

- Tokens expire after 1 hour; long-lived refresh path is in Wave 6
  backend spec.
- `scope` is a space-separated list, validated against the active
  grant on every request.
- A scope **not** in the grant's `scopes` array fails closed with
  `403 SCOPE_NOT_GRANTED`.
- A scope removed from the grant (post-revoke or scope-removed
  audit row) takes effect within 60 seconds (token cache TTL).

## 6. State-transition table

| From | To | Trigger |
|---|---|---|
| (none) | `granted` | coach approves install on marketplace card |
| `granted` | `granted` | coach toggles an optional scope (audit row `scope_added` / `scope_removed`) |
| `granted` | `revoked` | coach hits "Uninstall" or "Revoke access" |
| `granted` | `consent_re_required` (logical state) | platform bumps `consent_version` |
| `consent_re_required` | `granted` | coach re-approves at next session |
| `granted` | `revoked` (auto) | app is removed from marketplace by OWNER (rare; audit row carries reason) |

Revocation is **immediate** at the cache layer; tokens issued under
the prior grant fail closed within 60s.

## 7. API surface

```
POST  /api/v1/apps/:app_id/grant
  body: { scopes: string[], consent_version: int }
  → 200 { grant_id, scopes, granted_at }
  → 403 OWNER_SCOPE_NOT_PERMITTED  (caller is not OWNER for OWNER-only scopes)
  → 422 SCOPE_NOT_IN_MANIFEST
  → 422 CONSENT_VERSION_OUTDATED

POST  /api/v1/apps/:app_id/revoke
  → 200 { revoked_at }
  → 404 NO_ACTIVE_GRANT

GET   /api/v1/apps/grants                  (coach's own list)
  → 200 { grants: [...], next_cursor }

GET   /api/v1/admin/apps/grants?app_id=... (OWNER only)
  → 200 { grants: [...], next_cursor }

POST  /api/v1/admin/apps/grants/:id/force-revoke   (OWNER only)
  body: { reason: string ≥ 20 chars }
  → 200 { ok }
```

`Idempotency-Key` required on POSTs.

## 8. Privacy / security

- Tokens never log scopes in PostHog. The `app_install_audit` table
  records every grant change with `before` / `after`.
- Revocation propagation tested by an integration test that
  installs, revokes, then asserts the next request fails within 60s.
- OWNER `force-revoke` is rate-limited to prevent admin-side abuse:
  ≤ 50 per OWNER per hour.

## 9. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | App requests a scope not in its manifest | runtime PR returns `422 SCOPE_NOT_IN_MANIFEST` | manifest is source of truth; consent screen shows only manifest scopes |
| 2 | Coach revokes but the token cache hasn't expired | requests within 60s succeed | runtime PR's revoke endpoint forcibly invalidates the cache for that grant; integration test covers |
| 3 | OWNER-only scope is requested by a non-OWNER coach | `403 OWNER_SCOPE_NOT_PERMITTED` | scope's `RoleRequired` is declared in the manifest; consent screen omits OWNER-only scopes for non-OWNER coaches |
| 4 | App migrates to a new scope set without bumping `consent_version` | the doctrine pin scans every app's manifest at upload; if new scopes appear without a version bump, upload is refused | enforced at the marketplace upload pipeline (`growth-project-backend` Wave 6) |
| 5 | A revoked grant is replayed via a stored bearer token (token theft) | `jti` is checked against a revocation list on every request | revoked tokens fail closed; revocation list TTL is 1h to bound size |
| 6 | An app reads `read:client:bucketed` but the response includes a raw amount due to a serialiser bug | doctrine pin `marketplace-permission-scope.spec.ts` tests the response shape | every endpoint behind a finance scope returns through the bucketing serialiser; CI test asserts |
| 7 | A coach grants a scope, the app caches data, then revokes — cached data still leaks | terms of service requires apps to delete cached data on `app_install_grants.revoked` webhook within 24h | platform fires the webhook; OWNER queue reviews non-compliant apps |

## 10. Acceptance criteria

- [ ] Closed `finance_scope` enum with the values in §2.
- [ ] `app_install_grants` and `app_install_audit` tables exist;
  audit is append-only.
- [ ] Doctrine pin `marketplace-permission-scope.spec.ts` runs in
  CI.
- [ ] Default scope grants are **deny-all** (per
  `OWNER_DECISION W6_PERMISSION_DEFAULT_NO`, recommendation A).
- [ ] OWNER-only scopes refuse non-OWNER callers.
- [ ] Token cache TTL = 60s; revoke takes effect within that window.
- [ ] `Idempotency-Key` required on grant/revoke.

## 11. Out-of-scope (explicit)

- Cross-coach app installs (a single app installed at the org level
  for all sub-coaches) — deferred to Wave 11.
- Per-client scope filtering (an app reading only some of the
  coach's clients) — clients are coach-scoped already; finer
  filtering is the app's responsibility.
- An app marketplace SDK / dev tooling (lives in
  `growth-project-backend` Wave 6).
- Public web app marketplace (in-app only).
