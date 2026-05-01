# 10 — Rollout and ops (flags, events, runbooks, PR sequence)

> **Status:** draft, documentation-only.
>
> This doc consolidates flags, analytics, healthy-signal table,
> runbooks, capacity, dashboards, and the runtime PR sequence for
> Wave 8.

## 1. Feature flags

All flags ship in `OFF` state. Each is global × per-coach (per the
Wave 1 doctrine in PR #91).

| Flag | Gates | Default |
|---|---|---|
| `PAYOUTS_LEDGER_V1` | All Wave 8 ledger writes. Master kill-switch. | OFF |
| `PAYOUTS_CONNECT_V1` | Connect onboarding flow. | OFF |
| `PAYOUTS_REFUND_DEFAULT_V1` | Default `pro_rata` cascade. | OFF |
| `PAYOUTS_REFUND_OWNER_STRATEGIES_V1` | Non-default cascade strategies. **Compliance gate.** | OFF |
| `PAYOUTS_AFFILIATE_ACCRUAL_V1` | Affiliate commission accrual + clawback. | OFF |
| `PAYOUTS_REWARD_LIABILITY_V1` | Reward grant + redemption ledger pairs. | OFF |
| `PAYOUTS_FRAUD_RULES_V1` | Anti-fraud rules engine. (`SHADOW`/`ENFORCE` per-rule.) | OFF |
| `PAYOUTS_RECONCILIATION_V1` | Daily reconciliation job. | OFF |
| `PAYOUTS_REPORTS_V1` | Payout dashboard + admin endpoints. | OFF |
| `PAYOUTS_TAX_V1` | Stripe Tax + 1099-K threshold tracker. | OFF |

A surface is "on" iff its flag is on globally **and** for the
specific coach. Doctrine pin from PR #91 applies.

## 2. PR sequence

| PR | Title | Adds | Depends on |
|---|---|---|---|
| `PR-W8-1` | `payouts(core): ledger + audit + idempotency` | `ledger_entries`, `payout_audit_events`, `idempotency_keys`, `inbox`, `outbox` tables; module skeleton; doctrine pins for invariants + idempotency. | none |
| `PR-W8-2` | `payouts(connect): Stripe Express onboarding` | `connect_accounts` table; KYC state machine; webhook subscription `account.updated`. | `PR-W8-1` |
| `PR-W8-3` | `payouts(refund): default pro_rata cascade` | `RefundController`; cascade engine (default only); state-transition table; doctrine pin. | `PR-W8-1`, PR #108 §03, PR #109 |
| `PR-W8-4` | `payouts(refund): OWNER strategies` | Non-default strategies behind the `OWNER_REFUND_STRATEGIES` flag. **Compliance sign-off in PR description.** | `PR-W8-3` |
| `PR-W8-5` | `payouts(affiliate): accrual + clawback` | Accrual lifecycle, hold periods, clawback, FTC pin, payout batcher. | `PR-W8-1`, PR #108 §04 |
| `PR-W8-6` | `payouts(rewards): liability accounting` | Reward kind enum, `reward_caps`, `reward_grants`, grant/redemption pairs. | `PR-W8-1`, PR #108 §08 |
| `PR-W8-7` | `payouts(fraud): rules + OWNER queue` | Five rules, fraud_signals table, OWNER queue endpoints. | `PR-W8-1`, `PR-W8-5`, `PR-W8-6` |
| `PR-W8-8` | `payouts(reconcile): daily job + reports` | Reconciliation job, payout report endpoints, materialised view, runbook. | `PR-W8-1`, `PR-W8-5` |
| `PR-W8-9` | `payouts(tax): Stripe Tax + 1099-K` | Stripe Tax integration, threshold tracker. **OWNER_DECISIONs ratified in PR description.** | `PR-W8-8` |

## 3. Analytics events

All events are emitted via the existing PostHog gateway. Money is
**never** in the event body; bands and counts only.

```
payouts_connect_started               { user_id, kind }
payouts_connect_link_issued           { user_id }
payouts_connect_state_changed         { user_id, from, to }
payouts_connect_dissolved             { user_id, by_user_id }

payouts_charge_recorded               { coach_id, gross_band, fee_band }
payouts_split_recorded                { head_coach_id, sub_coach_id, share_pct_band }
payouts_refund_initiated              { initiator_role, strategy }
payouts_refund_executed               { strategy, was_partial, parent_status_after }
payouts_chargeback_received           { dispute_kind }
payouts_chargeback_closed             { won }

payouts_affiliate_accrued             { affiliate_id, source_offer_kind }
payouts_affiliate_payable             { affiliate_id }
payouts_affiliate_paid                { affiliate_id }
payouts_affiliate_clawed_back         { affiliate_id, was_paid_already }

payouts_reward_granted                { funder, reward_kind, face_value_band }
payouts_reward_redeemed               { reward_kind }
payouts_reward_voided                 { reward_kind, by_role }

payouts_fraud_signal_fired            { rule, severity, subject_kind }
payouts_fraud_action_taken            { rule, action, by_role }

payouts_reconciliation_completed      { drift_count, invariant_violations }
payouts_reconciliation_drift_alert    { drift_count }

payouts_tax_threshold_80pct           { jurisdiction, tax_year }
payouts_tax_threshold_100pct          { jurisdiction, tax_year }
payouts_tax_form_link_surfaced        { jurisdiction, tax_year }
```

Doctrine pin `payouts-analytics-shape.spec.ts` asserts no event body
contains a key matching `/amount|usd|cents|balance/i`.

## 4. Healthy-signal table

The threshold values below are **alert thresholds**, not SLOs. They
fire OWNER notifications when crossed sustained for the named window.

| Metric | Healthy | Warning | Page |
|---|---|---|---|
| Reconciliation drift count | 0 | ≥ 1 sustained 1 day | ≥ 1 sustained 3 days |
| Webhook signature failures from one IP | < 5/min | ≥ 10/min for 5 min | ≥ 50/min |
| Outbox `errored` rows | 0 | ≥ 5 | ≥ 50 |
| `IdempotencyGuard` `LOCK_TIMEOUT` rate | < 0.1% | ≥ 1% sustained 15 min | ≥ 5% |
| Affiliate `negative_balance` count | 0 | ≥ 1 | ≥ 5 |
| Connect accounts in `restricted` state | < 5% of active | ≥ 10% | ≥ 25% |
| 1099-K threshold-cross alerts unacknowledged | 0 (after 24h) | 1 (after 24h) | 1 (after 7 days) |
| Fraud queue `unreviewed` count | < 20 | ≥ 50 | ≥ 200 |
| Reconciliation job duration | < 60s | ≥ 120s | ≥ 300s |
| Materialised view staleness | < 26h | ≥ 26h | ≥ 48h |

## 5. Kill-switch playbook

Three levels:

### 5.1 Hard kill (master)

Set `PAYOUTS_LEDGER_V1=OFF` globally. Effect: every Wave 8
controller refuses with `503 PAYOUTS_DISABLED`. Affiliate and reward
batches stop. Reconciliation job continues (read-only).

### 5.2 Surface kill (per-flag)

Flip the relevant `_V1` flag. Examples:

- Cascade misbehaving on a non-default strategy → flip
  `PAYOUTS_REFUND_OWNER_STRATEGIES_V1=OFF`. Defaults still work.
- Fraud rule false-positive storm → flip
  `PAYOUTS_FRAUD_RULES_V1=SHADOW` (rules fire, actions don't).
- Tax computation breaking checkout → flip `PAYOUTS_TAX_V1=OFF`;
  Stripe Tax is bypassed; falls back to no-tax (with OWNER
  acknowledgment that some compliance posture is degraded).

### 5.3 Per-coach kill

Per-coach flag override (from PR #91 doctrine). Effect: the surface
is off for that coach only. Useful when a single coach's affiliate
is abusing the rail.

## 6. Capacity

| Surface | Approximate load | Headroom |
|---|---|---|
| Stripe webhook inbox writes | 1 per checkout / refund / dispute / Connect update | RPS << 10 in v1; Postgres handles trivially |
| Ledger entries inserts | 5–7 per checkout, 3–6 per refund | low; index supports fast reads on parent_transaction_id |
| Outbox drains | 1 row per Stripe-side-effect | drain job runs every 30s; exponential backoff caps stuck rows |
| Reconciliation job | 1 daily run | 30–60s expected; well under 5 minute budget |
| Affiliate batcher | 1 daily run | dependent on # of payable accruals; under 100 affiliates batches in seconds |
| Payout report endpoints | RPS spike during dashboard open | materialised view absorbs most of the cost |

Storage: each ledger entry ~ 400 bytes; one year of 5k transactions
× 6 rows/tx = ~12 GB. Inbox / outbox archived monthly to a cold
table (added in `PR-W8-1` migration).

## 7. Dashboards (operator-facing)

Wave 8 contributes the following Grafana dashboards (host: existing
`grafana.internal` per PR #91 doctrine for the platform):

- **Payouts: Ledger health** — invariant violation count, drift
  count, materialised view freshness.
- **Payouts: Webhook reliability** — inbox `errored` rate, outbox
  drain backlog, webhook-signature failure histogram.
- **Payouts: Affiliate liability** — sum of `held` accruals,
  `payable` backlog, `negative_balance` accounts.
- **Payouts: Fraud queue** — unreviewed by severity, action
  histogram, false-positive proxy (dismissed by reviewer).
- **Payouts: Connect KYC** — accounts by state, time-in-state
  median, restricted-account list.
- **Payouts: Reconciliation** — daily drift, invariant violations,
  job duration trend.

Mobile dashboards:

- **Coach payout dashboard** — shipped in `PR-W8-8`.
- **OWNER admin payout view** — shipped in `PR-W8-8` (OWNER role).

## 8. Operator-on-the-hook matrix

| Surface | Owner | Backup |
|---|---|---|
| Webhook inbox | Backend on-call | OWNER |
| Reconciliation drift | Backend on-call → OWNER | Compliance |
| Fraud queue | OWNER | Compliance |
| 1099-K threshold | OWNER | Tax counsel (out-of-band) |
| Refund OWNER strategies | OWNER | Compliance |
| Affiliate clawback collisions | OWNER | Coach support (out-of-band) |

The on-call rotation is owned by the existing PR #91 doctrine
(unchanged here).

## 9. Test plan

For each PR-W8-N:

1. Unit tests on the cascade / accrual / cap / rule engine. ≥ 80%
   line coverage on the new code.
2. Doctrine pins listed in `00-overview.md` §8.
3. Integration test that spins up a fake Stripe webhook + drives
   the inbox / cascade end-to-end. Already used by PR #108 §03;
   extended here.
4. Load test for the reconciliation job at 10× current volume.
5. Replay test: re-fire the last 7 days of webhooks against a clean
   ledger; assert the resulting state is byte-identical (per the
   append-only invariant).

## 10. Migration / backfill plan

- Every migration in Wave 8 is **additive** (no drops).
- The ledger starts empty at `PR-W8-1` deploy date; pre-Wave-8
  charges are **not backfilled**. They are reconstructed on demand
  from Stripe Balance Transactions if needed (`08-` §1).
- `inbox` / `outbox` are net-new; no backfill.
- `connect_accounts` is net-new; existing coaches who need payouts
  must complete onboarding via `PR-W8-2` post-deploy.
- `reward_caps` seed: insert one platform-wide row at deploy with
  `per_grant_face_max=50`, `per_month_total_max=1000`,
  `created_by=<deploy_owner>`, `reason='wave_8_initial_seed'`.

## 11. Rollback plan

Per-PR rollback:

- Flip the flag to OFF; the surface is dormant.
- The migration is additive; no schema rollback is required.
- For `PR-W8-1` specifically: if the ledger writer is found buggy,
  flipping `PAYOUTS_LEDGER_V1=OFF` halts every downstream surface
  (because every other surface depends on it). The platform falls
  back to "Stripe-only" — money still moves on Stripe; we lose the
  in-platform record for the dormant window. A subsequent re-enable
  must run a Stripe-side reconciliation backfill to fill the gap;
  the runtime PR's runbook covers this.

## 12. Senior-engineer checklist

For every PR-W8-N PR description:

- [ ] Module README updated in same PR.
- [ ] Doctrine pin added or extended.
- [ ] Migration is additive only; verified via the migration
  scanner CI step.
- [ ] All money fields `Decimal(14,2)`.
- [ ] All wire money is `{amount, currency}`.
- [ ] `Idempotency-Key` enforced on every money-writing controller.
- [ ] No PostHog event carries raw amounts.
- [ ] `.env.example` updated for any new env var.
- [ ] OWNER-only surfaces gated by `RoleGuard('owner')`.
- [ ] Failure modes ≥ 5 documented in PR description.
- [ ] Doctrine pin specs run green in CI.
- [ ] Compliance sign-off captured in PR description if required.

## 13. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Reconciliation drift goes unnoticed for > 1 day | low | high | metric + alert; payout pause until cleared |
| OWNER non-default refund strategy ships without compliance sign-off | low | high | the runtime PR template requires the sign-off in description; CI checks the description |
| Stripe API breaking change | medium | medium | API version pinned; integration tests catch on update |
| Affiliate runaway clawback | medium | medium | $500 negative-balance ceiling; OWNER queue intervenes |
| Webhook ordering anomaly (e.g. dispute closed before created) | low | high | inbox processes in arrival order; the cascade engine handles non-monotonic events as long as `parent_transaction_id` resolves |
| Cap calculation race under high coach volume | medium | low | advisory lock per coach per month |
| Stripe Tax rate change mid-month | low | medium | per-charge tax recorded on the parent_tx; refunds use the recorded rate |

## 14. Acceptance for the spec set as a whole

- [ ] All 11 docs exist and are consistent with PR #106, PR #108,
  PR #109.
- [ ] Doctrine pin list (`00-overview.md` §8) is complete; each
  pin is traceable to a future runtime PR.
- [ ] Cross-repo dependency table is complete.
- [ ] OWNER decisions in `09-tax-and-multi-currency.md` are
  enumerated with choices + recommendation + consequences.
- [ ] No `new-website/` change.
- [ ] No runtime code in this PR.
