# 09 — Tax and multi-currency

> **Status:** draft, documentation-only.
>
> This spec records every OWNER decision on tax and multi-currency
> for v1. The OWNER signs off before the runtime PR (`PR-W8-9`)
> opens. Every `OWNER_DECISION` block names choices, recommendation,
> and the consequence of the recommendation.

## 0. Cross-repo dependencies

- Wave 5 (PR #109) §11 declared 1099 / multi-currency out of scope
  for that PR; this spec lifts the scope into Wave 8 and surfaces
  the OWNER decisions.
- `02-ledger-and-audit.md` — `currency` column on every ledger
  row.

## 1. Tax — what we charge, what we remit, who is responsible

### 1.1 The line

The platform is a marketplace facilitator. In US states with
marketplace facilitator laws (most states by 2026), the platform
is responsible for collecting and remitting sales tax on its **own
revenue** (the application_fee). The coach is responsible for tax
on their own revenue (the `charge_net`).

This is the boundary the spec enforces:

- Stripe Tax (when ON) computes destination-based tax on the
  **gross** charge.
- The platform's application_fee is its revenue; tax on that fee
  is platform-remitted.
- The coach's net is the coach's revenue; tax on that is the
  coach's responsibility (Stripe Tax surfaces the breakdown but
  Stripe does not remit on behalf of the coach unless the coach
  signs up for Stripe Tax themselves on their Express account —
  out of scope for the platform to enforce).

### 1.2 OWNER_DECISION: Stripe Tax — ON or OFF

```
OWNER_DECISION  STRIPE_TAX_DEFAULT
Choices:
  A) ON for US destinations only (recommended)
  B) ON globally
  C) OFF (no tax computed; coach handles everything)
Recommendation: A
Consequence of A:
  - US-destination charges include destination-based sales tax automatically.
  - Non-US destinations pass through with no tax (out of scope in v1).
  - Stripe handles per-state remittance for jurisdictions where it offers
    AutoFile (AL, AZ, CA, CO, FL, GA, IL, IN, MA, MD, MI, MN, NJ, NY, NC,
    OH, PA, TX, VA, WA + others; check Stripe's current list at runtime).
  - Coach is responsible for income tax (1099-K below) and any state
    where Stripe AutoFile does not cover.
Consequence of B:
  - Multi-jurisdiction remittance complexity. Out of scope.
Consequence of C:
  - Compliance hazard; many states require marketplace facilitator
    collection. Recommended only if the platform restricts to states
    without facilitator law (a small set in 2026).
Default until OWNER ratifies: A
```

### 1.3 1099-K threshold

The IRS 1099-K threshold for marketplace facilitators is **$600
USD/year** as of 2026 (lowered from prior thresholds; verified
against IRS guidance at the time `PR-W8-9` opens).

Stripe automatically issues 1099-Ks to recipients who cross the
threshold. The platform tracks the threshold to:

- Surface a banner on the recipient's payout dashboard at 80% of
  threshold.
- Fire an OWNER alert at 100%.
- Surface a Stripe-issued form link in the dashboard once Stripe
  emits.

```
table  tax_threshold_tracking
  user_id                  uuid          PK
  tax_year                 int           PK     -- composite PK
  jurisdiction             text          PK     -- 'US-FED' for 1099-K
  ytd_received             numeric(14,2) NOT NULL
  threshold                numeric(14,2) NOT NULL
  banner_at_80pct_shown    bool          NOT NULL DEFAULT false
  alert_at_100pct_shown    bool          NOT NULL DEFAULT false
  form_link                text          NULL    -- Stripe-issued
  updated_at               timestamptz   NOT NULL
```

`ytd_received` is recomputed on each daily reconciliation tick.

### 1.4 OWNER_DECISION: state-level 1099 tracking

```
OWNER_DECISION  STATE_1099_TRACKING
Choices:
  A) Track all states' lower thresholds (NJ $1k, MD $600, VT $600,
     MA $600, IL $1k+4-tx, etc) (recommended)
  B) Track US-FED $600 only; coach is responsible for state-level
     reporting.
Recommendation: A
Consequence of A:
  - More banner / alert noise but defensible compliance posture.
  - tax_threshold_tracking rows multiply: one per (user_id, year, state).
  - Reconciliation job cost scales linearly with active states.
Consequence of B:
  - Simpler implementation.
  - Compliance gap if a coach receives > state threshold but < federal.
Default until OWNER ratifies: A
```

## 2. Multi-currency

### 2.1 The line in v1

USD-only, both **presentation** and **settlement**. Every
`ledger_entries` row has `currency = 'USD'`. Non-USD destinations
are out of scope.

### 2.2 OWNER_DECISION: multi-currency posture for v2+

```
OWNER_DECISION  MULTI_CURRENCY_V2
Choices:
  A) Defer (USD only in v1; multi-currency as Wave 11) (recommended)
  B) Add presentation-only multi-currency in v1 (display in
     buyer's local currency; settle in USD via FX at charge time).
  C) Full multi-currency: presentation + settlement.
Recommendation: A
Consequence of A:
  - Tightest compliance + accounting boundary; lowest implementation
    risk.
  - USD-only restricts the addressable market to US-based buyers.
  - The ledger schema reserves `currency` so the upgrade path is
    clean.
Consequence of B:
  - Requires a frozen FX-quote table; FX drift between quote and
    settlement is a small loss the platform absorbs (or charges via
    a 1.5% FX margin — a separate decision).
  - Refunds may settle at a different rate from the charge,
    creating a small drift on the ledger that the reconciliation
    invariant must tolerate (see §2.3 below).
Consequence of C:
  - Stripe Connect supports multi-currency settlement on accounts.
  - The platform must hold balances in multiple currencies, which
    is a Stripe Treasury upgrade and out of scope.
Default until OWNER ratifies: A
```

