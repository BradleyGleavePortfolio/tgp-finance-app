# Perplexity Computer — handoff log (`tgp-finance-app`)

This file is updated by every Computer session that does substantive
work in this repo. New sessions should read it top-to-bottom before
touching anything. The most recent session is at the top.

---

## Session 2026-05-01 (PDT) — Wave 5 finance sub-coach billing + org roll-ups

**Goal:** mirror the Wave 2 / Wave 4 sub-coach work on the finance side
so the cross-repo billing flows are spec'd in operator-grade detail
before any runtime PR opens. Sibling to Wave 4 in
`growth-project-mobile`.

**Branch:** `docs/wave-5-finance-subcoach-billing`. Off `main`.
Docs-only, draft, **NOT MERGED**.

### What was done

Created `docs/billing/` with three files:

| File | Lines | Purpose |
|---|---:|---|
| `README.md` | 136 | Index, reading order, anti-scope, conventions (Decimal(14,2), wire-side `{amount: string, currency: string}`, Stripe-id opacity, idempotency-key format, audit-row policy, refund-cascade discipline) |
| `sub-coach-billing-split-spec.md` | 631 | The two billing flows for sub-coach orgs. Flow A — sub-coach has own Stripe Connect customer; charge lands directly. Flow B — head coach is the merchant; platform takes its fee; head coach's Stripe Connect account forwards the sub-coach's share via Transfer. Data model (`orgs`, `org_memberships`, offer extension, `ledger_entries` extension, `stripe_transfers`, refund attribution columns), API flows for both, subscription handling, refund cascade with four strategies (default `pro_rata` + three OWNER-only), reconciliation job, audit events, billing-flow migration |
| `finance-org-roll-ups.md` | 448 | Org MRR/ARR/cohort surfaces. Two endpoints (`/api/v1/org/:id/revenue/summary` + `/api/v1/org/:id/revenue/by-sub-coach`). Drilldown invariants (sums always reconcile across platform/org/sub-coach scopes). Cohort taxonomy alignment with Wave 3 admin data-feed RFC. Mobile read surface contract. Caching/freshness, projection-table strategy, performance targets |

Total: 1,215 lines across 3 files. Each spec lands in the 631 / 448
line range (per the 300–800 enterprise-depth target).

### Cross-repo dependencies

Each spec carries a §0 cross-repo-dependency header. Summary:

| Finance spec | Hard dependency | Status |
|---|---|---|
| `sub-coach-billing-split-spec.md` | `growth-project-backend/docs/product/sub-coach-hierarchy.md` (Wave 2) | **NOT YET ON BACKEND `main`.** |
| `sub-coach-billing-split-spec.md` | `tgp-finance-app` PR #108 §02 (offer builder) and §03 (checkout/deposits/subscriptions) | Both on draft PR #108, not on `main`. |
| `finance-org-roll-ups.md` | The split spec from this directory | Hard, intra-repo. |
| `finance-org-roll-ups.md` | `growth-project-mobile/docs/product/role-experience-extension-org-mode.md` §4.5 | Soft — mobile is the consumer of the roll-up endpoint. |
| `finance-org-roll-ups.md` | `growth-project-backend/docs/admin/control-room-spec.md` (Wave 3) | Soft — cohort taxonomy alignment only. |

The Wave 2 backend specs and PR #108 catalogue extension must land on
their respective `main` branches before any runtime PR derived from
this Wave 5 docs PR ships. This Wave 5 docs PR is mergeable
independently.

### Cross-repo siblings

- **Wave 4 (in flight)** — `growth-project-mobile`, branch
  `docs/wave-4-mobile-mirror`. Spec'd `docs/product/role-experience-extension-org-mode.md`
  (the mobile org tab) and three other mobile specs. The mobile
  `OrgRevenueRollUp` screen is the consumer of the
  `/api/v1/org/:id/revenue/*` endpoints spec'd in
  `finance-org-roll-ups.md` here.
- **Wave 2 (backend, in flight)** — sub-coach hierarchy. Owns the
  `users.org_id` / `users.org_role` / `org_memberships` shapes that
  the finance app **mirrors** (read-only) for billing attribution.
- **Wave 3 (backend, in flight)** — admin data-feed RFC. The cohort
  taxonomy lives there. `finance-org-roll-ups.md` §3 documents the
  alignment.

### Placeholders documented in this session

Per the strict rule, every placeholder is recorded with a justification.

