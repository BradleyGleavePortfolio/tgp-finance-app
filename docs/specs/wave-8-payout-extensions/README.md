# Wave 8 — Finance payout extensions (Stripe Connect, ledger, anti-fraud)

> **Status:** draft, **documentation-only**. Not merged. Runtime
> PRs derived from this set are blocked on the dependencies listed
> in `00-overview.md` §0.

This spec set is the **payout rail** for the finance app. It is the
backend-of-record for every dollar that the platform collects from a
client and forwards to a coach, sub-coach, affiliate, or rewards
recipient. It is also the canonical spec for the **ledger /
audit / event-idempotency** doctrine that every Wave 5–10 runtime PR
must obey.

The set sits between three Wave-5/9 docs and a small set of net-new
runtime modules:

```
                          ┌─────────────────────────────────────────┐
                          │  Wave 5 (#109) sub-coach billing split  │
                          │  Wave 9 (#108) storefront / marketplace │
                          │  Wave 6 (this set) marketplace scopes   │
                          │  Wave 7 (this set) discovery trust      │
                          │  Wave 9 (this set) community + funnel   │
                          └─────────────────────┬───────────────────┘
                                                │ feeds money events
                                                ▼
                  ┌────────────────────────────────────────────┐
                  │  Wave 8 — payout extensions (this set)     │
                  │                                            │
                  │  • Stripe Connect Express onboarding       │
                  │  • Application fees + transfers (split)    │
                  │  • Append-only ledger + audit              │
                  │  • Idempotency / replay-safety             │
                  │  • Refund / chargeback cascade             │
                  │  • Affiliate clawback / hold periods       │
                  │  • Reward liability & funded-by accounting │
                  │  • Anti-fraud signals + rules engine       │
                  │  • Reconciliation + payout reports         │
                  │  • OWNER tax / multi-currency decisions    │
                  └─────────────────────┬──────────────────────┘
                                        │ payout reports
                                        ▼
                  ┌────────────────────────────────────────────┐
                  │  Wave 3 (backend) admin control room       │
                  │  Wave 4 (mobile) ORG revenue rollups       │
                  │  Wave 10 (federation) cross-product ID     │
                  └────────────────────────────────────────────┘
```

## Files

| File | Lines | Purpose |
|---|---:|---|
| [`00-overview.md`](./00-overview.md) | ~430 | One-line claim. Why / when / where / who / what / how. The seam against Wave 5 (sub-coach split) and Wave 9 (storefront/marketplace + community). Doctrine pin extensions. |
| [`01-connect-onboarding.md`](./01-connect-onboarding.md) | ~520 | Stripe Connect Express onboarding for coaches, sub-coaches, and affiliates. Capability matrix per recipient kind. KYC state machine. Onboarding-link rotation. Failure modes. |
| [`02-ledger-and-audit.md`](./02-ledger-and-audit.md) | ~580 | Append-only `ledger_entries` table. Event-sourced money flow. Audit table. Replay determinism. Reconciliation invariants. The `posted_at` vs `effective_at` distinction. |
| [`03-idempotency-and-events.md`](./03-idempotency-and-events.md) | ~450 | `Idempotency-Key` discipline at every money write. Stripe webhook idempotency. Outbox / inbox tables. Replay-safe handlers. Duplicate-suppression invariants. |
| [`04-refund-and-chargeback-cascade.md`](./04-refund-and-chargeback-cascade.md) | ~530 | Refund cascade across platform fee, sub-coach share, affiliate commission, reward grant. Chargeback / dispute lifecycle. Clawback rules. State-transition table with five failure modes. |
| [`05-affiliate-payouts.md`](./05-affiliate-payouts.md) | ~470 | Affiliate commission accrual, attribution window enforcement, hold period, clawback on refund/chargeback. Single-tier only. FTC disclosure pin. |
| [`06-reward-liability.md`](./06-reward-liability.md) | ~410 | Reward grants are **non-cash**; this spec records the coach-funded-vs-platform-funded liability and the per-reward / per-coach caps. Why the platform is **not** a money transmitter. |
| [`07-anti-fraud.md`](./07-anti-fraud.md) | ~480 | Rules engine for chargeback-fraud, self-referral, application-deposit cycling, refund-abuse, money-shape leak in community. Signal table. OWNER review queue. |
| [`08-reconciliation-and-payouts.md`](./08-reconciliation-and-payouts.md) | ~440 | Daily reconciliation against Stripe Balance Transactions. Payout schedule, holdback, carry-forward. Operator runbook. Performance + capacity. |
| [`09-tax-and-multi-currency.md`](./09-tax-and-multi-currency.md) | ~420 | Stripe Tax integration boundary. 1099-K threshold tracking (US). Multi-currency: presentation vs settlement. **OWNER decisions** with choices/recommendations. |
| [`10-rollout-and-ops.md`](./10-rollout-and-ops.md) | ~410 | Feature flags, analytics events, healthy-signal table, kill-switch playbooks, capacity, dashboard list, operator-on-the-hook matrix, full PR sequence (PR-W8-1 .. PR-W8-9). |

