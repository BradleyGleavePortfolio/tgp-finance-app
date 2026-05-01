# Wave 10 — Cross-product federation and account identity

> **Status:** draft, documentation-only.
>
> The unified admin console (PR #92, #93) federates between fitness
> and finance via service-token-gated endpoints. Identity mapping is
> email-only today. This spec defines the **upgrade path** to a
> shared identity ID and the privacy posture of every cross-product
> response.

## 0. Cross-repo dependencies

- **Hard:** `growth-project-backend/docs/admin/federation-spec.md`
  (Wave 10 backend) — declares the admin-console federation surface.
- **Hard:** This repo `backend/src/admin/federation/` (PR #93,
  shipped) — the existing federation surface this spec extends.
- **Hard:** This repo PR #109 §1 — declares `org_id` and the org
  surface federation must respect.

## 1. WHY a shared identity (eventually)

Email-mapping has known weaknesses:

- A user changes email → mapping breaks.
- Two users share an email (work + personal) → mapping is
  ambiguous.
- A user signs up to fitness with email A and to finance with
  email B → no mapping.
- Privacy-respecting hashed-email mapping is brittle (any case
  change, normalisation drift, leading whitespace produces
  collision misses).

A `shared_identity_id` is a long-term identifier owned by the
platform that survives email churn. It is **not** a user-facing
account ID; it lives in a side table and is computed from a join of
records the user has explicitly consented to merge.

Per `OWNER_DECISION W10_IDENTITY_MAPPING_V2`, recommendation A —
defer to v2; v1 remains email-only.

## 2. The dual-write upgrade path (v2 reference)

This section is a **future-state reference**, not a v1 deliverable.
v1 maintains the email-only posture from PR #93.

### 2.1 v2 schema (reserved-name; runtime PR-W10-V2)

```
table  shared_identities
  id                          uuid          PK
  fitness_user_id             uuid          NULL
  finance_user_id             uuid          NULL
  link_method                 text          NOT NULL  -- 'email_match' | 'consented_merge' | 'admin_ratified'
  linked_at                   timestamptz   NOT NULL
  linked_by                   uuid          NULL  -- OWNER for admin_ratified
  consent_payload_jsonb       jsonb         NULL  -- if user-consented
  status                      text          NOT NULL  -- 'active' | 'split' | 'disputed'

  UNIQUE (fitness_user_id) WHERE status='active'
  UNIQUE (finance_user_id) WHERE status='active'
```

### 2.2 v2 federation responses

The existing `identityMapping: 'email'` field becomes:

```
{
  ...,
  "identityMapping": "email" | "shared_identity_id" | "both",
  "shared_identity_id": "<uuid>" | null,
  "mapping_confidence": "high" | "medium" | "low"
}
```

`mapping_confidence` is `high` for `consented_merge` /
`admin_ratified`; `medium` for `email_match`; `low` if multiple
candidates exist.

### 2.3 v2 dual-write window

For 6 months after `PR-W10-V2-PHASE-1` ships, every federation
response carries **both** mappings; clients (the unified admin
console) prefer `shared_identity_id` but fall back to email if
`null`. After 6 months, `PR-W10-V2-PHASE-2` deprecates the email
mapping path.

## 3. v1 posture (this spec)

v1 is **email-only**. Every federation response carries
`identityMapping: 'email'`. The doctrine pin
`federation-identity-shape.spec.ts` asserts this.

The v1 surfaces (extending PR #93):

```
GET   /api/admin/federation/health                        (already shipped, PR #93)
GET   /api/admin/federation/users/:email/finance-summary  (extends PR #92's bridge)
GET   /api/admin/federation/users/:email/org-rollup       (new in this set; reads PR #109 rollups)
GET   /api/admin/federation/orgs/:org_id/summary          (new in this set)
GET   /api/admin/federation/payouts/:user_email/summary   (new in this set; reads PR #110 §08 reports)
```

All require the `FEDERATION_SERVICE_TOKEN` bearer per PR #93. Without
the env var set, every endpoint returns `503 FEDERATION_DISABLED`.

## 4. Privacy posture

The federation response shape is **minimum-necessary**. Every
response field is justified against:

- Does the unified admin console need this field for its UI?
- Does the field add to PII concentration?
- Is the field bucketed where appropriate?

A response **must not** include:

- Raw amounts (always bucketed: `revenue_band`, `client_count_band`,
  etc.).
- Raw client list (the org rollup includes counts only).
- Stripe IDs.
- Any field not declared in this spec.

The doctrine pin asserts every federation endpoint returns through
a per-endpoint TypeScript type that enumerates allowed fields; an
unknown field triggers compile failure.

## 5. New endpoint shapes (v1)

### 5.1 `/users/:email/org-rollup`

```
GET /api/admin/federation/users/:email/org-rollup
Authorization: Bearer <FEDERATION_SERVICE_TOKEN>

→ 200 {
  identityMapping: "email",
  org_id: uuid | null,
  org_role: "head_coach" | "sub_coach" | null,
  display_name_band: "personal" | "small_team" | "established" | "large",
  -- if head_coach:
  sub_coach_count_band: "0" | "1-3" | "4-9" | "10+",
  this_month_revenue_band: "<$1k" | "$1k-5k" | "$5k-25k" | "$25k+",
  -- if sub_coach:
  this_month_received_band: "<$1k" | "$1k-5k" | "$5k-25k" | "$25k+",
}
→ 404 USER_NOT_FOUND
→ 401 FEDERATION_UNAUTHENTICATED
→ 503 FEDERATION_DISABLED
```

### 5.2 `/orgs/:org_id/summary`

```
GET /api/admin/federation/orgs/:org_id/summary
Authorization: Bearer <FEDERATION_SERVICE_TOKEN>

→ 200 {
  identityMapping: "email",
  org_id: uuid,
  display_name: text,
  billing_flow: "A" | "B",
  status: "active" | "paused" | "dissolved",
  member_count: int,                     -- raw count is OK (not money)
  this_month_revenue_band: ...,
  this_month_refund_band: ...,
  this_month_chargeback_band: ...,
  next_payout_date: timestamptz | null,
}
→ 404 ORG_NOT_FOUND
```

### 5.3 `/payouts/:user_email/summary`

```
GET /api/admin/federation/payouts/:user_email/summary
Authorization: Bearer <FEDERATION_SERVICE_TOKEN>

→ 200 {
  identityMapping: "email",
  connect_kyc_state: "active" | "restricted" | "rejected" | "dissolved" | "verified" | "submitting" | "link_issued" | "invite_pending",
  ytd_received_band: ...,
  next_payout_date: timestamptz | null,
  affiliate_status: "none" | "active" | "negative_balance",
  fraud_signal_count_band: "0" | "1-2" | "3-5" | "≥6",
  threshold_1099_crossed: bool,
}
```

## 6. State-transition table — federation surface

| From | To | Trigger |
|---|---|---|
| `disabled` | `enabled` | OWNER sets `FEDERATION_SERVICE_TOKEN` ≥ 32 chars |
| `enabled` | `disabled` | OWNER unsets the env var |
| `enabled` | `degraded` | underlying read fails (e.g. PR #110 reconciliation drift) → returns `503 RECONCILIATION_DRIFT` for payouts endpoint |
| `degraded` | `enabled` | drift cleared |

Federation state is **operational**, not stored. The state is the
deployment configuration.

## 7. Audit

Every federation request writes a row to `federation_audit_events`:

```
table  federation_audit_events
  id                       uuid          PK
  endpoint                 text          NOT NULL
  caller_token_kid         text          NOT NULL  -- key id of bearer
  email_param              text          NULL  -- the email looked up
  org_id_param             uuid          NULL
  result_status            int           NOT NULL  -- HTTP status returned
  result_byte_count        int           NOT NULL
  posted_at                timestamptz   NOT NULL DEFAULT now()
```

Append-only. The `email_param` is **plain** in the audit row (it's
already plain in the URL); platform-internal access only.

## 8. Privacy / security

- Federation tokens are gated per-deployment by env var; without
  the env var, every endpoint returns `503 FEDERATION_DISABLED`
  (per PR #93).
- Every response carries `identityMapping: 'email'` so the caller
  can warn on one-sided matches (a user who exists in fitness but
  not in finance).
- No federation endpoint surfaces raw amounts.
- No federation endpoint surfaces a list of clients or sub-coaches
  by name; only counts and bands.
- IP-allowlisting at the WAF is the v1 control; mTLS is reserved
  for v2.

## 9. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | Caller forgets the bearer; existing 401 path covers | tested in PR #93 | unchanged |
| 2 | Caller's email param has uppercase/leading whitespace | server-side normalises (lowercase + trim) before lookup; doctrine pin asserts | normalisation is the same as PR #93's existing behaviour |
| 3 | Email matches multiple users (rare; edge case) | federation returns `409 IDENTITY_AMBIGUOUS` with the count | OWNER manually disambiguates via the admin console; v2 `shared_identity_id` removes this case |
| 4 | A v2 dual-write response is consumed by a v1 client (forward-compat) | new fields are additive; v1 client ignores unknown fields | OpenAPI contract covers; doctrine pin asserts no breaking change |
| 5 | A federation token is leaked | OWNER rotates `FEDERATION_SERVICE_TOKEN`; old token immediately rejected (no caching) | runbook covers rotation; service-token rotation is documented in `backend/src/admin/README.md` |
| 6 | Reconciliation drift blocks a payouts federation read | endpoint returns `503 RECONCILIATION_DRIFT_BLOCKING` | unified admin console shows "stale" indicator on payout band |
| 7 | An OWNER decision changes the bucketing thresholds (e.g. `revenue_band` boundaries) | the doctrine pin uses fixture data to assert bucket boundaries | bumping a boundary bumps a constant + the pin; CI catches mismatches |

## 10. Acceptance criteria

- [ ] v1 keeps `identityMapping: 'email'` per PR #93 doctrine.
- [ ] Doctrine pin `federation-identity-shape.spec.ts` runs in CI.
- [ ] No new federation endpoint surfaces raw amounts.
- [ ] Every endpoint responds 401 without a bearer; 503 without the
  env var; 200 with both.
- [ ] `federation_audit_events` is append-only.
- [ ] OWNER decision `W10_IDENTITY_MAPPING_V2` recommendation A
  (defer to v2) is recorded in this spec and the runtime PR's
  description.
- [ ] v2 dual-write upgrade path is **referenced** but **not**
  shipped in v1.

## 11. Out-of-scope (explicit)

- v2 dual-write implementation. Reserved for `PR-W10-V2-PHASE-1`.
- mTLS between fitness and finance backends. Reserved.
- Cross-product analytics joins (e.g. "users who do both fitness +
  finance"). Out of scope; PII concentration risk.
- A user-facing "merge my accounts" UX. Out of scope; v2 admin path
  only in the dual-write window.
- A `shared_identity_id` exposed in any user-facing surface. The ID
  is platform-internal only.