| Placeholder | Where | Reason |
|---|---|---|
| `org_billing_v1` and `org_rollups_v1` feature flags | Acceptance §10 of split spec; Acceptance §9 of roll-ups spec | The flag system in finance app's mobile (`mobile/`) is not yet centralised. The runtime PRs use a `useFlag()` hook that the catalogue / billing PR (#117 in `growth-project-backend`) is expected to land first. The finance app reuses the same shape. |
| `OrgScopeGuard` | Roll-ups spec §1 and §9 | New runtime guard in `backend/src/auth/`. Reserved-name-only here. Implemented by the runtime PR. |
| `@SkipDecimalNormalisation()` decorator | Roll-ups spec §1.1 and §9 | New runtime decorator. Reserved-name-only. The current `DecimalToNumberInterceptor` walks every response; the new endpoints opt out so wire shape preserves Decimal as `{amount: string, currency: string}`. |
| Banker's-rounding helper in `backend/src/common/money.ts` | Split spec §2.4, §5, throughout | Helper does not exist yet; runtime PR adds it. The finance app's existing money math uses Prisma.Decimal directly; this is a deterministic rounding step at attribution time only. |
| `org_revenue_projections` and `org_sub_coach_revenue_projections` tables | Roll-ups spec §7 | New tables. Schemas defined by §7's wire shape but the column-level DDL is the runtime PR's responsibility. |
| `reconciliation_reports` table | Split spec §7 | Same — schema implied; DDL is runtime. |
| `BillingReconciliationJob` (02:00 UTC daily) | Split spec §7 | New job. Reserved-name-only. Uses the existing scheduler framework. |
| Stripe `application_fee_amount` and `transfer_data.destination` shapes | Throughout split spec | The Stripe API shape itself; not a placeholder we author. The runtime PR wires them according to Stripe Connect docs. |
| `payout_destination` validation refinement (Flow-A org cannot have Flow-B offer and vice versa) | Split spec §10 acceptance | Zod refinement on the offer create endpoint. Implemented by runtime PR. |
| OWNER admin actions for the three non-default refund strategies | Split spec §5.2 | Endpoint shapes (`POST /api/admin/refunds/:id/absorb`) are implied; the admin console (`tgp-admin-web`) owns the UI; the finance app owns the backend. Both runtime PRs are out of scope for this docs PR. |
| Customer re-confirmation step on A→B subscription migration in some jurisdictions | Split spec §9 step 3 | Owned by the legal/compliance reviewer (per PR #108 §00 disclaimer corpus pattern). The runtime PR pauses on the consent prompt copy until compliance signs off. |

None of these are blockers for **this** PR. They are recorded so the
runtime PRs derived from each spec can ratify them in order.

### What the next Computer should know

- The user is **Bradley Gleave** (`@BradleyGleavePortfolio`).
- The finance app's doctrine: Decimal(14,2) end-to-end. **No
  `parseFloat` on user input. No `Number` coercion of money. No
  emoji. No `TODO`/`FIXME`/"Coming Soon" markers in shipped source.
  No streak/badge/trophy/VIP/elite vocab.** Wave 5 specs observe this
  strictly.
- The finance app is multi-tenant, **read-only** for member balances.
  Wave 5 introduces a new money flow (platform-side: client → coach,
  with sub-coach split) — this is not member balance write surface,
  it is platform billing. The read-only-for-member-balances doctrine
  is preserved.
- Stripe is the only payment provider. Stripe Connect is new for
  Flow B. No alternates. No banking integration.
- AI calls use `sonar-pro`. The finance-app AI service uses it via
  the existing gateway; this Wave 5 spec does not introduce any AI.
- **Strict rules from the user:**
  - Build to enterprise depth/quality.
  - Never use placeholder content without noting why/where in this
    file.
  - Stay draft, stay unmerged, never touch live apps without
    explicit approval.
  - Optimize for operator UX (head coach, sub-coach, OWNER).
  - Money is `Decimal(14,2)` end-to-end. Append-only audit log.

### What is intentionally **not** in this PR

- No runtime source under `backend/src/` or `mobile/app/`.
- No Prisma schema or migration changes.
- No `.env` / `.env.example` changes.
- No CI / Fly / smoke configuration changes.
- No new payment provider.
- No member-side balance write surfaces (preserves the read-only
  doctrine for member finances).
- No 1099 / tax form generation. Flagged as out-of-scope in §11 of
  the split spec.
- No multi-currency normalisation. v1 spec accommodates the data
  model; cross-currency totals are out of scope.
- No live-compute custom-date-range support (v1 supports the six
  named ranges only).

### Hard-dependency note (the only true blocker for runtime PRs)

The Wave 2 backend spec `sub-coach-hierarchy.md` and the PR #108
catalogue extension (offer-builder + checkout) must land on their
respective `main` branches before any runtime PR derived from this
Wave 5 docs PR ships. This docs PR is mergeable independently — it is
a forward-looking spec.

If the user merges this Wave 5 docs PR before its dependencies land,
the spec sits as a queued contract. If after, the spec maps directly
onto the dependency shapes and the runtime PRs can begin.

### Next steps after this session

1. The user reviews this PR and the corresponding Wave 4 PR in
   `growth-project-mobile`.
2. The user (or a future Computer) ratifies Wave 2 backend spec PRs
   in `growth-project-backend`.
3. The user merges PR #108 (catalogue + checkout) so the offer model
   is available to extend.
4. Once both are on `main`, the runtime PR sequence begins:
   - Sub-coach offer-catalogue extension.
   - Flow A wiring (separate Stripe customer per sub-coach).
   - Flow B wiring (Connect transfer from head coach).
   - Org roll-up surfaces (the read endpoints in
     `finance-org-roll-ups.md`).
   - Reconciliation job (daily Balance Transactions cross-check).
5. Each runtime PR ships behind its feature flag in **off** state.

### Compliance flag

The split spec's §5 (refund cascade) introduces three OWNER-only
strategies (`platform_only`, `head_coach_only`, `sub_coach_only`)
that affect coach-to-coach attribution. Before any runtime PR for the
non-default strategies ships, the consumer-finance compliance reviewer
who signed off on PR #106 §09 must review §5.2 of this spec. The
default `pro_rata` path is uncontroversial and does not require
additional sign-off.

---