Total: ~5,140 lines across 11 files. Each spec is in the 410–580
line band per the enterprise-depth target. README is ≤ 200 lines.

## Reading order

1. [`00-overview.md`](./00-overview.md) — the why, the seam, the
   doctrine pin extensions.
2. [`02-ledger-and-audit.md`](./02-ledger-and-audit.md) — the
   foundation. Every other spec writes through this surface.
3. [`03-idempotency-and-events.md`](./03-idempotency-and-events.md) —
   the *how* of every money write. Read before any controller spec.
4. [`01-connect-onboarding.md`](./01-connect-onboarding.md) — the
   capability matrix + KYC state machine for every payout recipient.
5. [`04-refund-and-chargeback-cascade.md`](./04-refund-and-chargeback-cascade.md) —
   the failure-mode core.
6. [`05-affiliate-payouts.md`](./05-affiliate-payouts.md) and
   [`06-reward-liability.md`](./06-reward-liability.md) —
   the two coach-economy adjacencies.
7. [`07-anti-fraud.md`](./07-anti-fraud.md),
   [`08-reconciliation-and-payouts.md`](./08-reconciliation-and-payouts.md) —
   defence + reconciliation.
8. [`09-tax-and-multi-currency.md`](./09-tax-and-multi-currency.md) —
   OWNER decisions. Read before billing reviewer sign-off.
9. [`10-rollout-and-ops.md`](./10-rollout-and-ops.md) — flags,
   events, runbooks, PR sequence.

## Anti-scope (deliberately not in this set)

- **Member-side balance writes.** The finance app is read-only over
  member balances; this set introduces only platform-side money flow
  (client → coach / sub-coach / affiliate / rewards). The
  read-only-for-member-balances doctrine is preserved.
- **Direct payouts to bank.** Payouts go via Stripe Connect Express
  payout schedules; the platform never touches bank rails directly.
- **Crypto / wire / ACH-direct.** Stripe Connect only.
- **Multi-tier MLM.** Affiliates are single-tier (per Wave 9 §04).
- **In-app cash bounties.** Rewards are non-cash; cash bounties are
  expressly out of scope (per Wave 9 §08 and `06-reward-liability.md`
  §3).
- **Tax form generation UI.** 1099-K issuance is a Stripe-emitted
  artefact; the platform tracks the threshold and surfaces the form
  link, but does not author tax forms in v1.
- **Public web payout dashboard.** All payout surfaces are in-app
  (coach dashboard) or admin-console (OWNER). `new-website/` is not
  modified (none exists in this repo).

## Architectural decisions taken in this set

Documented in [`00-overview.md`](./00-overview.md) §7. Summary:

1. **Append-only ledger is the single source of truth.** Stripe is
   external. Our ledger is the canonical record; Stripe is the
   reconcilable cross-check. A reconciliation drift alert pages
   OWNER, never silently overrides.
2. **Every money write carries an `Idempotency-Key`.** Server-side
   and Stripe-side. Replays are first-class. The webhook handler is
   stateless and re-entrant.
3. **Refund cascades are deterministic.** Five strategies enumerated
   (`pro_rata` default + four OWNER-only). Compliance reviewer signs
   off on non-default strategies before they ship.
4. **Affiliates and rewards are siblings of split, not extensions.**
   They share the ledger; they do **not** share the split spec's
   sub-coach attribution model.
5. **Anti-fraud is a closed rule set + an OWNER queue.** No ML, no
   third-party black box. Every block is explainable.
6. **Tax + multi-currency are OWNER decisions.** The spec records
   choices + recommendation; the OWNER decides before the runtime
   PR opens.

## Cross-repo dependencies

- **Hard:** `growth-project-backend/docs/product/sub-coach-hierarchy.md`
  (Wave 2). `org_memberships` is the basis for sub-coach payout
  attribution.
- **Hard:** This repo PR #108 §02 (offer builder) and §03
  (checkout). `payout_destination` and `payout_split_pct` extend
  the offer model; checkout is the entry point for every ledger
  entry.
- **Hard:** This repo PR #109 (Wave 5 sub-coach billing split).
  This Wave 8 set is the **mechanism** Wave 5 declared (Connect
  transfers, application fees, ledger). Wave 5 declares *what*;
  Wave 8 declares *how*.
- **Soft:** `growth-project-backend/docs/admin/control-room-spec.md`
  (Wave 3). The payout-report endpoints in §08 align with the
  admin-console cohort taxonomy.
- **Soft:** `growth-project-mobile/docs/product/role-experience-extension-org-mode.md`
  (Wave 4). The mobile coach payout dashboard reads §08 endpoints.
- **Soft:** PR #106 §09 compliance. The disclaimer corpus extends
  for affiliate FTC + reward no-prize copy.
