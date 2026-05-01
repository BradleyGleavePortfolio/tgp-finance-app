# 06 — Reward liability

> **Status:** draft, documentation-only.
>
> Rewards in PR #108 §08 are **non-cash** by design (status
> unlocks, free month, content unlock). This spec defines how the
> platform records the **liability** (so the books balance) without
> turning rewards into cash transmission.

## 0. Cross-repo dependencies

- PR #108 §08 (`08-rewards-bounties.md`) — declares the reward
  taxonomy: status, content unlock, free month. Closed trigger list.
  Per-reward $50 cap, per-coach $1k/month default cap.
- `02-ledger-and-audit.md` §3.1 — `reward_grant_liability`,
  `reward_grant_redemption` effect kinds.

## 1. WHY non-cash

The platform refuses to process cash bounties for two reasons:

1. **Money-transmitter avoidance.** Routing platform-funded cash to
   a client (where the client's coach decides who gets paid) makes
   the platform look like a money transmitter under FinCEN, NYSDFS,
   and parallel state regimes. The legal bar for that licence is
   high; we will not clear it for a v1 feature.
2. **Consumer-finance compliance line.** PR #106 §09 forbids
   outcome-based incentives and prize draws. A cash bounty is the
   most direct violation of that line.

So rewards are **content / status / time-credit** unlocks. The
platform funds time credits (e.g. free month) by extending an
existing subscription's `next_billing_date`. Coach-funded rewards
(e.g. unlock a coach's premium content board) deduct from the
coach's reward budget on the platform side; no money moves to the
client.

## 2. Reward taxonomy

Closed enum `reward_kind`:

| Kind | Funder | Effect | Stripe interaction |
|---|---|---|---|
| `status_badge` | platform | Cosmetic; UI badge on profile. | none |
| `content_unlock` | coach | Grants a `content_pass` row for a specific coach content board. | none (the content is already on Stripe-paid storage; no money moves) |
| `free_month` | platform OR coach (per offer) | Extends subscription's `next_billing_date` by 30 days; the next invoice's amount is reduced to 0. | Stripe `subscription.update` with a discount coupon for 100% off one cycle; or pause + resume |
| `priority_advance` | platform | Cosmetic; bumps user up in coach's priority waterfall (no money). | none |
| `wvs_level_up` | platform | Cosmetic; nudges Wealth Velocity Score level forward by one (with audit + opt-in flag). | none |

The `funder` decides which side of the ledger absorbs the
liability:

- `platform` → ledger pair: debit `platform`, credit
  `reward_recipient`.
- `coach` → ledger pair: debit `coach`, credit `reward_recipient`.

The amount is the **face value** of the reward in USD:

- `status_badge` — $0 (informational ledger row; useful for cap
  enforcement of "no more than 50 status_badges per coach per
  month"; counts but doesn't move money).
- `content_unlock` — face value = list price of the content board's
  pass (already in PR #108 §02 offer table). Capped at $50/reward.
- `free_month` — face value = the customer's monthly subscription
  price, capped at $50/reward. If the price is > $50, the reward is
  **rejected at grant time** (`422 REWARD_FACE_VALUE_EXCEEDS_CAP`).
- `priority_advance`, `wvs_level_up` — $0 informational rows.

## 3. Why a liability row at all

Even though no cash moves, recording a ledger row achieves three
things:

1. Makes per-coach and per-platform reward budget caps enforceable
   (`07-anti-fraud.md` §3.4 ties to the same numbers).
2. Creates the cost-of-platform line item OWNER needs for
   accounting (platform-funded rewards are an expense).
3. Lets the reconciliation invariant catch a missing or duplicated
   grant (the parent transaction nets to zero across funder + recipient).

## 4. Schema additions

The ledger schema in `02-ledger-and-audit.md` already covers
`reward_grant_liability` and `reward_grant_redemption`. This spec
adds two companion tables:

```
table  reward_caps
  id                       uuid          PK
  coach_id                 uuid          NULL  -- null = platform-wide cap
  reward_kind              text          NOT NULL  -- closed enum (above)
  per_grant_face_max       numeric(14,2) NOT NULL  -- e.g. 50.00
  per_month_total_max      numeric(14,2) NOT NULL  -- e.g. 1000.00 platform default
  effective_from           date          NOT NULL
  effective_until          date          NULL
  created_by               uuid          NOT NULL  -- OWNER user_id
  reason                   text          NOT NULL  -- ≥ 20 chars
  created_at               timestamptz   NOT NULL DEFAULT now()
```

```
table  reward_grants
  id                       uuid          PK
  trigger_kind             text          -- closed list per PR #108 §08
  trigger_payload          jsonb         NOT NULL
  reward_kind              text          NOT NULL
  funder                   text          'platform' | 'coach'
  funder_user_id           uuid          NULL  -- null for platform
  recipient_user_id        uuid          NOT NULL
  face_value               numeric(14,2) NOT NULL
  currency                 text          NOT NULL DEFAULT 'USD'
  ledger_parent_tx_id      uuid          NOT NULL  -- the parent txn the pair sits under
  status                   text          'granted' | 'redeemed' | 'expired' | 'voided'
  granted_at               timestamptz   NOT NULL
  redeemed_at              timestamptz   NULL
  expires_at               timestamptz   NULL
```

`reward_caps` rows are append-only (mirror of the ledger doctrine).
A new cap supersedes the previous via `effective_from`. This lets
the OWNER raise caps temporarily (audited).

## 5. Cap enforcement

At grant time, `RewardCapGuard`:

1. Reads the most recent applicable `reward_caps` row.
2. Sums `reward_grants.face_value` for the funder this calendar
   month (UTC).
3. If `sum + new_grant.face_value > per_month_total_max`, returns
   `429 REWARD_CAP_EXCEEDED`.
4. If `new_grant.face_value > per_grant_face_max`, returns
   `422 REWARD_FACE_VALUE_EXCEEDS_CAP`.

The grant ledger pair is **only inserted** after the cap guard
passes.

## 6. Redemption

A reward is **granted** when the trigger fires (e.g. savings streak
hits 30 days). It is **redeemed** when the recipient actually uses it:

- `content_unlock` — recipient opens the gated content board.
- `free_month` — Stripe processes the next invoice with the 100%-off
  coupon (the redemption row is inserted on the
  `invoice.payment_succeeded` webhook with $0 amount).
- `status_badge` / `priority_advance` / `wvs_level_up` —
  redemption is automatic at grant time (no separate action; the
  pair inserts both rows immediately).

`reward_grants.expires_at` is enforced by a daily sweep:

- `content_unlock` — 90 days default; configurable per reward.
- `free_month` — 60 days default; if the user's subscription has
  ended before redemption, the reward voids.

A voided reward inserts a `reward_grant_liability` reversal pair
(symmetric to the original grant).

## 7. API surface

```
POST  /api/v1/payouts/rewards/grant            (system or coach)
  body: {
    trigger_kind, trigger_payload,
    reward_kind, funder, funder_user_id?,
    recipient_user_id,
    face_value: { amount, currency },
    expires_at?: timestamp
  }
  → 200 { reward_grant_id, ledger_rows_inserted: 2 }
  → 422 REWARD_FACE_VALUE_EXCEEDS_CAP
  → 429 REWARD_CAP_EXCEEDED
  → 403 NOT_PERMITTED      (funder is not the calling user or system)

POST  /api/v1/payouts/rewards/redeem/:id       (recipient)
  → 200 { ok, redeemed_at, ledger_rows_inserted: 2 }
  → 410 REWARD_EXPIRED
  → 409 REWARD_ALREADY_REDEEMED

POST  /api/v1/payouts/rewards/void/:id         (OWNER or funder)
  body: { reason: string ≥ 20 chars }
  → 200 { ok }
  → 409 REWARD_ALREADY_REDEEMED  (cannot void a redeemed reward)

GET   /api/v1/payouts/rewards/by-coach?coach_id=...&since=...
  → 200 { granted: { count, face_value_total }, redeemed: { ... },
          expired: { ... }, by_kind: { ... } }
```

`Idempotency-Key` required on POSTs.

## 8. Privacy / security

- Recipient sees their own grants only.
- Coach sees their own grants funded; OWNER can read any.
- PostHog `reward_granted` event carries `kind`, `funder`,
  `face_value_band` (`0`, `0-50`, `>50` — last bucket should be
  empty given the cap, presence in it is itself an alert).
- Trigger payload may contain EOD-derived bands (e.g.
  `streak_length: 30`); never raw balances.

## 9. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | A reward grant ledger pair is inserted but the redemption row is missed (e.g. crash mid-handler) | reconciliation invariant catches the parent_tx not netting to zero on the next tick if redemption was supposed to be immediate | for kinds where grant + redemption are simultaneous, both rows are written in one Tx; CI fault-injection test asserts |
| 2 | Coach exceeds monthly cap mid-month due to OWNER raising the cap | `RewardCapGuard` re-reads on every grant; new cap takes effect immediately for prospective grants only | grants already inserted are not retroactively recomputed |
| 3 | A `free_month` reward is granted to a recipient with no active subscription | `422 NO_ACTIVE_SUBSCRIPTION_FOR_FREE_MONTH` at grant time | guard checks subscription state via PR #108 §03 service |
| 4 | Stripe coupon for `free_month` is malformed / not applied | `invoice.payment_succeeded` arrives with non-zero amount; reconciliation drift | runtime PR uses a static coupon ID per environment; OWNER alert if the coupon is missing in Stripe at startup |
| 5 | Reward is granted but the trigger event is later voided (e.g. savings was reverted) | trigger system emits `trigger_voided`; `RewardVoidJob` voids the grant if not yet redeemed | if redeemed, the reward is honoured (cannot reverse a content unlock retroactively); platform absorbs the difference (logged) |
| 6 | Cap is exceeded due to a race (two concurrent grants from a coach) | UNIQUE on `(funder_user_id, calendar_month, sum)` is impractical; use serialisable transaction or `SELECT ... FOR UPDATE` on a per-coach lock row | runtime PR uses an advisory lock keyed on `funder_user_id, YYYYMM` |

## 10. Acceptance criteria

- [ ] `reward_kind` is a closed TypeScript union (5 kinds).
- [ ] `RewardCapGuard` enforces both per-grant and per-month caps.
- [ ] No reward kind moves cash to a recipient. Doctrine pin asserts
  every grant ledger pair has `recipient_kind != 'platform'` and
  `effect_kind ∈ {reward_grant_liability, reward_grant_redemption}`.
- [ ] `free_month` redemptions are observable via
  `invoice.payment_succeeded` with $0; reconciliation invariant
  passes on the parent_tx.
- [ ] `reward_caps` table is append-only; new cap supersedes via
  `effective_from`.
- [ ] No reward kind in v1 is paid in cash.

## 11. Out-of-scope (explicit)

- Cash bounties (the original anti-money-transmitter argument).
- Per-client targeting (rewards are bucketed audiences only per
  PR #108 §08).
- A reward marketplace where coaches buy each other's rewards
  (deferred; runs into nested liability accounting).
- A "redeem any reward as cash" path. Fundamentally precluded by the
  money-transmitter argument.
