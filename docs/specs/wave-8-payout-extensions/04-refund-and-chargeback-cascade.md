# 04 — Refund and chargeback cascade

> **Status:** draft, documentation-only.
>
> This spec defines the deterministic cascade that runs whenever a
> refund or chargeback fires. It declares five strategies (one
> default + four OWNER-only); the four OWNER-only strategies require
> compliance reviewer sign-off before runtime PR `PR-W8-4` ships.

## 0. Cross-repo dependencies

- Wave 5 (PR #109) §5 declared the cascade exists; this spec is the
  mechanism.
- `02-ledger-and-audit.md` §3.1 — closed `effect_kind` enum
  (specifically the `refund_*`, `chargeback_*` rows the cascade
  inserts).
- PR #108 §03 — checkout's refund/dispute state machine. This
  cascade *consumes* the trigger; the state machine surfaces it.

## 1. WHY a cascade

A purchase often spawns multiple ledger rows — application fee, net
charge to coach, sub-coach split, affiliate commission, reward
liability. A refund is **not** a single reversal row; it is the
reverse of every original row, optionally proportional, optionally
partial. The mapping is deterministic but non-obvious enough that
inlining it in every refund-trigger site is unsafe.

The cascade engine takes:

- The parent_transaction_id.
- The refund amount (or "full").
- The strategy (default `pro_rata`).

And produces a fixed list of new `ledger_entries` rows with the
`refund_*` or `chargeback_*` `effect_kind`.

## 2. Strategies

Five enumerated strategies. The default is `pro_rata`. The four
OWNER-only strategies require a `reason` ≥ 20 chars and audit-log
the OWNER who acted.

### 2.1 `pro_rata` (default)

Refund is split across every original credit recipient in proportion
to their share of the original transaction. This is the only
strategy enabled by default.

Example: original $100 transaction had platform $5, head coach $66.50,
sub-coach $28.50; $20 refund:

- Platform absorbs `5 / 100 × 20 = 1.00`.
- Head coach absorbs `66.50 / 100 × 20 = 13.30`.
- Sub-coach absorbs `28.50 / 100 × 20 = 5.70`.
- Affiliate absorbs `0 / 100 × 20 = 0` (no affiliate on this row).
- Banker's rounding to 2 dp; any rounding residue lands on the
  platform row.

Affiliate commissions follow the source: if the original transaction
had a $9.50 affiliate commission, the cascade also generates a
`refund_affiliate_clawback` row of `9.50 / 95.00 × 20 = 2.00` (the
denominator is the **net** to coach, since the commission is computed
off the coach's net per `05-affiliate-payouts.md` §3).

### 2.2 `platform_only` (OWNER-only)

Platform absorbs the entire refund. Coach, sub-coach, affiliate are
held whole. Used when the refund is platform-fault (e.g. checkout
bug, double-charge, marketing miscommunication owned by the platform).

### 2.3 `head_coach_only` (OWNER-only)

Head coach absorbs the entire refund. Sub-coach, affiliate, platform
are held whole. Used when the refund is head-coach-driven (e.g. head
coach delivered the wrong scope of service, cohort cancelled by head
coach).

### 2.4 `sub_coach_only` (OWNER-only)

Sub-coach absorbs the entire refund. Used when the refund is
sub-coach-driven and the head coach has already absorbed a
disciplinary share off-platform.

### 2.5 `affiliate_only` (OWNER-only)

Affiliate's commission is fully clawed back; coach side is held whole.
Used when the affiliate engaged in self-referral or violated FTC
disclosure.

## 3. State-transition table

The cascade itself is a single atomic transaction; the parent
transaction's status moves once, the ledger inserts happen as a
batch.

| From (parent_transaction_status) | To | Trigger |
|---|---|---|
| `posted` | `partially_refunded` | refund amount < gross |
| `posted` | `fully_refunded` | refund amount == gross |
| `partially_refunded` | `partially_refunded` | another partial refund (bumps the running total in the cache) |
| `partially_refunded` | `fully_refunded` | running total + new refund == gross |
| `posted` | `disputed` | `charge.dispute.created` (no cascade rows yet — funds held) |
| `disputed` | `chargeback_lost` | dispute closed against us → cascade runs in chargeback mode |
| `disputed` | `chargeback_won` | dispute closed in our favour → no cascade; pending hold is reversed |
| `chargeback_lost` | (terminal) | no further refunds permitted; OWNER manual adjustment only |
| `fully_refunded` | (terminal) | same |
| `voided` | (terminal) | refund attempts return `409 PARENT_VOIDED` |

## 4. Cascade algorithm

```
function cascade(parentTxId, refundAmount, strategy, actor):
  parent = LedgerService.read(parentTxId)
  assert parent.status in {posted, partially_refunded, disputed}
  assert refundAmount > 0 and refundAmount + parent.refundedSoFar <= parent.gross

  rows = []
  switch strategy:
    case 'pro_rata':
      for each non-platform credit in parent:
        share = (credit.amount / parent.gross) * refundAmount
        rows.push(reversal(credit, share))
      // platform absorbs the rounding residue
      residue = refundAmount - sum(rows.amount) - platform.share
      rows.push(reversal(parent.application_fee, platform.share + residue))
    case 'platform_only':
      rows.push(reversal(parent.application_fee, refundAmount, platform_absorbs=true))
    case 'head_coach_only':
      rows.push(reversal(parent.charge_net, refundAmount))
    case 'sub_coach_only':
      rows.push(reversal(parent.sub_coach_share, refundAmount))
    case 'affiliate_only':
      rows.push(reversal(parent.affiliate_commission, parent.affiliate_commission.amount))

  // affiliate clawback on the proportional path
  if strategy == 'pro_rata' and parent.has_affiliate_commission:
    clawback = (parent.affiliate_commission.amount / parent.charge_net.amount) * refundAmount
    rows.push(clawback_pair(parent.affiliate_commission, clawback))

  // reward liability reversal
  if strategy in {'pro_rata','platform_only'} and parent.has_reward_liability:
    rows.push(reward_liability_reversal(parent.reward_liability, /* same proportion or full */))

  audit = AuditService.append({
    action: 'cascade_executed',
    actor: actor,
    parent_transaction_id: parentTxId,
    strategy: strategy,
    before: { status: parent.status, refundedSoFar: parent.refundedSoFar },
    after:  { status: newStatus, refundedSoFar: parent.refundedSoFar + refundAmount },
  })

  LedgerService.appendBatch(rows, parent_transaction_id=parentTxId)
  return rows
```

Atomicity: the batch insert + status cache update + audit row run in
one Postgres transaction. The reconciliation invariants
(`02-ledger-and-audit.md` §5) re-run on the new parent total.

## 5. Chargeback path

A chargeback (Stripe `charge.dispute.created`) is a *contested* refund
initiated by the cardholder's bank. The handler differs from a refund:

1. On `dispute.created`, the platform inserts a `chargeback_hold`
   ledger row for the gross amount, against the platform balance
   (Stripe holds the funds, mirrored on our side).
2. The parent transaction moves `posted → disputed`. **No cascade
   runs yet.**
3. We submit evidence per Stripe's dispute API (out-of-band UI,
   OWNER queue card).
4. On `dispute.closed`:
   - If `status == lost`: the `chargeback_hold` is converted to
     `chargeback_lost` and the cascade runs as if it were a
     `pro_rata` refund of the gross amount, **plus** a fixed Stripe
     dispute fee ($15 USD by default) recorded as a separate
     `manual_adjustment` row attributed to the platform.
   - If `status == won`: the `chargeback_hold` is reversed; no
     cascade. The dispute fee is **not** charged on win.

The hold row is **not** a refund — it does not move money to the
client; it freezes the platform balance against the dispute. Stripe
governs the actual fund movement; our ledger mirrors it.

## 6. API surface

```
POST  /api/v1/payouts/refunds
  body: {
    parent_transaction_id: uuid,
    amount?: { amount: string, currency: string },  // omit for full
    strategy?: 'pro_rata' | 'platform_only' | 'head_coach_only' | 'sub_coach_only' | 'affiliate_only',
    reason?: string,                                 // ≥ 20 chars; required when strategy != 'pro_rata'
  }
  → 200 {
    refund_id, parent_transaction_id, status,
    ledger_rows_inserted: int,
    new_parent_status: 'partially_refunded' | 'fully_refunded',
  }
  → 400 REASON_TOO_SHORT      (non-default strategy without reason)
  → 403 STRATEGY_NOT_PERMITTED (caller is not OWNER)
  → 409 PARENT_VOIDED
  → 422 REFUND_EXCEEDS_GROSS

POST  /api/v1/payouts/refunds/preview      (dry-run; OWNER and head_coach allowed)
  body: same as above
  → 200 { rows_that_would_be_inserted: [...], net_per_counterparty: {...} }

GET   /api/v1/payouts/refunds/:id          (OWNER and parties)
  → 200 { ... full refund + cascade rows ... }
```

`Idempotency-Key` required on POST (`03-idempotency-and-events.md` §2).

## 7. Compliance gate

The four non-default strategies (`platform_only`, `head_coach_only`,
`sub_coach_only`, `affiliate_only`) cannot ship to runtime until the
consumer-finance compliance reviewer who signed off on PR #106 §09
**also** signs off on the cascade copy (the `reason`-prompt copy in
the OWNER admin UI, the receipt language to the affected coach, the
audit-trail visibility to the head coach). This sign-off is recorded
in the runtime PR (`PR-W8-4`) description.

The default `pro_rata` strategy is uncontroversial and ships in
`PR-W8-3` without the additional gate.

## 8. Privacy / security

| Surface | Notes |
|---|---|
| Affiliate-clawback receipt | The affiliate sees the clawback amount but **not** the original client's identity beyond what is already visible per PR #108 §04 attribution. |
| Sub-coach absorption receipt | Sub-coach sees the share absorbed; head coach decision is named in the audit row but the head coach's reason text is **not** shown to the sub-coach by default. OWNER can override visibility on the runbook. |
| Refund initiated by client (via PR #108 §03 receipt) | Self-service refund window is 14 days for `one_time_program`, 0 days for `subscription` (next-cycle cancel only); strategies are restricted to `pro_rata`. OWNER paths can override. |
| PostHog | Refund event carries `amount_band`, `strategy`, `was_partial` — never the raw amount. |

## 9. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | Refund amount exceeds remaining unrefunded gross | guard returns `422 REFUND_EXCEEDS_GROSS` | invariants double-check on cascade insert; transaction rolls back if drift detected |
| 2 | Pro-rata residue creates a 1-cent imbalance | reconciliation invariant flags `0.005` tolerance breach | residue is **always** absorbed by the platform row; the runtime test asserts this against the residual |
| 3 | OWNER attempts non-default strategy without `reason` | guard returns `400 REASON_TOO_SHORT` | reason field is on the OWNER admin UI; required-field validation server-side |
| 4 | Affiliate has been clawback-disabled (Connect dissolved) | clawback ledger pair refers to a `dissolved` Connect account | clawback row still inserts (ledger is the truth); the actual Stripe Transfer Reversal is held in outbox `errored`; OWNER queue surfaces |
| 5 | Reward liability has already been redeemed when refund fires | cascade's `reward_grant_redemption` reversal would underflow | reward-redemption check: if the reward has been redeemed, the refund **does not** reverse the reward grant; the reward stays granted; the platform absorbs the difference (logged as `manual_adjustment` with a system-generated reason) |
| 6 | Race: two refund requests on the same parent_transaction at the same instant | `SELECT ... FOR UPDATE` on the parent_transactions cache row | second request waits; if it would breach gross, returns 422 |
| 7 | Stripe `charge.refunded` webhook arrives after we already cascaded (rare) | inbox dedupe catches; ledger UNIQUE on idempotency_key catches | handler is a no-op; we already wrote the cascade |

## 10. Acceptance criteria

- [ ] Default `pro_rata` cascade runs for every PR-W8-3 test case in
  the runtime spec.
- [ ] Five strategies exist as a closed TypeScript union; doctrine
  pin asserts.
- [ ] Non-default strategies are gated behind the
  `OWNER_REFUND_STRATEGIES` flag and the `RoleGuard` for `owner`.
- [ ] Pro-rata cascade is exact to two decimal places; rounding
  residue lands on platform.
- [ ] Audit row is written on every cascade with `before`/`after`
  state.
- [ ] Doctrine pin `payouts-refund-cascade.spec.ts` runs in CI.
- [ ] Compliance sign-off captured in `PR-W8-4` description.

## 11. Out-of-scope (explicit)

- Per-line-item partial refunds within a multi-item cart (cart is
  out of scope for v1).
- Refund of a chargeback (Stripe handles the cardholder side; we
  cannot refund a charge that's already in a `chargeback_lost`
  terminal state).
- Currency conversion in the cascade (USD-only in v1; see
  `09-tax-and-multi-currency.md`).
- Per-coach default strategy override (head coaches use the
  platform default; OWNER picks otherwise).
