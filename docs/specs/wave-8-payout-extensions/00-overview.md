# 00 — Overview: Wave 8 finance payout extensions

> **One-line claim.** The finance app's append-only ledger,
> Stripe Connect onboarding, idempotency discipline, refund/chargeback
> cascade, affiliate accruals, reward liability accounting, anti-fraud
> rules, and reconciliation/payout reports — the payout rail under
> every Wave 5–10 money flow.

---

## 0. Cross-repo dependencies (hard)

| Dep | Where | Used by |
|---|---|---|
| Sub-coach hierarchy + `org_memberships` | `growth-project-backend/docs/product/sub-coach-hierarchy.md` (Wave 2) | `04-refund-and-chargeback-cascade.md` §3, `05-affiliate-payouts.md` §2 |
| Offer model + `payout_destination` | This repo, PR #108 §02 (`02-offers-and-checkout.md`) | `02-ledger-and-audit.md` §3, `04-refund-and-chargeback-cascade.md` §2 |
| Checkout + webhook idempotency | This repo, PR #108 §03 | `03-idempotency-and-events.md` §2 |
| Wave 5 sub-coach billing split | This repo, PR #109 (`docs/billing/`) | All of Wave 8 — Wave 8 implements the *mechanism* Wave 5 declared. |
| Affiliate model | This repo, PR #108 §04 | `05-affiliate-payouts.md` §1 |
| Rewards engine | This repo, PR #108 §08 | `06-reward-liability.md` §1 |

If any hard dependency has not landed when a runtime PR derived from
this set opens, the runtime PR pauses. Mirrored in repo-root
`PERP_HANDOFF.md`.

---

## 1. WHY

The finance app's existing `backend/docs/MONEY.md` doctrine pins the
**shape** of money in transit (Decimal(14,2), `MoneyAmount` Zod, the
`DecimalToNumberInterceptor`). That doctrine governs *member* money
(EOD reconciliation, payday, account balances). It does **not**
govern the platform-side rail that pays a coach, a sub-coach, an
affiliate, or a rewards recipient.

Every Wave 5–10 spec in this repo declares that platform-side rail
exists:

