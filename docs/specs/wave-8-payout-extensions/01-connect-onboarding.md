# 01 — Stripe Connect Express onboarding

> **Status:** draft, documentation-only.
>
> This is the spec for how every payout recipient (coach, sub-coach,
> affiliate) onboards to Stripe Connect Express. The onboarding is
> the **only** path that grants a recipient the capability to receive
> a transfer / payout from the platform.

## 0. Cross-repo dependencies

- Wave 5 (PR #109) `docs/billing/sub-coach-billing-split-spec.md`
  §1 (Flow A vs Flow B) — defines whether a sub-coach has their own
  Connect account or shares the head coach's.
- Wave 9 (PR #108) §04 (`04-affiliates-referrals.md`) — defines
  affiliate as a coach-class entity; affiliates onboard via the same
  Connect flow as a coach.

## 1. WHY

Stripe Connect Express is the right substrate for the platform-side
rail because:

- It moves the KYC burden onto Stripe (we do not collect SSNs).
- It separates **platform balance** from **recipient balance**, so
  the platform fee and the coach's net are separable on the same
  charge.
- It supports **Transfer** (Flow B in Wave 5) and **direct charge**
  (Flow A) on the same primitive.
- It supports **payouts on a schedule** chosen by the recipient
  (default: daily, 2-day rolling on US accounts).

We use **Express**, not Standard or Custom:

- Standard requires Stripe-branded onboarding for the recipient and
  reveals the platform's account ID — fine for v1, but Express gives
  us a co-branded onboarding flow without taking on the Custom-tier
  liability surface.
- Custom requires us to take on KYC remediation. Out of scope.

## 2. WHEN onboarding fires

| Trigger | Flow |
|---|---|
| Coach role granted (existing PR #81 invite path) and no `connect_account_id` on file | `POST /api/v1/payouts/connect/start` is offered on first dashboard visit. |
| Sub-coach accepts ORG invite (Wave 4 mobile) **and** the org chose Flow A in Wave 5 | Onboarding link sent with the invite acceptance. |
| Sub-coach accepts ORG invite **and** the org chose Flow B | No onboarding for sub-coach; the head coach's account is the destination. The sub-coach's payout share is a Transfer to the head coach's account, then a head-coach-initiated Transfer to the sub-coach (out of scope for v1; sub-coach gets paid out-of-band on Flow B until `PR-W8-2-FOLLOWUP`). |
| Coach opts into affiliate program (PR #108 §04) | Same flow if no `connect_account_id`. |
| KYC requirements change (Stripe sends `account.updated` with `requirements.currently_due` non-empty) | A new onboarding link is generated and surfaced on the dashboard with a banner. |

## 3. Capability matrix per recipient kind

The capability matrix tells the platform what Stripe capabilities
must be `active` before the recipient can receive a given transfer
kind.

| Recipient kind | Required capabilities | Required treaty |
|---|---|---|
| Coach (solo) | `transfers`, `card_payments` | US Form W-9 collected by Stripe |
| Head coach (Flow B org) | `transfers`, `card_payments` | US W-9 |
| Sub-coach (Flow A org) | `transfers`, `card_payments` | US W-9 |
| Sub-coach (Flow B org) | none directly; head coach's capabilities cover the charge | none |
| Affiliate (a coach as referrer) | `transfers` | US W-9 |
| Reward recipient (free-month credit) | none — credit is a platform-side discount, not a transfer | none |

If a recipient does not have the required capability, the platform
**must not** initiate the transfer. The runtime PR's
`PayoutEligibilityGuard` enforces this.

## 4. Data model

```
table  connect_accounts
  id                          uuid          PK
  user_id                     uuid          FK users(id)         UNIQUE
  stripe_account_id           text          UNIQUE                NOT NULL
  account_kind                text          'coach' | 'sub_coach' | 'affiliate'
  capabilities_active         text[]        e.g. {transfers,card_payments}
  capabilities_pending        text[]
  capabilities_disabled       text[]
  requirements_currently_due  text[]        from Stripe
  requirements_past_due       text[]
  requirements_disabled_reason text         null when active
  payouts_enabled             bool                                NOT NULL
  charges_enabled             bool                                NOT NULL
  details_submitted           bool                                NOT NULL
  default_currency            text          'usd' in v1            NOT NULL
  country                     text          'US' in v1             NOT NULL
  kyc_state                   text          see §5                NOT NULL
  onboarding_link_url         text          rotates; not stored long-term
  onboarding_link_expires_at  timestamptz
  created_at                  timestamptz                         NOT NULL
  updated_at                  timestamptz                         NOT NULL
```

`stripe_account_id` is opaque. We never log it in PostHog (per
`02-ledger-and-audit.md` §6 privacy table).

`capabilities_active` and the three sibling arrays are **mirrored**
from Stripe on `account.updated`. The mirror is informational — the
platform never trusts the local mirror over Stripe at transfer
time; the `PayoutEligibilityGuard` re-fetches before any high-value
transfer.

## 5. KYC state machine (closed enum)

```
              ┌──────────────────────────────────────────────────┐
              │                                                  │
              ▼                                                  │
        invite_pending  ──── start ───▶  link_issued             │
                                                │                │
                                                │                │
                                                ▼                │
                                         submitting              │
                                          │       │              │
                                            verified                │
                                               │                 │
                                  ┌────────────┴────────────┐    │
                                  │                         │    │
                                  ▼                         ▼    │
                         active (payouts on)      restricted     │
                                                  (capabilities  │
                                                  pending or     │
                                                  past_due)      │
                                                       │         │
                                                       └─────────┘
                                                          re-issue link
```

Closed enum: `kyc_state ∈ {invite_pending, link_issued, submitting,
verified, active, restricted, rejected, dissolved}`.

State transitions:

| From | To | Trigger |
|---|---|---|
| (none) | `invite_pending` | Recipient is invited but has not clicked through. |
| `invite_pending` | `link_issued` | `POST /payouts/connect/start` returns a Stripe-hosted Account Link. |
| `link_issued` | `submitting` | Stripe `account.updated` arrives with `details_submitted=true` but capabilities still `pending`. |
| `submitting` | `verified` | Stripe `account.updated` arrives with all required capabilities `active`. |
| `verified` | `active` | First successful transfer (no Stripe blocker). |
| `active` | `restricted` | Stripe `account.updated` arrives with `requirements.currently_due` non-empty or any capability flips to `disabled`. |
| `restricted` | `active` | Recipient completes the new requirement and Stripe re-enables capabilities. |
| any | `rejected` | Stripe sends `account.updated` with `requirements.disabled_reason` set to a non-recoverable reason (e.g. `rejected.terms_of_service`). |
| any | `dissolved` | OWNER admin action. |

`rejected` and `dissolved` are terminal. The recipient cannot receive
new transfers in either state. Existing accrued ledger entries
remain for reconciliation; the OWNER's runbook covers payout
fallback (`08-reconciliation-and-payouts.md` §6).

## 6. API surface

All endpoints under `/api/v1/payouts/connect/*`. Auth: user JWT.
Tenant guard: recipient can only see/manage their own account; OWNER
can read any.

```
POST  /api/v1/payouts/connect/start
  body: { return_url: string }    // required (mobile deep-link)
  → 200 { onboarding_link_url, onboarding_link_expires_at }
  → 409 CONNECT_ACCOUNT_ALREADY_VERIFIED
  → 422 NOT_ELIGIBLE_FOR_PAYOUTS  (e.g. role is not coach)

GET   /api/v1/payouts/connect/status
  → 200 { kyc_state, payouts_enabled, charges_enabled,
          requirements_currently_due, capabilities_active }
  → 404 NO_CONNECT_ACCOUNT

POST  /api/v1/payouts/connect/refresh-link
  body: { return_url: string }
  → 200 { onboarding_link_url, onboarding_link_expires_at }
  → 409 CONNECT_ACCOUNT_NOT_RESTRICTED  (refusing if kyc_state=active)

POST  /api/v1/payouts/connect/dissolve     (OWNER only)
  body: { user_id: uuid, reason: string (≥ 20 chars) }
  → 200 { ok: true }
  → 422 ACTIVE_LEDGER_NOT_RECONCILED      (cannot dissolve with open accruals)
```

The `Idempotency-Key` header is **required** on every POST. The
`IdempotencyGuard` enforces (`03-idempotency-and-events.md` §2).

Wire shape: every monetary field on every Wave 8 endpoint is
`{amount: string, currency: string}` per the doctrine pin. None of
the Connect endpoints surface money directly; they surface state
only.

## 7. Webhook subscriptions

The platform subscribes to:

- `account.updated` — re-mirrors capabilities + requirements; runs
  the state-machine transition; raises a banner on the dashboard if
  state moves to `restricted`.
- `account.application.authorized` — informational; logs an audit
  event.
- `account.application.deauthorized` — moves state to `dissolved`;
  raises an OWNER alert; freezes accruals.
- `capability.updated` — informational; logged.

All four are routed through the inbox (`03-idempotency-and-events.md`
§3) with the Stripe `event.id` as the dedupe key.

## 8. Onboarding-link rotation

Stripe Account Links expire after 5 minutes. The platform never
stores the URL longer than that.

- The `onboarding_link_url` column is wiped (set to NULL) on
  `account.updated` arrival, on a successful refresh, or by a
  scheduled `WipeExpiredOnboardingLinks` job that runs every 10
  minutes.
- The expires-at column is informational only; the runtime PR's
  guard refuses to re-use a stored URL past expiry.

## 9. Privacy / security

| Field | PII? | Logged? | Notes |
|---|---|---|---|
| `stripe_account_id` | yes (Stripe-side identifier) | no — Sentry breadcrumb redacts | Treated like an external ID. Not logged in PostHog. |
| `requirements_currently_due` | array of Stripe requirement strings | yes (counts only) | Strings like `individual.id_number` are not PII themselves but reveal a lot about the recipient's KYC progress; only the **count** is logged. |
| `capabilities_active` | no | yes | Useful for dashboard health. |
| `country`, `default_currency` | no | yes | Both are USD/US in v1. |

PostHog event taxonomy (per `10-rollout-and-ops.md` §3):

- `payouts_connect_started`
- `payouts_connect_link_issued`
- `payouts_connect_state_changed`  (carries `from`, `to`, no money)
- `payouts_connect_dissolved`      (OWNER action; carries
  `user_id` of the dissolved account, OWNER who acted)

No event carries an amount. No event carries the Stripe account ID.

## 10. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | Stripe Account Link expires before recipient clicks | recipient sees 404 from Stripe | dashboard banner offers a fresh link via `POST /refresh-link`; jitter on link creation prevents thundering-herd refreshes |
| 2 | `account.updated` webhook lost (Stripe retries 3 times then gives up) | reconciliation drift between local `kyc_state` and Stripe state | nightly `ReconcileConnectStateJob` re-pulls every recipient's account from Stripe and compares |
| 3 | Recipient submits wrong tax info (Stripe rejects) | `kyc_state=rejected` | dashboard shows the Stripe disabled-reason verbatim; recipient must contact Stripe support; platform freezes accruals |
| 4 | Multiple onboarding-link refreshes in flight simultaneously | duplicate Stripe Account Link calls | the `IdempotencyKey` on `POST /refresh-link` is the recipient's `user_id` + the request body hash; replays return the same URL until expiry |
| 5 | Recipient dissolves their Stripe account directly via Stripe (`account.application.deauthorized`) | webhook arrives | platform moves state to `dissolved`; pending accruals are surfaced on the OWNER queue; payout-eligibility guard refuses any new transfer |
| 6 | Capabilities downgrade silently mid-pay-cycle (Stripe disables `transfers` but not `card_payments`) | `account.updated` arrives mid-cycle | the cycle's pending Transfer is held; OWNER queue alert fires within 1 minute; manual re-issue or reversal per runbook |
| 7 | OWNER dissolves a Connect account that has unreconciled accruals | guard returns `422 ACTIVE_LEDGER_NOT_RECONCILED` | OWNER must run the reconciliation report first or transfer the accruals to a different recipient via a manual ledger entry pair |

## 11. Acceptance criteria

- [ ] `connect_accounts` table exists; migration is additive only.
- [ ] `KycState` is a closed TypeScript union; no string literals
  outside the type guard.
- [ ] Every POST in `/api/v1/payouts/connect/*` requires
  `Idempotency-Key`.
- [ ] No money field appears on any Connect endpoint response.
- [ ] PostHog events do not carry money or Stripe account IDs.
- [ ] `account.updated` handler is replay-safe (proven by an inbox
  test that fires the same event twice and asserts a single state
  transition).
- [ ] `restricted` state surfaces a banner on the coach dashboard
  with the requirement count and a "Continue with Stripe" CTA.
- [ ] Doctrine pin `payouts-ledger-invariants.spec.ts` runs on every
  PR-W8-* CI build.
- [ ] No `new-website/` change.

## 12. Out-of-scope (explicit)

- Stripe Standard or Custom Connect.
- Non-US recipients (defer to Wave 11).
- Sub-coach payout under Flow B beyond head-coach intermediation
  (deferred to `PR-W8-2-FOLLOWUP`).
- Bank-account update UI inside our app (Stripe-hosted only).
- Recipient consent capture for marketing emails (separate flow).
