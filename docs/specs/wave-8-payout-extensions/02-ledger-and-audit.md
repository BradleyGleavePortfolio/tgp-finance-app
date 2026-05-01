# 02 — Ledger and audit (the canonical money record)

> **Status:** draft, documentation-only.
>
> This is the foundation. Every subsequent spec writes through the
> contract defined here. Read this before any other Wave 8 spec.

## 0. Cross-repo dependencies

- `backend/docs/MONEY.md` — the existing in-repo money doctrine.
  Wave 8's wire shape **extends** it for platform-side rails.
- Wave 5 (PR #109) `docs/billing/sub-coach-billing-split-spec.md` §4
  — declares a split row but defers the table shape; this spec
  defines the table.

## 1. WHY append-only

A coach's revenue, a sub-coach's share, an affiliate's accrual, a
refund, a chargeback, and a reward credit are **all events**. The
right substrate for events is an append-only table.

Mutability invariants we get for free:

- A reversal is a new row, never a row update. The original entry
  is preserved verbatim — every audit trail can replay history.
- A reconciliation drift is an alert, not a `SET balance =`
  surgery. The ledger is reconciled by **adding** rows, not by
  rewriting them.
- A migration is forward-compatible. Adding a column to
  `ledger_entries` does not invalidate historical rows.

Mutable-balance schemas (e.g. `coach_balances` with an `amount`
column updated on every charge) are a known anti-pattern in
platform-side money rails. They are simpler to query but they
cannot be replayed, audited, or reconciled without the very append
log we'd be missing. Appending is non-negotiable.

## 2. Conceptual model

Every cash event in the platform is one or more `ledger_entries`
rows. A row has:

- A **direction** — credit or debit, signed.
- A **counterparty** — the user, org, or platform balance affected.
- An **effect kind** — what the platform meant by the event
  (purchase, sub-coach split, affiliate commission, reward grant,
  refund, chargeback, fee, adjustment).
- A **parent transaction id** — every related row in the same money
  event shares the same parent id. Sums on the parent **must net to
  zero** within a currency.

A purchase of \$100 by a client of a Flow-B head coach with a 70/30
split, with an affiliate referral on a 10% commission, looks like:

| direction | counterparty | effect_kind | amount |
|---|---|---|---|
| credit | platform | application_fee | 5.00 |
| credit | head_coach (acct H) | charge_net | 95.00 |
| debit  | head_coach (acct H) | sub_coach_share | 28.50 |
| credit | sub_coach (acct S) | sub_coach_share | 28.50 |
| debit  | platform | affiliate_commission | 9.50 |
| credit | affiliate (acct A) | affiliate_commission | 9.50 |

Sum: `+5 +95 -28.50 +28.50 -9.50 +9.50 = +100` over the **client's
side**, and `-100` for the client (a separate row recorded against
the client when their card is charged externally — out of scope for
the platform-side ledger; the platform-side ledger nets to **zero**
as a closed system).

## 3. Schema

```
table  ledger_entries
  id                          uuid          PK
  parent_transaction_id       uuid          NOT NULL  -- group key
  direction                   text          'credit' | 'debit'   NOT NULL
  counterparty_kind           text          'platform' | 'coach' | 'sub_coach' | 'affiliate' | 'reward_recipient' | 'client'
  counterparty_user_id        uuid          NULL  -- null for 'platform'
  effect_kind                 text          see §3.1               NOT NULL
  amount                      numeric(14,2) NOT NULL  -- always positive; direction carries sign
  currency                    text          'USD' v1               NOT NULL
  reference                   jsonb         NOT NULL  -- e.g. {stripe_charge_id, offer_id, application_id}
  posted_at                   timestamptz   NOT NULL  -- when the platform recorded
  effective_at                timestamptz   NOT NULL  -- when the money moved (often = posted_at; differs for backdated reversals)
  source_event_id             uuid          NOT NULL  -- inbox row id; ties to webhook
  idempotency_key             text          NOT NULL UNIQUE  -- inbound Idempotency-Key
  created_at                  timestamptz   NOT NULL DEFAULT now()

  CONSTRAINT direction_check CHECK (direction IN ('credit','debit'))
  CONSTRAINT amount_positive CHECK (amount >= 0)
  CONSTRAINT no_update_no_delete  -- enforced by RLS + a forbid-update trigger
```

Indexes:

- `(parent_transaction_id)` — read every row of a transaction in
  one query.
- `(counterparty_user_id, posted_at DESC)` — coach payout report.
- `(posted_at)` — reconciliation against Stripe Balance
  Transactions.
- `(idempotency_key)` UNIQUE — replay-safety.
- `(reference->>'stripe_charge_id')` — lookup by Stripe id.

### 3.1 `effect_kind` (closed enum)

Closed enum, validated at the application boundary by a Zod schema
in `payouts/ledger/effects.ts`:

```
'charge_gross'           ← client paid (credit to platform balance)
'application_fee'        ← platform's cut
'charge_net'             ← what's left after fee, credit to coach
'sub_coach_share'        ← reciprocal pair (debit head, credit sub)
'affiliate_commission'   ← reciprocal pair (debit platform, credit affiliate)
'reward_grant_liability' ← non-cash; debit funder, credit reward_recipient
'reward_grant_redemption'← non-cash; reward_recipient debit, credit liability
'refund_gross'           ← client refunded (debit platform balance)
'refund_fee_reversal'    ← reverse the application_fee
'refund_net_reversal'    ← reverse charge_net
'refund_split_reversal'  ← reverse sub_coach_share pair
'refund_affiliate_clawback'
'chargeback_hold'        ← funds held during dispute
'chargeback_lost'        ← dispute lost; same shape as refund cascade
'chargeback_won'         ← dispute won; reversal of the hold
'manual_adjustment'      ← OWNER-only; requires reason ≥ 20 chars
```

Adding a new effect kind requires a migration **and** an update to
the doctrine pin `payouts-ledger-invariants.spec.ts`.

## 4. Append-only enforcement

Three layers:

- **RLS** — Postgres row-level security policy permits `INSERT` only
  on `ledger_entries` for the application role; `UPDATE` and
  `DELETE` are revoked.
- **Trigger** — a `forbid_update_or_delete_on_ledger_entries`
  trigger raises an exception on any `UPDATE` or `DELETE` (covers
  any privileged role that bypasses RLS).
- **Application** — `LedgerService.append()` is the only writer;
  it has no `update()` or `delete()` method.

A reversal is a new entry with the matching `parent_transaction_id`
and the opposite direction. The `effect_kind` carries `_reversal` /
`_clawback` to distinguish (see §3.1).

## 5. Reconciliation invariants

The doctrine pin `payouts-ledger-invariants.spec.ts` asserts:

1. **Zero-sum per transaction per currency.**

       Σ (direction == 'credit' ? +amount : -amount)
         OVER  parent_transaction_id, currency
       = 0  ± 0.005    -- two-decimal rounding tolerance

2. **No row has been updated.** A query for
   `xmin != xmin_at_insert` returns zero rows (Postgres-internal,
   asserted via a copied `xmin_at_insert` column on a sample of
   recent rows).

3. **Every row has a non-null `source_event_id`** that resolves to
   an inbox row.

4. **Every refund / chargeback row's `parent_transaction_id`
   resolves to a non-refund parent transaction whose net is the
   refund's amount or less.** (You cannot refund more than was
   charged.)

