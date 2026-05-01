# Sub-coach billing split — finance app spec

The Growth Project's Wave 4 mobile work introduces ORG mode (head coach
managing sub-coaches). When a head coach charges a client for coaching,
some portion of that revenue flows to the sub-coach who actually
delivered the service. This document is the canonical spec for how that
split is recorded, paid, refunded, and audited.

There are two flows. The org chooses one at creation time; switching is
disruptive (it requires a Stripe customer migration) and is treated as
an org-level event, not a per-offer event.

This is a docs-only spec. No `backend/src/`, `mobile/app/`, `prisma/`,
`.env`, or CI changes.

---

## 0. Cross-repo dependencies (hard)

- **`growth-project-backend/docs/product/sub-coach-hierarchy.md`** —
  owns `users.org_id`, `users.org_role`, `org_memberships`, the
  sub-coach lifecycle states. Not on `main` yet.
- **`tgp-finance-app/docs/specs/storefront-marketplace/02-offer-builder.md`**
  ([PR #108](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/108)
  §02) — owns the offer model. This spec extends it.
- **`tgp-finance-app/docs/specs/storefront-marketplace/03-checkout-deposits-subscriptions.md`**
  (PR #108 §03) — owns the Stripe checkout, webhook idempotency, and
  refund/dispute state machine. This spec layers on top.

If any hard dependency has not landed when a runtime PR derived from
this spec opens, the runtime PR pauses. Mirrored in repo-root
`PERP_HANDOFF.md`.

---

## 1. Two flows — when each applies

| | **Flow A — Separate Stripe customer per coach** | **Flow B — Connect-based transfer from head coach** |
|---|---|---|
| Who is the Stripe customer the client pays? | The **sub-coach's** Stripe Connect account (the customer's payment method is attached to the sub-coach's account directly). | The **head coach's** Stripe Connect account. |
| Who receives the platform fee? | The Growth Project (Stripe `application_fee_amount` on the charge). | The Growth Project (same). |
| Who pays the sub-coach? | n/a — the sub-coach already received the payment. | The head coach, via a Stripe Transfer initiated by our backend. |
| Who is the sub-coach's tax counterparty? | The client (sub-coach issues invoices directly). | The head coach (head coach issues invoices to the client; sub-coach issues invoices to the head coach). |
| Default for new orgs | Solo coaches becoming head coaches with one or two sub-coaches. | Larger orgs that want a single client-facing brand. |
| Refund initiator | Sub-coach (or platform). | Head coach (or platform). |

The choice is recorded on the org row as `org.billing_flow: 'A' | 'B'`.
Mobile renders an explanatory step in `SubCoachInvite` when ORG mode is
first enabled (deferred to a later runtime PR — not this spec).

---

## 2. Data model

Net new tables and columns. Names use snake_case to match existing
Prisma conventions. Types use `Decimal(14, 2)` for every monetary column
per `backend/docs/MONEY.md`.

### 2.1 Org-level (mirrors backend Wave 2)

```
table  orgs (read-only mirror in finance app — federated from
                growth-project-backend; finance app does not write here)
  id                          uuid          PK
  display_name                text
  billing_flow                text          'A' | 'B'           NOT NULL
  default_payout_split_pct    decimal(5,2)  0..100              NOT NULL
  default_client_cap          int                               NOT NULL
  stripe_account_id           text          'acct_...'          NULL on Flow A
  status                      text          'active' | 'paused' | 'dissolved'
  created_at                  timestamptz
  updated_at                  timestamptz
```

`stripe_account_id` is the head coach's Stripe Connect Express account
on Flow B. On Flow A it is null because the org does not collect money
to a single Stripe account (each sub-coach has their own).

`default_payout_split_pct` is the head-coach's default share. The
sub-coach's share is `100 - default_payout_split_pct`. Stored to two
decimal places.

### 2.2 Org membership (mirrors backend Wave 2; finance app reads only)

```
table  org_memberships (read-only mirror)
  id                          uuid          PK
  org_id                      uuid          FK orgs(id)
  user_id                     uuid          FK users(id)
  org_role                    text          'head_coach' | 'sub_coach'
  payout_split_pct            decimal(5,2)  per-membership override of org default
  client_cap                  int           per-membership override of org default
  status                      text          'pending' | 'active' | 'paused' | 'revoked' | 'expired'
  stripe_account_id           text          'acct_...'   sub-coach's own Connect account
  joined_at                   timestamptz
```

Notes:

- `payout_split_pct` is the **head coach's** share for revenue that
  flows through this membership. The sub-coach's share is
  `100 - payout_split_pct`.
- `stripe_account_id` is the sub-coach's own Stripe Connect Express
  account. Required on **both** flows: on Flow A it is the customer
  account directly; on Flow B it is the destination account for
  Transfer.

### 2.3 Offer extension (extends PR #108 §02)

```
alter table offers
  add column  payout_owner_user_id   uuid  FK users(id)        NULL
  add column  payout_split_pct       decimal(5,2)              NULL
  add column  payout_destination     text                      NULL  -- 'self' | 'org_split'
```

Semantics:

- `payout_owner_user_id` is the user the offer is sold under. For an
  org-shared offer (e.g. "Anchor Strength 12-week, run by anyone in the
  org"), this is the head coach. For a per-sub-coach offer (e.g.
  "Sam's Hypertrophy 8-week"), this is the sub-coach.
- `payout_split_pct` is the head-coach share for this offer. If null,
  the org default is used.
- `payout_destination`:
  - `'self'` — the entire net charge (after platform fee) goes to the
    coach who owns the offer. Default for solo coaches.
  - `'org_split'` — the split rule applies. Sub-coach receives
    `(100 - payout_split_pct) %`; head coach receives
    `payout_split_pct %`. Required for any offer sold under a head
    coach when ORG mode is on.

### 2.4 Ledger entry extension (extends PR #117 — billing engine)

The `LedgerEntry` model from PR #117 (the billing engine that
`storefront-marketplace/03-checkout-deposits-subscriptions.md` spec'd)
is the existing source of truth for money in/out of the platform. We
extend it for sub-coach attribution.

```
alter table ledger_entries
  add column  org_id                       uuid  FK orgs(id)            NULL
  add column  sub_coach_user_id            uuid  FK users(id)            NULL
  add column  head_coach_user_id           uuid  FK users(id)            NULL
  add column  payout_split_pct_at_charge   decimal(5,2)                  NULL
  add column  attributed_amount            decimal(14,2)                 NULL
  add column  attributed_role              text                          NULL  -- 'platform' | 'head_coach' | 'sub_coach'
```

Every `ledger_entry` for a charge that resolves to an org now produces
**three** ledger rows: one for the platform fee, one for the
head-coach's share, one for the sub-coach's share. The first two are
"income" rows on the org/head-coach ledgers; the third is an "income"
row on the sub-coach's ledger.

`payout_split_pct_at_charge` is captured at charge time so a later
adjustment to the membership row's `payout_split_pct` does not
retroactively re-attribute paid revenue.

`attributed_amount` is rounded to two decimals using
[banker's rounding](https://en.wikipedia.org/wiki/Rounding#Round_half_to_even),
deterministic per platform. The runtime PR adds the rounding helper to
`backend/src/common/money.ts`.

### 2.5 Stripe Transfer record (Flow B only)

```
table  stripe_transfers
  id                          uuid          PK
  org_id                      uuid          FK orgs(id)
  source_charge_id            text          'ch_...'                   NOT NULL
  source_ledger_entry_id      uuid          FK ledger_entries(id)
  destination_account_id      text          'acct_...'                  NOT NULL  -- sub-coach's
  amount                      decimal(14,2)                             NOT NULL
  currency                    text                                      NOT NULL
  stripe_transfer_id          text          'tr_...'                   NULL until success
  idempotency_key             text                                      UNIQUE
  state                       text          'pending' | 'succeeded' | 'failed' | 'reversed'
  failure_reason              text                                      NULL
  reversed_by_refund_id       uuid          FK refunds(id)              NULL
  created_at                  timestamptz
  succeeded_at                timestamptz                               NULL
  reversed_at                 timestamptz                               NULL
```

The transfer record is the only place we keep state about the head-coach
→ sub-coach payment in Flow B. It is the audit source of truth for
"what did Sam actually receive on the week of 4 May."

### 2.6 Refund attribution (extends the existing refunds table)

```
alter table refunds
  add column  attribution_strategy   text                 NULL   -- 'pro_rata' | 'platform_only' | 'head_coach_only' | 'sub_coach_only'
  add column  attribution_explanation text                NULL   -- short human note
```

The existing refunds table records the original Stripe refund. The new
attribution columns record **how the refund was distributed across the
three ledger rows** the original charge produced. See §5 for the rules.

---

## 3. API flows

### 3.1 Flow A — separate Stripe customer per sub-coach

```
1. Client signs up under sub-coach Sam's offer.
2. Mobile/web hits POST /api/v1/checkout/start
       body { offer_id, client_id, ... }
3. Backend resolves the offer:
       offer.payout_owner_user_id = sam.id
       offer.payout_destination   = 'self'
4. Backend returns a Stripe Checkout Session URL whose
       payment_intent_data.transfer_data.destination = sam.stripe_account_id
       payment_intent_data.application_fee_amount    = platform_fee(amount)
       (using Stripe Connect "destination charges" — the canonical pattern)
5. Client completes checkout on Stripe-hosted page.
6. Stripe webhook charge.succeeded fires.
       The charge's destination is sam.stripe_account_id.
       application_fee landed on the platform's account.
7. Backend writes three ledger rows:
       - platform fee  (attributed_role='platform',    attributed_amount=fee)
       - sam's net     (attributed_role='sub_coach',   attributed_amount=charge - fee)
       - head_coach: NONE — no head-coach ledger row in Flow A.
   Audit: 'finance.charge.recorded' with metadata.flow='A'
```

Key properties of Flow A:

- The platform never holds the sub-coach's money. Stripe pays the
  sub-coach directly. We are a **destination charge** facilitator, not
  a custodian.
- There is no head-coach ledger row; the head coach's revenue from
  Flow-A offers is the sum of the offers they personally sell, not a
  cut of sub-coach offers. (If the org wants the head coach to take a
  cut on Flow A, the offer must be modeled as Flow-B-style with
  `payout_destination = 'org_split'` even though the org is otherwise
  Flow A. This is **not allowed** by validation — an org's flow choice
  is binary; mixed mode is too easy to mis-account. The runtime PR
  enforces this with a Zod refinement on the offer create endpoint.)
- Refund initiator is the sub-coach. The platform can also initiate on
  the sub-coach's behalf via a support action.

### 3.2 Flow B — Connect transfer from head coach

```
1. Client signs up under head-coach Lana's org offer (sold under Lana,
   delivered by sub-coach Sam).
2. Mobile/web hits POST /api/v1/checkout/start
       body { offer_id, client_id, sub_coach_user_id (optional), ... }
3. Backend resolves the offer:
       offer.payout_owner_user_id = lana.id  (head coach)
       offer.payout_destination   = 'org_split'
       resolved sub_coach_user_id = sam.id  (from request OR from offer's
                                              default sub-coach assignment OR
                                              from the assignment table that
                                              maps clients to sub-coaches)
4. Backend returns a Stripe Checkout Session URL whose
       payment_intent_data.transfer_data.destination = lana.stripe_account_id
       payment_intent_data.application_fee_amount    = platform_fee(amount)
5. Client completes checkout.
6. Stripe webhook charge.succeeded fires.
       The charge's destination is lana.stripe_account_id.
       application_fee landed on the platform's account.
7. Backend writes three ledger rows:
       - platform fee  (attributed_role='platform',     attributed_amount=fee)
       - sam's share   (attributed_role='sub_coach',    attributed_amount=(charge - fee) * (100 - split) / 100)
       - lana's share  (attributed_role='head_coach',   attributed_amount=(charge - fee) * split / 100)
   Banker's rounding ensures the three sum to (charge).
8. Backend enqueues a Stripe Transfer:
       stripe_transfers row (state='pending')
       idempotency_key = 'tgp:transfer:' + ledger_entry_id_for_sam + ':charge'
9. Worker processes the transfer:
       stripe.transfers.create({
         amount: sam_share_in_minor_units,
         currency,
         destination: sam.stripe_account_id,
         transfer_group: 'org_' + org_id,
         metadata: { ledger_entry_id, source_charge_id, ... },
       }, { idempotencyKey })
       On success: stripe_transfers.state='succeeded', stripe_transfer_id='tr_...'
       On failure: stripe_transfers.state='failed', failure_reason captured.
                   Audit: 'finance.transfer.failed' for OWNER attention.
   Audit: 'finance.charge.recorded' with metadata.flow='B'
   Audit: 'finance.transfer.created' on enqueue
   Audit: 'finance.transfer.succeeded' on success
```

Key properties of Flow B:

- The head coach's Stripe Connect account is the custodian for ~24h
  before the sub-coach's share is forwarded. This is intentional and
  documented to head coaches as part of the org agreement.
- Transfer is enqueued, not made synchronously. A failed transfer does
  **not** roll back the charge — the platform's job is to retry the
  transfer and to surface the failure to OWNER for manual resolution.
- The transfer worker has a separate retry policy: 3 retries with
  exponential backoff, then the row stays `failed` for OWNER review.
- Subscriptions: every recurring charge produces a fresh transfer. The
  idempotency key is `tgp:transfer:<charge_id>:charge` so re-processing
  a webhook does not double-transfer.

### 3.3 Flow B — failure modes and recovery

| Failure | Stripe behaviour | Our behaviour |
|---|---|---|
| `charge.succeeded` but transfer creation 4xx (insufficient balance on the head coach's Connect account) | Charge holds; transfer not created | `stripe_transfers.state='failed'`. Worker retries hourly. After 24h, `audit_action='finance.transfer.held_for_review'`. OWNER receives a `past_due_transfer_new` push (per `growth-project-backend/docs/admin/control-room-spec.md`). |
| `charge.succeeded` but transfer creation 5xx (Stripe outage) | Charge holds; transfer not created | Same as above; retried with backoff. |
| Transfer succeeds, then sub-coach revokes Connect access | Transfer is irrevocable | The Connect-disconnection event is a no-op for past transfers. Future charges fail-fast on the next `charge.succeeded` because the destination check fails — the offer is auto-paused (`offer.status='paused_destination_invalid'`) and OWNER is notified. |
| Sub-coach Connect account is restricted by Stripe (regulatory hold) | New transfers fail with a typed error | Same as Connect-disconnection. The hold itself is read off the Connect account state in the daily reconciliation job (§7) and surfaced. |
| Charge refunded after transfer succeeded | See §5 (refund cascade). | A reversing transfer is created. |

---

## 4. Subscription handling

Stripe subscriptions on Connect destination charges are stored on the
destination account. The application fee per invoice is set via
`subscription.application_fee_percent`.

| Flow | Subscription stored on | Per-invoice flow |
|---|---|---|
| A | Sub-coach's Connect account (sub-coach is the merchant). | `invoice.payment_succeeded` produces three ledger rows (no transfer because the sub-coach already has the money). |
| B | Head coach's Connect account. | `invoice.payment_succeeded` produces three ledger rows AND enqueues a Transfer to the sub-coach (same shape as one-shot Flow B). |

Cancellations: see PR #108 §03 for the cancellation state machine.
Wave 5 adds attribution rows on the cancellation audit log (i.e. when a
sub-coach cancels a sub, the audit row records `actor_user_id=sam.id`,
not just `actor_role='coach'`).

Proration: Stripe's proration applies on the **gross** charge. We
recompute the split on the prorated amount, **not** on the original
amount. This is the only place where `payout_split_pct_at_charge` from
the original charge is ignored — proration uses the **current** split.
This is documented in the head-coach agreement.

---

## 5. Refund cascade

When a charge is refunded, the three ledger rows must be reversed.
There are four strategies; only one is allowed by default. The others
require an OWNER action with explicit justification recorded in the
audit row.

### 5.1 Default strategy: `pro_rata`

The refund is split **proportionally** across the three ledger rows
based on the original `attributed_amount` values.

```
example:
  charge          £100.00
  platform fee    £10.00          (10 %)
  head coach      £63.00          (70 % of net £90)
  sub-coach       £27.00          (30 % of net £90)

  full refund:
    platform reverse  £10.00
    head coach reverse £63.00
    sub-coach reverse  £27.00

  partial refund of £40.00:
    proportion       = 40.00 / 100.00 = 0.40
    platform reverse = £4.00
    head coach reverse = £25.20
    sub-coach reverse  = £10.80
    (banker's rounding to ensure sum = £40.00)
```

Reverse rows on the ledger:

- `platform` → negative `attributed_amount` row, `attributed_role='platform'`
- `head_coach` → negative `attributed_amount` row, `attributed_role='head_coach'`
- `sub_coach` → negative `attributed_amount` row, `attributed_role='sub_coach'`

In **Flow B**, a reversing Stripe Transfer is also created (sub-coach
returns their share to the head coach's Connect account). The reversing
transfer is recorded in `stripe_transfers.reversed_by_refund_id`.

`refunds.attribution_strategy = 'pro_rata'`,
`refunds.attribution_explanation = 'default'`.

### 5.2 OWNER-only strategies

The other three strategies are **not** available through the standard
mobile/web refund flow. They require an OWNER action with a typed
explanation:

| Strategy | When OWNER might pick it | Audit requirement |
|---|---|---|
| `platform_only` | Refund is funded by the platform as a goodwill gesture; coaches keep their share | `audit_action='finance.refund.platform_absorbed'`, explanation must be ≥ 20 chars |
| `head_coach_only` | Sub-coach delivered service in good faith; head coach absorbs the refund | `audit_action='finance.refund.head_coach_absorbed'`, explanation ≥ 20 chars |
| `sub_coach_only` | Head coach decides to recoup full client refund from sub-coach (e.g. material misconduct) | `audit_action='finance.refund.sub_coach_only'`, explanation ≥ 20 chars |

Each strategy produces different reversing-transfer shapes. The runtime
PR implements the four pure-functions in `backend/src/billing/refund-attribution.ts`
and tests every combination against the property
"sum of reversing rows = refund amount, exactly, with no drift."

### 5.3 Refund of a refund (re-charge after refund)

If a customer disputes a refund and Stripe reverses it (`charge.dispute.funds_reinstated`),
the reversal of the reversal is a new charge event and produces a fresh
set of three ledger rows under the same attribution pct as the original
charge. The original refund row is marked `state='reinstated'`.

### 5.4 Edge case: refund of a charge from a paused/removed sub-coach

If the sub-coach's membership is paused or revoked between the charge
and the refund, the cascade still runs against the **historical** split
recorded on the original ledger rows. The reversing transfer is sent to
the sub-coach's still-valid Stripe Connect account (the membership
status does not invalidate the Connect account itself).

If the sub-coach's Connect account is **restricted** (Stripe hold), the
reversing transfer fails the same way a forward transfer fails (§3.3)
and lands in OWNER's `held_for_review` queue.

---

## 6. Currency handling

Multi-currency orgs are deferred to a future runtime PR but the data
model accommodates them by carrying `currency` on every monetary row.

For now (v1):

- An org pins to a single currency at creation (`org.default_currency`).
- All offers under an org share that currency.
- Every monetary row carries `currency` for forward-compatibility.
- The reconciliation job (§7) compares like to like — it does not
  compute cross-currency totals.

Edge case: a sub-coach with a Connect account in a different country
than the head coach. Stripe converts at transfer time. We record the
charge currency on the ledger rows and the destination currency on the
transfer row. The two can differ. The org-level roll-up (in
`finance-org-roll-ups.md`) operates on the charge currency and never
attempts to normalise across currencies — multi-currency totals would
be misleading.

---

## 7. Reconciliation

A daily job, `BillingReconciliationJob`, runs at 02:00 UTC. Its
contract:

```
For the prior 24h + 7d safety overlap:
  1. Fetch Stripe Balance Transactions list for the platform account.
  2. For each charge: confirm a matching ledger_entries row with the
     same charge id and the same gross amount. Three ledger rows
     expected per org-attributed charge; one for solo charges.
  3. For each transfer (Flow B only): confirm a matching
     stripe_transfers row in 'succeeded' state with the same amount
     and destination.
  4. For each refund: confirm a matching refunds row and the three
     reversing ledger rows summing to the refund amount.
  5. Confirm the application fee per charge matches the configured
     platform fee for that offer at charge time.
  6. Sum: gross charges - refunds - transfers out = expected platform
     balance change. Compare to Stripe's reported balance change. If
     drift > 1 cent in any currency, write
     audit_action='finance.reconciliation.drift_detected' and notify
     OWNER.
```

The 7d safety overlap exists because Stripe's Balance Transactions list
is not strictly real-time and disputes can resolve days later. The job
is **idempotent** — re-running it produces no duplicate audit rows.

The job's output is a `ReconciliationReport` row written to a new
`reconciliation_reports` table:

```
table  reconciliation_reports
  id                  uuid          PK
  ran_at              timestamptz
  window_start        timestamptz
  window_end          timestamptz
  total_charges       decimal(14,2)
  total_refunds       decimal(14,2)
  total_transfers_out decimal(14,2)
  total_platform_fees decimal(14,2)
  drift_amount        decimal(14,2)
  drift_currency      text
  status              text          -- 'clean' | 'drift_detected' | 'failed'
  notes               text
```

OWNER sees this in the admin console as part of `/api/admin/finance/health`
(per `growth-project-backend/docs/admin/control-room-spec.md` §11.C).

---

## 8. Audit events

Every state-changing flow described above lands an `AuditLog` row. The
canonical action names:

| Action | When | Required metadata |
|---|---|---|
| `finance.charge.recorded` | Three (or one) ledger rows written for a `charge.succeeded` | `flow`, `org_id`, `head_coach_user_id`, `sub_coach_user_id`, `payout_split_pct_at_charge` |
| `finance.transfer.created` | Flow-B transfer row inserted in `pending` | `org_id`, `sub_coach_user_id`, `amount`, `idempotency_key` |
| `finance.transfer.succeeded` | Stripe webhook confirms transfer | `stripe_transfer_id` |
| `finance.transfer.failed` | Transfer create call returned 4xx/5xx after final retry | `failure_reason`, `retry_count` |
| `finance.transfer.held_for_review` | 24h since first failure with no recovery | `failure_reason` |
| `finance.refund.recorded` | Standard pro-rata refund processed | `refund_id`, `attribution_strategy='pro_rata'` |
| `finance.refund.platform_absorbed` | OWNER picked `platform_only` | `refund_id`, `explanation`, `actor_user_id` |
| `finance.refund.head_coach_absorbed` | OWNER picked `head_coach_only` | `refund_id`, `explanation`, `actor_user_id` |
| `finance.refund.sub_coach_only` | OWNER picked `sub_coach_only` | `refund_id`, `explanation`, `actor_user_id` |
| `finance.reconciliation.run` | Daily job started | `window_start`, `window_end` |
| `finance.reconciliation.clean` | Daily job finished with no drift | `total_charges`, `total_refunds` |
| `finance.reconciliation.drift_detected` | Daily job found drift | `drift_amount`, `drift_currency` |
| `finance.org.billing_flow_changed` | OWNER migrated an org from Flow A to Flow B (or back) | `org_id`, `from_flow`, `to_flow`, `migration_id` |

The audit log is append-only per the existing `AuditService` pattern.
No row is ever deleted or modified.

---

## 9. Migration: switching an org's billing flow

Switching from Flow A to Flow B (or back) is a multi-step migration:

1. OWNER initiates from the admin console with a typed reason
   (`finance.org.billing_flow_changed.requested` audit row).
2. New offers are blocked from sale during the migration window.
3. Existing subscriptions are migrated:
   - **A → B**: each sub-coach's subscriptions are transferred to the
     head coach's Connect account using Stripe's `subscriptions.update`
     with the new `transfer_data.destination`. This requires customer
     re-confirmation in some jurisdictions; the migration assistant
     surfaces the consent prompt where required.
   - **B → A**: the reverse — subscriptions move from the head coach's
     account to each sub-coach's account.
4. In-flight charges (started but not yet captured) are allowed to
   complete on the **old** flow.
5. Once all subs are migrated and no in-flight charges remain, the
   org's `billing_flow` flips and offers can be sold again.

The migration runs in the background; mobile shows a banner on the Org
tab "Billing flow change in progress" while it runs.

A B → A migration can leave dangling balances on the head coach's
Connect account (revenue collected before migration, sub-coach's share
not yet transferred). The migration completes only when all such
balances have been transferred. The reconciliation job verifies this
on the next daily run.

---

## 10. Acceptance criteria

A runtime PR closing this spec is accepted when:

1. The data model from §2 is migrated. New columns are nullable on
   existing rows so the migration does not require a backfill window.
2. Offer create / update endpoints accept `payout_owner_user_id`,
   `payout_split_pct`, `payout_destination` and validate the org's
   billing flow consistency (no Flow-B offer in a Flow-A org and vice
   versa). Validation is via Zod `refine`.
3. The Stripe checkout session creator (PR #117) is extended to set
   `transfer_data.destination` per the §3.1 / §3.2 rules, plus the
   `application_fee_amount`.
4. The webhook handler for `charge.succeeded` writes three ledger rows
   (or one for solo) with `attributed_role`, `attributed_amount`,
   `payout_split_pct_at_charge`, and the relevant org/head/sub user
   ids. Banker's rounding helper added to `backend/src/common/money.ts`.
5. The Flow-B transfer worker is implemented as a retryable job. Three
   retries with exponential backoff, then `held_for_review`. Idempotency
   key matches §3.2.
6. `stripe_transfers` table created. State machine
   `pending → succeeded | failed | reversed` enforced.
7. The four refund-attribution strategies are implemented as pure
   functions in `backend/src/billing/refund-attribution.ts`. Each is
   exhaustively unit-tested against the rounding-sum invariant.
   `pro_rata` is the only path the standard refund endpoint allows.
8. Reconciliation job lands in `backend/src/billing/reconciliation.job.ts`
   with the §7 contract. Runs at 02:00 UTC via the existing scheduler.
   Drift detection ≤ 1 cent per currency (zero drift expected — the
   1-cent allowance is for Stripe's own rounding boundary cases).
9. All audit actions from §8 land on `AuditLog`. Audit-on-write tests
   exist for each.
10. The `org.billing_flow_changed` migration is implemented behind an
    OWNER-only endpoint. Tested with a fixture migration (A → B and
    B → A).
11. `backend/docs/MONEY.md` is updated to reference this spec under "Locked-down
    write surfaces" and the new endpoints are added to the table.
12. No `parseFloat`, no `Number` coercion of money values in the runtime
    PR. All money flow is `Decimal(14,2)` end-to-end. The interceptor's
    output-converter walk applies to the org-revenue endpoints
    described in `finance-org-roll-ups.md`.
13. Sentry tags include `org_id` and `billing_flow` on every billing
    error so flow-correlated incidents are filterable.
14. The runtime PR ships behind a feature flag `org_billing_v1` in
    **off** state. Backend Wave 2 sub-coach hierarchy must be on `main`
    before the flag is enabled.

---

## 11. Out of scope

- **Per-sub-coach 1099 / tax form generation.** A future surface
  (`docs/billing/tax-forms.md`) will spec it once the org has enough
  paid sub-coaches to warrant it. Until then, head coaches are
  responsible for issuing tax forms to their sub-coaches under the
  contractor agreement.
- **Multi-currency org normalisation.** §6 documents the constraint.
- **Marketplace-wide search/discovery affecting splits.** Owned by
  `tgp-finance-app/docs/specs/storefront-marketplace/06-coach-marketplace-discovery.md`
  (PR #108 §06). Splits do not feed into the marketplace ranker.
- **Affiliate/referral attribution alongside sub-coach split.** When an
  affiliate brings a client to a sub-coach offer, the affiliate
  commission is computed first, then the sub-coach split applies to
  the residual. The detailed interaction is owned by
  `tgp-finance-app/docs/specs/storefront-marketplace/05-affiliate-referral-dashboards.md`
  (PR #108 §05). This spec only states that the order of operations is
  affiliate-first, sub-coach-second.
- **Coach-funded vs platform-funded rewards/bounties** that interact
  with the split. Owned by PR #108 §09. The interaction note: a
  bounty paid to a sub-coach is recorded as a separate ledger row,
  not as part of the split.
- **Public coach profile revenue display.** Owned by `growth-project-backend`
  PR #92 brief 16 (public coach profile). Revenue is never shown
  publicly; only on the head-coach's `OrgRevenueRollUp` mobile screen
  is org revenue visible, and only to the head coach themselves.