### 2.3 Reconciliation invariant in a multi-currency world

If the OWNER picks B or C in §2.2 (Wave 11), the
`payouts-ledger-invariants.spec.ts` pin must be **extended** to
permit currency-pair drift within a tolerance:

```
Σ (direction == 'credit' ? +amount : -amount)
  OVER  parent_transaction_id, currency
= 0  ± 0.005    -- per-currency, per-transaction
```

The invariant becomes per-currency, not aggregate. The runtime PR's
fx_rate_book table records the daily quote used for each parent
transaction; reconciliation tolerates a drift bounded by the
declared FX margin.

For v1 (Choice A), the invariant remains "single-currency,
zero-sum"; this section is informational.

## 3. 1099-K threshold tracker

Mechanism:

1. Daily reconciliation job sums `credit` ledger entries to each
   user's Stripe Connect account by `(user_id, tax_year)`.
2. On crossing 80% of threshold (per jurisdiction), insert a banner
   row into the recipient's dashboard via a structured notification.
3. On crossing 100%, fire an OWNER alert. The alert says: "Stripe
   will emit 1099-K for $user. Verify in Stripe dashboard."
4. When Stripe emits the form, ingest the URL via Stripe's
   `tax_form.created` webhook (subscribed in §3 of
   `03-idempotency-and-events.md` once available; for 2026, this is
   a polled API call once a month at year-end).
5. Surface the form link on the recipient's payout dashboard.

## 4. Privacy / security

- Tax thresholds are user-specific PII (a recipient sees their own;
  OWNER sees any).
- 1099-K form links are sensitive; redacted in PostHog; surfaced in
  the dashboard via signed URLs (1-hour TTL).
- Tax rates from Stripe Tax are non-PII but logging the per-charge
  rate to PostHog leaks geographic information; bucketed
  (`region: 'us_east' | 'us_west' | 'us_central' | 'us_other'`)
  only.

## 5. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | Stripe Tax is ON but a charge fails to compute tax (Stripe error) | `payment_intent.created` returns with `automatic_tax: { status: 'failed' }` | runtime PR fails the checkout closed with `503 TAX_COMPUTATION_FAILED`; client retries; OWNER alert if > 5/hr |
| 2 | 1099-K threshold tracker double-counts a refunded charge | reconciliation job recomputes from ledger, where refunds are ledger entries with negative direction | the `ytd_received` is **net** of refunds, not gross |
| 3 | Stripe Tax jurisdiction list changes (e.g. a new state opts in to AutoFile) | Stripe announces; runtime PR reads from a config file synced from Stripe docs | the config file is reviewed at every PR-W8-9 release; out-of-band sync if mid-cycle |
| 4 | 1099-K form link expires / is invalidated by Stripe | recipient hits a 404; dashboard shows a "regenerate" CTA | link refreshes via the same Stripe API; runtime PR caches link with 1h TTL |
| 5 | OWNER picks Stripe Tax = OFF but a state requires marketplace facilitator | compliance reviewer sign-off gate on the runtime PR catches | the OWNER decision is recorded in the runtime PR description; compliance reviewer co-signs |
| 6 | Multi-currency phase 2 lands without updating the reconciliation invariant | doctrine pin scans the schema for non-USD `currency` values and asserts the invariant pin is the multi-currency variant | the migration that adds non-USD also updates the pin in the same PR |

## 6. Acceptance criteria

- [ ] Stripe Tax is ON for US destinations by default; OWNER_DECISION
  `STRIPE_TAX_DEFAULT` is recorded in the runtime PR description.
- [ ] `tax_threshold_tracking` table exists with the closed PK
  shape.
- [ ] 80% banner + 100% alert fire at the correct boundaries; tests
  use synthetic `ytd_received`.
- [ ] 1099-K form link is surfaced post-emission and is signed.
- [ ] Multi-currency is **OFF** in v1; doctrine pin asserts every
  ledger row has `currency='USD'`.
- [ ] Compliance reviewer sign-off on the OWNER decisions is
  captured in PR-W8-9 description.

## 7. OWNER decisions summary

| Decision | Default | Approver |
|---|---|---|
| `STRIPE_TAX_DEFAULT` | A (ON for US) | OWNER + compliance |
| `STATE_1099_TRACKING` | A (track all state thresholds) | OWNER |
| `MULTI_CURRENCY_V2` | A (defer; USD-only in v1) | OWNER |

These three decisions are the only OWNER-only decisions in Wave 8;
every other decision is engineering-led with compliance review where
required.

## 8. Out-of-scope (explicit)

- VAT / GST. Out of scope for v1 (US-only).
- Tax form generation UI. Stripe-emitted forms only.
- Currency hedging. Out of scope.
- Crypto-denominated tax events. Out of scope.
- Cross-state nexus accounting beyond Stripe Tax's jurisdiction.