5. **`effect_kind` ∈ closed enum.** A query for any unknown value
   returns zero rows.

These are runtime-asserted on every reconciliation tick
(`08-reconciliation-and-payouts.md` §3) and CI-asserted by the
doctrine pin.

## 6. Audit

Audit is a separate table that records **who** caused a ledger
event, not what happened (the ledger is the source of truth for
*what*). The shape mirrors the existing
`backend/src/system/audit-events.service.ts` pattern.

```
table  payout_audit_events
  id                       uuid          PK
  ledger_entry_id          uuid          NULL  -- null for state-machine events
  parent_transaction_id    uuid          NULL  -- duplicates ledger column for indexed lookup
  actor_user_id            uuid          NULL  -- null for system / webhook
  actor_kind               text          'user' | 'system' | 'webhook' | 'owner'
  acted_by_member_user_id  uuid          NULL  -- Wave 5/8 ORG mode: per-staff attribution
  action                   text          e.g. 'connect_started', 'refund_initiated', 'cascade_executed', 'fraud_block', 'manual_adjustment'
  before                   jsonb         NULL  -- frozen state pre-action
  after                    jsonb         NULL  -- frozen state post-action
  reason                   text          NULL  -- ≥ 20 chars on OWNER actions
  ip_address               inet          NULL
  user_agent               text          NULL
  posted_at                timestamptz   NOT NULL DEFAULT now()
```

The audit table is **also** append-only (same RLS + trigger).

OWNER actions on the refund admin and fraud queue **must** carry a
`reason` ≥ 20 chars; the API guard rejects shorter payloads with
`400 REASON_TOO_SHORT`.

## 7. Privacy / security

| Field | PII? | Logged? | Notes |
|---|---|---|---|
| `amount`, `currency` | yes (transactional money) | Sentry breadcrumbs only redacted | **Never** sent to PostHog. PostHog event taxonomy uses bands (`amount_band: '0-50' | '50-200' | '200-1000' | '1000+'`). |
| `counterparty_user_id` | yes | yes (event userid is allowed) | Standard tenant scoping. |
| `reference->>'stripe_charge_id'` | yes (external id) | no | redacted in PostHog; surfaced in OWNER admin only. |
| `source_event_id` | no | yes | useful for tracing. |
| `idempotency_key` | no | no | redacted. |