- Wave 5 declares the **split** between head-coach and sub-coach.
- Wave 9 (PR #108) declares the **storefront / offers / checkout**
  surfaces that originate the money.
- Wave 9 (PR #108 §04) declares **affiliate** commissions.
- Wave 9 (PR #108 §08) declares **non-cash rewards**.

But none of those specs declare the **rail under them**: the ledger,
Connect onboarding, idempotency rules, refund cascade, reconciliation
job, fraud rules, tax/multi-currency posture. Without that rail
specced, every runtime PR re-invents money safety and either gets it
wrong (silent double-credit, non-deterministic refund, unattributed
chargeback) or stalls indefinitely on operator anxiety.

**Wave 8 is the rail.** It is the spec a senior backend engineer
reads end-to-end before opening the first money-writing controller.

---

## 2. WHEN

| Trigger | What happens |
|---|---|
| A coach signs up to receive money | Connect onboarding (`01-connect-onboarding.md`) opens. |
| A client pays for an offer | Checkout (PR #108 §03) creates a `pending` ledger entry; webhook posts on confirmation (`02-ledger-and-audit.md`, `03-idempotency-and-events.md`). |
| A sub-coach earns a share | Split is recorded as a derived ledger entry on the same parent transaction (`02-ledger-and-audit.md` §3, Wave 5 split spec §4). |
| An affiliate referral converts | Commission is **accrued**, not paid, until hold period clears (`05-affiliate-payouts.md`). |
| A reward unlocks | A liability row records platform-funded vs coach-funded (`06-reward-liability.md`). No cash flow on unlock unless the reward is a paid item (e.g. free month) — then a credit is applied. |
| A refund fires | Cascade runs; affected ledger entries reverse (`04-refund-and-chargeback-cascade.md`). |
| A chargeback fires | Stripe `charge.dispute.created` runs the cascade in *dispute* mode (`04-` §5). |
| A daily reconciliation tick fires | Reconciliation job compares ledger to Stripe Balance Transactions (`08-reconciliation-and-payouts.md`). |
| A fraud rule trips | OWNER queue gets a row (`07-anti-fraud.md`). |
| A 1099-K threshold crosses | OWNER alert + Stripe-issued form link surfaced (`09-tax-and-multi-currency.md`). |

---

## 3. WHERE

```
backend/src/
  payouts/                              ← new (PR-W8-1)
    payouts.module.ts
    connect/
      connect.controller.ts             ← onboarding + status
      connect.service.ts                ← Stripe Connect API client
      kyc.state.ts                      ← state machine (closed enum)
    ledger/
      ledger.controller.ts              ← OWNER read endpoints
      ledger.service.ts                 ← append-only writer
      ledger.invariants.ts              ← reconciliation invariants
    idempotency/
      idempotency.guard.ts              ← reads `Idempotency-Key`
      idempotency.service.ts
      outbox.service.ts
      inbox.service.ts                  ← webhook dedupe
    refunds/
      refund.controller.ts
      refund.cascade.ts                 ← deterministic cascade
      refund.strategies.ts              ← 5 strategies (1 default + 4 OWNER)
    affiliates/                         ← new (PR-W8-5; sibling to PR #108 §04 storage)
      affiliate-accrual.service.ts
      affiliate-clawback.service.ts
      ftc-disclosure.constants.ts
    rewards/                            ← new (PR-W8-6)
      reward-liability.service.ts
      reward-cap.guard.ts               ← per-reward / per-coach caps
    fraud/                              ← new (PR-W8-7)
      rules/                            ← closed rule set
        chargeback-fraud.rule.ts
        self-referral.rule.ts
        deposit-cycling.rule.ts
        refund-abuse.rule.ts
        money-shape-leak.rule.ts
      fraud-queue.controller.ts         ← OWNER queue
      fraud-signal.service.ts
    reconciliation/                     ← new (PR-W8-8)
      reconciliation.job.ts             ← 02:30 UTC daily
      stripe-balance-transactions.client.ts
      reconciliation-report.controller.ts
    tax/                                ← new (PR-W8-9)
      tax-thresholds.service.ts         ← 1099-K $600 crossing
      stripe-tax.client.ts              ← ON/OFF gate
backend/prisma/migrations/
  YYYYMMDDHHMMSS_wave8_ledger/
  YYYYMMDDHHMMSS_wave8_idempotency/
  YYYYMMDDHHMMSS_wave8_connect/
  YYYYMMDDHHMMSS_wave8_affiliates_payout/
  YYYYMMDDHHMMSS_wave8_rewards_liability/
  YYYYMMDDHHMMSS_wave8_fraud/
  YYYYMMDDHHMMSS_wave8_reconciliation/
  YYYYMMDDHHMMSS_wave8_tax/
```

The mobile coach dashboard reads from
`/api/v1/payouts/{summary,by-period,upcoming}`. No member-side mobile
surface is added by Wave 8 directly — the existing read-only-balance
doctrine is preserved.

---

## 4. WHO

| Actor | Surfaces |
|---|---|
| **Coach** (solo) | Connect onboarding wizard; payout dashboard; refund initiation; affiliate payout accrual visibility. |
| **Head coach** (Wave 5 ORG mode) | Same as solo, plus sub-coach payout-share visibility (no PII). |
| **Sub-coach** | Connect onboarding (Flow A) or Connect destination (Flow B); own-share visibility. |
| **Affiliate** (a coach referring another coach) | Connect onboarding; accrued + paid commission visibility. |
| **Client** | No new surfaces. Receipts are PR #108 §03. |
| **OWNER** | Ledger query, refund admin, fraud queue, reconciliation drift alert, 1099-K alert. |
| **Compliance reviewer** | Sign-off gate on non-default refund strategies, on FTC disclosure copy, on tax / multi-currency OWNER decisions. |

---

## 5. WHAT

The deliverables of this set, by spec:

| Spec | Deliverable |
|---|---|
| `01-connect-onboarding.md` | Connect Express onboarding flow, capability matrix, KYC states, link rotation. |
| `02-ledger-and-audit.md` | `ledger_entries` schema, append-only invariants, audit table, reconciliation invariants. |
| `03-idempotency-and-events.md` | `idempotency_keys` table, Stripe webhook inbox, outbox, replay-safe handlers. |
| `04-refund-and-chargeback-cascade.md` | Refund/chargeback cascade across split + affiliate + reward; 5 strategies; state-transition table; ≥ 5 failure modes. |
| `05-affiliate-payouts.md` | Accrual, attribution window, hold period, clawback, FTC pin. |
| `06-reward-liability.md` | Coach-funded vs platform-funded liability, caps, money-transmitter avoidance. |
| `07-anti-fraud.md` | Closed rule set, signal table, OWNER queue. |
| `08-reconciliation-and-payouts.md` | Daily reconciliation job, payout report endpoints, capacity. |
| `09-tax-and-multi-currency.md` | Stripe Tax boundary, 1099-K tracking, OWNER decisions for currency. |
| `10-rollout-and-ops.md` | Flags, events, runbooks, PR-W8-1 .. PR-W8-9 sequence. |

---

## 6. HOW

The runtime PR sequence (one merge per row, all behind `OFF`-default
flags):

1. **PR-W8-1** — Ledger + audit + idempotency.
   - `ledger_entries`, `audit_events`, `idempotency_keys`, `inbox`,
     `outbox` tables.
   - `LedgerService.append()`, `IdempotencyService`, the webhook
     inbox.
   - Doctrine pin: `LedgerInvariantsSpec` (sum of effects on a
     transaction = 0; no row updates; only inserts).
2. **PR-W8-2** — Connect onboarding.
   - `connect_accounts` table; onboarding controller; webhook
     handlers for `account.updated`.
   - Doctrine pin: KYC state machine is a closed enum.
3. **PR-W8-3** — Refund cascade (default `pro_rata` only).
   - `RefundController`, the cascade engine, the four
     non-default strategies in code but **disabled**.
4. **PR-W8-4** — Refund cascade non-default strategies (compliance
   sign-off gate).
5. **PR-W8-5** — Affiliate payout accrual + clawback.
6. **PR-W8-6** — Reward liability.
7. **PR-W8-7** — Anti-fraud rules + OWNER queue.
8. **PR-W8-8** — Reconciliation + payout-report endpoints.
9. **PR-W8-9** — Stripe Tax + 1099-K threshold tracker.

Each PR carries:

- Module README updated in the same PR (per the README-per-PR rule
  in repo `CLAUDE.md`).
- Doctrine-pin spec extension (`backend/test/`) where the spec adds
  an invariant.
- Migration that is **additive only** — no column drops, no
  destructive backfills.
- Feature flag(s) in `OFF` state.
- `.env.example` entry for any new env var.

---

## 7. Architectural decisions

The decisions a future engineer will look back on. Each is recorded
once here and re-cited in the relevant downstream spec.

### 7.1 Ledger is the single source of truth — Stripe is the cross-check

The ledger records **intent**. Stripe records **execution**. The
reconciliation job (`08-reconciliation-and-payouts.md`) compares the
two. **Drift pages OWNER**; the ledger is never silently overwritten
by Stripe state. This is non-negotiable — without it, Stripe webhooks
become a write-side authority, and any webhook replay or
re-ordering corrupts our books.

### 7.2 Append-only — no row updates

`ledger_entries` is INSERT-only. No `UPDATE`, no `DELETE`. A reversal
is a new entry with negative effect. This makes replay deterministic
and lets the audit table be `(entity, action, before, after)` over
the same shape as the rest of the platform's `audit_events`.

### 7.3 Every money write carries an `Idempotency-Key`

Two layers:

- **Inbound** (client → us): every money-writing controller requires
  an `Idempotency-Key` header (UUIDv4). The `IdempotencyGuard`
  records the key + request hash; replays with the same key + hash
  return the original 200; replays with the same key + different
  hash return `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`.
- **Outbound** (us → Stripe): every Stripe API call that creates a
  charge / refund / transfer carries our own `Idempotency-Key`
  header to Stripe. We re-use the same key on webhook retries.

### 7.4 Refunds are deterministic

Five strategies:

1. `pro_rata` — default. Refund splits across platform fee,
   sub-coach share, affiliate commission, reward grant in proportion
   to original allocation.
2. `platform_only` — OWNER-only. Platform absorbs the refund.
3. `head_coach_only` — OWNER-only. Head coach absorbs.
4. `sub_coach_only` — OWNER-only. Sub-coach absorbs.
5. `affiliate_only` — OWNER-only. Affiliate's commission is fully
   clawed back; coach side is held whole.

Strategy is recorded on the refund row. **Compliance reviewer signs
off on every non-default strategy** before the runtime PR for
`PR-W8-4` ships.

### 7.5 Affiliates and rewards do not share split's attribution

Wave 5 attributes a charge across head-coach + sub-coach. Wave 8
adds **two parallel attribution dimensions** — affiliate commission
(if a referrer brought the client) and reward liability (if a reward
is granted on the same primitive). They write **separate ledger
entries** linked by `parent_transaction_id`. They do **not** mutate
the split's row. This keeps each cascade independently verifiable.

### 7.6 Anti-fraud is closed-rule + OWNER queue

No machine-learning model. No third-party fraud-score black box. Five
closed rules (`07-anti-fraud.md` §3), each explainable in plain
English on the OWNER queue card. The OWNER's actions on the queue are
audit-logged. A future ML-assist is reserved as `PR-W8-7-FOLLOWUP`
and is **out of scope** for v1.

### 7.7 Tax + multi-currency are OWNER decisions

This spec set documents the choices. The OWNER decides before
`PR-W8-9` opens. The default posture is:

- **Stripe Tax: ON** for US destinations on Connect Express
  Standard accounts. (OWNER decision.)
- **1099-K threshold: track at $600 USD/yr** (current US federal
  rule; state thresholds tracked separately).
- **Multi-currency: USD-only** in v1 — presentation and settlement
  both. (OWNER decision; recommendation: defer multi-currency to a
  Wave 11 PR.)

See `09-tax-and-multi-currency.md` for the full decision matrix.

---

## 8. Doctrine pin extensions

Wave 8 extends the existing doctrine pins. Each pin is a `*.spec.ts`
file under `backend/test/` that the runtime PR adds in the same
commit as the runtime code.

| New pin | Asserts |
|---|---|
| `payouts-ledger-invariants.spec.ts` | Sum of effects on a `parent_transaction_id` = 0 across `currency_code` and `posted_at` partitions; `ledger_entries` has no `UPDATE` / `DELETE` migrations. |
| `payouts-idempotency.spec.ts` | Every controller in `payouts/` requires `Idempotency-Key`; the guard returns the recorded body on replay. |
| `payouts-money-shape.spec.ts` | Every monetary column is `Decimal(14,2)`; every wire field is `{amount: string, currency: string}`. |
| `payouts-refund-cascade.spec.ts` | Default `pro_rata` cascade produces the five expected ledger entries; non-default strategies are gated on the `OWNER_REFUND_STRATEGIES` flag. |
| `payouts-fraud-rules.spec.ts` | The fraud rule set has exactly five rules; each carries an `explanation` string ≥ 1 sentence. |

These pins **extend** existing doctrine pins; they do not replace
them. If a Wave 8 runtime PR fails a pin, it fails CI.

---

## 9. Anti-scope (deliberately not in this set)

See `README.md` "Anti-scope". Restated here for clarity:

- Member-side balance writes. Read-only-for-member-balances doctrine
  is preserved.
- Direct bank rails. Stripe Connect Express only.
- Crypto, wire, ACH-direct.
- Multi-tier MLM affiliates.
- Cash bounties.
- Tax form generation UI (Stripe-emitted only).
- Public web payout dashboard.
- ML fraud assist.
- Multi-currency presentation in v1 (OWNER recommendation: defer).
