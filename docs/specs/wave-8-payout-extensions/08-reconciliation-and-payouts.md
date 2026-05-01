# 08 — Reconciliation and payout reports

> **Status:** draft, documentation-only.
>
> The daily reconciliation job is the keystone — it proves the
> ledger and Stripe agree. This spec also defines the payout
> dashboard endpoints the mobile coach view consumes and the
> revenue rollup that the admin console reads.

## 0. Cross-repo dependencies

- Wave 5 (PR #109) `docs/billing/finance-org-roll-ups.md` —
  declared `org_revenue_projections` tables; this spec defines
  reconciliation against the underlying ledger.
- Wave 3 backend admin `control-room-spec.md` — cohort taxonomy
  alignment for revenue-by-cohort endpoints.
- Wave 4 mobile `OrgRevenueRollUp` screen — consumer of these
  endpoints.

## 1. Daily reconciliation job

Runs at **02:30 UTC** daily (jitter ±5 minutes). Single instance
(advisory lock). Idempotent.

### Inputs

- Yesterday's closed-day window: `[D-1 00:00 UTC, D-1 23:59:59 UTC]`.
- Stripe Balance Transactions for that window, paginated.
- Ledger entries with `posted_at` in that window.

### Algorithm

```
function reconcile(window):
  ledger = LedgerService.readWindow(window)
  stripe = StripeBalanceTransactions.fetchPage(window, paginate=true)

  ledgerByStripeId = group ledger by reference->>'stripe_charge_id' or 'stripe_transfer_id' or 'stripe_dispute_id'
  stripeById       = group stripe by id

  drift = []
  for each stripeId in stripeById:
    if not ledgerByStripeId[stripeId]:
      drift.append({ kind: 'stripe_only', id: stripeId, amount: stripe.amount, currency: stripe.currency })
    else:
      ledgerNet = sum(ledgerByStripeId[stripeId])
      stripeNet = stripeById[stripeId].net  // from Balance Transactions
      if abs(ledgerNet - stripeNet) > 0.005:
        drift.append({ kind: 'amount_mismatch', id: stripeId, ledger: ledgerNet, stripe: stripeNet })

  for each ledgerId in ledgerByStripeId:
    if not stripeById[ledgerId]:
      drift.append({ kind: 'ledger_only', id: ledgerId })

  // run the four invariants from 02-ledger-and-audit.md §5 over the same window
  invariantViolations = LedgerInvariants.runWindow(window)

  report = {
    window,
    ledger_row_count, stripe_row_count,
    drift, invariantViolations,
    completed_at: now(),
  }
  ReconciliationReportService.persist(report)

  if drift.length > 0 or invariantViolations.length > 0:
    OWNER.alert(report)
```

### Outputs

- A `reconciliation_reports` row (Wave 5 placeholder; this spec
  defines the schema):

  ```
  table  reconciliation_reports
    id                       uuid          PK
    window_start             timestamptz   NOT NULL
    window_end               timestamptz   NOT NULL
    ledger_row_count         int           NOT NULL
    stripe_row_count         int           NOT NULL
    drift_count              int           NOT NULL
    invariant_violation_count int          NOT NULL
    detail_jsonb             jsonb         NOT NULL  -- full drift + violation list
    status                   text          'clean' | 'drift' | 'errored'
    completed_at             timestamptz   NOT NULL DEFAULT now()
  ```

- An OWNER alert on any non-zero drift or invariant count
  (PagerDuty / push / email per `10-rollout-and-ops.md` §7).

Drift takes **priority** over downstream payout processing. While a
window is in `drift`, the affiliate payout batcher and the head-coach
weekly payout are **paused**; they resume after OWNER acknowledges
or the drift is reconciled (manual ledger entry pair).

### Capacity

Stripe Balance Transactions API: 100 events / page, paginated. At
current platform load (P95: 5k transactions/day), a daily run is
~50 page fetches → ~30 seconds end-to-end. Capacity scales linearly
with volume; the runtime PR adds a per-page time budget to avoid
runaway jobs.

## 2. Payout report endpoints

All under `/api/v1/payouts/reports/*`. Auth: user JWT + tenant scope.

### `/summary`

```
GET /api/v1/payouts/reports/summary?period=mtd|last30|last90|ytd|named:YYYY-MM
  → 200 {
    period: { start, end, label },
    gross:               { amount: string, currency: string },
    application_fee:     { amount, currency },
    net_to_coach:        { amount, currency },
    sub_coach_split:     { amount, currency },        // outgoing split if head_coach
    sub_coach_received:  { amount, currency },        // incoming if sub_coach
    affiliate_commission_paid: { amount, currency },
    affiliate_commission_clawed_back: { amount, currency },
    rewards_funded:      { amount, currency },        // platform's view; coach view; etc
    refunds:             { amount, currency },
    chargebacks:         { amount, currency },
    net_payable:         { amount, currency },        // what's actually transferable
    next_payout_date:    timestamptz | null,
  }
  → 503 RECONCILIATION_DRIFT_BLOCKING_PAYOUT
```

### `/by-period`

```
GET /api/v1/payouts/reports/by-period?since=YYYY-MM&until=YYYY-MM
  → 200 { periods: [{ month, gross, fee, net, refunds, chargebacks }, ...] }
```

Caching: 5 minutes; ETag on the period boundaries. A period that
hasn't closed (current month) is **not** cached — recomputed on each
read.

### `/by-counterparty`

```
GET /api/v1/payouts/reports/by-counterparty?period=...&kind=affiliate|sub_coach|reward
  → 200 { rows: [{ counterparty_user_id, label_band, count, amount }, ...] }
```

`label_band` is the bucketed label per `02-ledger-and-audit.md` §6
privacy — no raw amount in low-cardinality contexts.

### `/upcoming`

```
GET /api/v1/payouts/reports/upcoming
  → 200 {
    next_payout_date,
    payable_now: { amount, currency },
    held_until: [{ release_date, amount }, ...],   // affiliate hold buckets
    blockers: [{ kind: 'connect_restricted' | 'reconciliation_drift' | 'cap_exceeded', detail }, ...]
  }
```

If a blocker exists, `payable_now` is still computed (it's what
*would* pay out if the blocker cleared) but the response carries the
explicit blocker list.

### Performance targets

- p95 < 200ms for `/summary` and `/upcoming` (warm cache).
- p95 < 400ms for `/by-period` (cold).
- p95 < 600ms for `/by-counterparty` (cold).

The runtime PR uses materialised views (`coach_revenue_projections`)
that the reconciliation job refreshes after a clean run. A
projection that is stale by > 25 hours surfaces an OWNER alert.

## 3. Payout schedule

The platform initiates Stripe Transfers on a coach-by-coach
schedule, computed daily. The default schedule:

- **Coach (solo)** — Stripe handles payouts directly via Express
  default schedule (daily, 2-day rolling). Platform does **not**
  initiate the payout; Stripe does. The platform's `application_fee`
  is taken at charge time and does not need a separate transfer.
- **Head coach (Flow B org)** — same as solo for the head coach's
  net. The sub-coach split is initiated by the platform via a
  Transfer **after** the hold cleared (Wave 5 §3 — usually next
  day).
- **Sub-coach (Flow A org)** — same as solo (each sub-coach has
  their own Connect account; Stripe handles).
- **Affiliate** — daily batch by `AffiliatePayoutBatcher` (per
  `05-affiliate-payouts.md` §4).

OWNER may switch a recipient's payout schedule to weekly or monthly
in the admin (audited).

## 4. Holdback

A platform-side holdback is **not** applied to coach revenue in v1
beyond the standard Stripe rolling reserve. Affiliate hold periods
(`05-` §4) are an in-platform holdback.

The runtime PR's reconciliation job inserts a "carry-forward" row
into `reconciliation_reports.detail_jsonb` for any drift unresolved
at end-of-day; the next day's report includes the carry. After **3
consecutive days** of unresolved carry, the OWNER queue surfaces a
runbook step requiring manual intervention.

## 5. Payout dashboard surfaces (mobile)

The mobile coach dashboard reads the four endpoints above. The dashboard
shows:

- A headline tile: "This month: $N gross • $M net" (the coach's own
  revenue is **shown** to the coach; this is consistent with PR
  #108's posture that a coach sees their own revenue, just not
  others').
- A breakdown row: fee / refunds / chargebacks (each with bands).
- A "Next payout" card with the date and a blocker chip if any.
- A "Sub-coach view" tab for head coaches (linked to Wave 5 § roll-up
  endpoints — finance-org-roll-ups.md).

The mobile screen is implemented in `growth-project-mobile`'s
`OrgRevenueRollUp` PR (Wave 4); this spec is the API contract.

## 6. Operator runbook (the OWNER's job)

| Scenario | Step 1 | Step 2 | Step 3 |
|---|---|---|---|
| Reconciliation drift fired (`drift > 0`) | Open the report's `detail_jsonb`. Identify whether each drift is `stripe_only`, `ledger_only`, or `amount_mismatch`. | If `stripe_only`: usually a webhook we missed. Replay via inbox manual replay endpoint (OWNER-only). | If still drift after replay, post a `manual_adjustment` ledger row with reason ≥ 20 chars. Re-run reconciliation for the window. |
| Affiliate hits negative balance > $500 | Pause new accruals (the system already does). | Contact affiliate; collect repayment off-platform. | OWNER inserts a `manual_adjustment` to clear the negative; audit row records the off-platform settlement. |
| Connect account `restricted` for > 7 days | Surface the blocker on the coach dashboard. | Run `RefreshOnboardingLink` for the coach. | If still restricted at 30 days, OWNER may dissolve and re-attach payouts to a new account (rare; requires manual ledger adjustment). |
| 1099-K threshold crossing | OWNER alert fires (`09-tax-and-multi-currency.md` §3). | Verify Stripe-emitted form is available in the recipient's Stripe dashboard. | Surface the form link on the recipient's payout dashboard. |
| Chargeback dispute | Submit evidence within Stripe's window via Stripe dashboard (UI is OWNER-only; we don't build it). | Update OWNER queue card with submission timestamp. | Wait for `dispute.closed`; cascade runs accordingly. |

## 7. Privacy / security

- Payout reports are scoped by tenant: a coach sees only their own;
  OWNER sees any.
- `by-counterparty` exposes only labels and bands (per Wave 5 spec),
  not raw amounts to non-OWNER reads.
- Reconciliation report payloads (`detail_jsonb`) are OWNER-only.
- PostHog: payouts events are bucket-only; never raw.

## 8. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | Reconciliation job fails mid-run (process crash) | the job is idempotent and re-runs on next tick; advisory lock prevents two parallel runs | partial state is durable: any row written is a `manual_adjustment`-style audit; the rerun is a fresh window pass |
| 2 | Stripe Balance Transactions API returns rate-limit | per-call retry with backoff; window job fails closed and retries on next tick | OWNER alert if 3 consecutive ticks fail |
| 3 | Materialised view goes stale | freshness alert at > 25h since refresh | reconciliation refresh on clean run; a fallback recompute path serves /summary if view is stale |
| 4 | A `manual_adjustment` is inserted but the parent_tx no longer nets to zero | doctrine pin runs at every tick | invariant violation row is inserted; OWNER queue alert; further payouts on that parent paused |
| 5 | Stripe webhook for a charge arrived 48h late | inbox dedupes; ledger inserts; reconciliation finds the now-matching pair | the late row is in the wrong window; recon report for the late window will show `ledger_only` for one tick, then clean on the next |
| 6 | Payout dashboard shows negative `payable_now` | possible if affiliate clawback exceeds positive accruals | the response surfaces it explicitly with a "blocked: negative_balance" hint; mobile UI shows $0 with a recovery message |

## 9. Acceptance criteria

- [ ] Reconciliation job runs daily at 02:30 UTC.
- [ ] Drift > 0 fires an OWNER alert.
- [ ] All four endpoints meet their p95 budget under nominal load.
- [ ] `payable_now` is never returned without a blocker list when
  blockers exist.
- [ ] PostHog events carry only bands.
- [ ] Materialised view refresh is idempotent.

## 10. Out-of-scope (explicit)

- Live (sub-minute) reconciliation. Daily window only in v1.
- Historical reconciliation pre-Wave-8. Pre-W8 charges are
  reconstructed on demand from Stripe; no backfill into the ledger.
- Cross-org reconciliation (mergers / splits). Out of scope; OWNER
  manual.
- Tax remittance (Stripe Tax handles for jurisdictions where ON;
  the platform does not remit).