The reconciliation job **must not** leak amounts to logs; it logs
**count of rows** and **net of currency** as a single number.

## 8. Wire shape

Endpoints in `payouts/ledger/*` (OWNER only) return:

```json
{
  "id": "uuid",
  "parent_transaction_id": "uuid",
  "direction": "credit",
  "counterparty": { "kind": "coach", "user_id": "uuid" },
  "effect_kind": "charge_net",
  "amount": "95.00",
  "currency": "USD",
  "reference": { "stripe_charge_id": "ch_..." },
  "posted_at": "2026-05-01T15:32:11Z",
  "effective_at": "2026-05-01T15:32:11Z"
}
```

Money is a string. The `DecimalToNumberInterceptor` is opted out via
`@SkipDecimalNormalisation()` (the same decorator declared by
Wave 5; this is a **reused** placeholder).

## 9. State-transition table

Ledger entries themselves are not state machines (they're events).
The **parent transaction** is. The closed enum:

```
parent_transaction_status ∈ {
  'pending', 'posted', 'partially_refunded', 'fully_refunded',
  'disputed', 'chargeback_lost', 'chargeback_won', 'voided'
}
```

| From | To | Trigger |
|---|---|---|
| (none) | `pending` | Checkout intent created (PR #108 §03). |
| `pending` | `posted` | `payment_intent.succeeded` webhook + ledger entries inserted. |
| `pending` | `voided` | `payment_intent.payment_failed` or 24-h expiry. |
| `posted` | `partially_refunded` | refund < gross. |
| `posted` | `fully_refunded` | refund == gross. |
| `posted` | `disputed` | `charge.dispute.created`. |
| `disputed` | `chargeback_lost` | dispute closed against us. |
| `disputed` | `chargeback_won` | dispute closed in our favour. |
| any non-terminal | `voided` | OWNER manual void with reason ≥ 20 chars. |

Status is **derived** from the ledger; we cache it in
`parent_transactions` (a small companion table) for query speed but
the cache is recomputable from the ledger at any point.

## 10. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | A migration accidentally adds an `UPDATE` on `ledger_entries` | the trigger raises; CI fails on the migration test | the doctrine pin includes a migration scanner that greps for `UPDATE ledger_entries` in `prisma/migrations/` |
| 2 | A controller calls Prisma directly and inserts a row that doesn't sum to zero on its parent | the reconciliation invariant flags drift on the next tick | `LedgerService.append()` is the sole writer; a code-grep doctrine pin asserts no other file calls `prisma.ledgerEntries.create` |
| 3 | A duplicate idempotency key would cause a duplicate row | `(idempotency_key)` UNIQUE constraint raises | the IdempotencyService catches the unique violation and returns the original 200 |
| 4 | Stripe sends a fee value with a decimal trailing zero (e.g. 5.0) and Postgres rounds inconsistently | reconciliation invariant catches a 0.01 drift | banker's-rounding helper (`backend/src/common/money.ts`, reserved-name placeholder per Wave 5) is the only multiplier used; rounding is applied at the attribution boundary, not later |
| 5 | A webhook arrives after a manual reversal already posted | inbox dedupe catches the same `event.id`; if a re-emitted event arrives, the parent is already in `voided`/`fully_refunded` | append-only nature means no row is harmed; the inbox handler logs a no-op |
| 6 | A reconciliation job runs while a long-running write is in flight | snapshot isolation in Postgres covers it; the invariant uses a single transaction read | the runtime PR uses `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` for the invariant pass |

## 11. Acceptance criteria

- [ ] `ledger_entries` table exists with the columns + constraints +
  trigger above.
- [ ] `LedgerService.append()` is the only writer (asserted by a
  doctrine pin grep).
- [ ] The five reconciliation invariants run on every tick and
  on every PR-W8-* CI build.
- [ ] No row in any non-OWNER endpoint response carries an amount
  to a non-coach counterparty.
- [ ] PostHog event taxonomy uses bands, not amounts.
- [ ] Migration is additive only; no drops.
- [ ] `payout_audit_events` exists and is append-only.

## 12. Out-of-scope (explicit)

- A `coach_balances` materialised view. (Out of scope for v1; a
  read-side cache is added in `08-reconciliation-and-payouts.md`
  §3 against the ledger, not as a separate write surface.)
- A double-entry / triple-entry accounting library
  (`accounting.js`, etc). The schema above is double-entry; an
  external library does not pay rent.
- A historical-data backfill — the ledger starts at
  `PR-W8-1` deploy date. Pre-Wave-8 events are not in the ledger;
  they are reconstructed from Stripe Balance Transactions if
  needed.
- A separate "gross / net" ledger column. The closed enum names
  carry the distinction.
