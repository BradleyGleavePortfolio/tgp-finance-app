# Billing specs — Wave 5 (sub-coach hierarchy)

This directory holds the **finance-app side** of the cross-repo sub-coach
work. The Growth Project's mobile + fitness backend introduces ORG mode in
Wave 4 (head coach managing sub-coaches). The finance app — which is the
Decimal(14,2)-end-to-end financial coaching surface — must mirror two
billing flows so revenue per sub-coach is observable, reconciled, and
audit-trailed.

These specs are docs-only. They describe the data models, API flows,
reconciliation processes, and audit shape that future runtime PRs will
land. Nothing under `backend/src/`, `mobile/app/`, `prisma/`, or `.env`
is changed by this directory.

The catalogue-then-billing principle from
[`tgp-finance-app` PR #108](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/108)
§02 still applies: an offer catalogue ships before any Stripe wiring is
turned on for the sub-coach flow. This directory describes the billing
shape in operator-grade detail; the catalogue extension that enables
multi-coach payout is a follow-up runtime PR (call it sub-coach-PR-A in
the eventual sequence).

---

## Files

| File | Purpose | Status |
|---|---|---|
| [`sub-coach-billing-split-spec.md`](./sub-coach-billing-split-spec.md) | The two billing flows for sub-coach orgs — Flow A (sub-coach has own Stripe customer) and Flow B (head coach pays platform a higher fee + pays sub-coaches via Stripe Connect transfers from the head coach's account). Data models, API surface, reconciliation, audit, refund-cascade rules. | Draft |
| [`finance-org-roll-ups.md`](./finance-org-roll-ups.md) | When an org exists, MRR/ARR/cohort views in the finance app must roll up by org while preserving per-sub-coach drilldown. Cross-references the Wave 3 admin data-feed RFC's cohort taxonomy. | Draft |

---

## Reading order

1. `sub-coach-billing-split-spec.md` — the data model and the two flows.
   This is the primary spec; everything else layers on top.
2. `finance-org-roll-ups.md` — the read-side surfaces (org MRR/ARR,
   per-sub-coach drilldown, cohort taxonomy). Reads from the data model
   spec'd in (1).

---

## Cross-repo dependencies

| File | Dependency | Status |
|---|---|---|
| `sub-coach-billing-split-spec.md` | `growth-project-backend/docs/product/sub-coach-hierarchy.md` (Wave 2). Owns `users.org_id`, `users.org_role`, `org_memberships`, the sub-coach lifecycle states. | Hard. |
| `sub-coach-billing-split-spec.md` | `tgp-finance-app/docs/specs/storefront-marketplace/02-offer-builder.md` (PR #108 §02). Owns the offer catalogue shape that is extended for multi-coach payout. | Hard — but catalogue-extension is itself a runtime PR; this spec is consumable today. |
| `sub-coach-billing-split-spec.md` | `tgp-finance-app/docs/specs/storefront-marketplace/03-checkout-deposits-subscriptions.md` (PR #108 §03). Owns the Stripe checkout, webhook idempotency, and refund/dispute state machine. | Hard — sub-coach split layers on top. |
| `finance-org-roll-ups.md` | `growth-project-backend/docs/admin/control-room-spec.md` (Wave 3 RFC). Cohort taxonomy. | Soft — the finance app owns its own cohort definitions; the admin RFC is referenced for taxonomy alignment, not as a runtime dependency. |
| `finance-org-roll-ups.md` | The mobile spec `growth-project-mobile/docs/product/role-experience-extension-org-mode.md` §4.5 (`OrgRevenueRollUp` screen). | Soft — mobile is the consumer of the federation surface this spec describes. |

The hard dependencies live in **other repos**. If they have not landed
when a runtime PR is opened against this directory, the runtime PR is
paused. The note is mirrored in the repo-root `PERP_HANDOFF.md`.

---

## Anti-scope

- No runtime source under `backend/src/` or `mobile/app/`.
- No Prisma schema or migration changes.
- No `.env` / `.env.example` changes.
- No CI / Fly / smoke configuration changes.
- No new payment provider. The only providers are Stripe (existing) and
  Stripe Connect (new in PR #108 §05). No alternates.
- No banking integration. The finance app is read-only for member
  finances by design; that does not change here. The sub-coach billing
  surface is a **platform-side** money flow (the platform receives money
  from clients, the platform pays sub-coaches). Member-side balances are
  unchanged.
- No client-facing UI in this directory. The mobile read surface
  (`OrgRevenueRollUp`) is spec'd in the mobile repo. The federation
  endpoint that surface consumes is spec'd in `finance-org-roll-ups.md`
  here.

---

## Conventions used in these specs

- **Money values are `Decimal(14,2)` end-to-end.** Storage, service
  arithmetic, wire shape, audit rows. Per `backend/docs/MONEY.md` and
  the locked write surfaces in PR #100.
- **Wire-side money is `{ amount: string, currency: string }`** — string
  to preserve precision through JSON parsing, currency to disambiguate
  multi-currency orgs. The existing `DecimalToNumberInterceptor`'s
  walk-and-convert is overridden for org-revenue endpoints that opt in
  via a controller-level decorator (the runtime PR adds the decorator;
  spec'd in §6 of the split spec).
- **Stripe identifiers** (`cus_*`, `sub_*`, `acct_*`, `tr_*`, `ch_*`,
  `pi_*`, `re_*`) are stored as opaque strings. We never parse them.
- **Idempotency** keys are required on every Stripe-mutating call.
  Format: `tgp:<surface>:<entity_id>:<event_kind>` (e.g.
  `tgp:billing:order_01HX.../charge` or
  `tgp:transfer:sub_coach_01HX.../weekly_2026-W18`). Idempotency is
  enforced at the Stripe call site **and** at the application's
  transition-record table.
- **Audit rows** land on `AuditLog` with `actor`, `action`, `target`,
  `before`, `after`, `metadata` (per the existing audit pattern). Every
  state transition described in these specs has an explicit
  `audit_action` name; no transition is auditless.
- **Refund cascade** rules are owned by the split spec. The cascade is
  always **conservative** — refunding a head coach charge proportionally
  reverses any sub-coach transfer that was attributed to it. There is no
  silent absorption.
- **Reconciliation** runs daily at 02:00 UTC. The job reads Stripe's
  Balance Transactions list for the prior 24h + a 7d safety overlap and
  cross-checks against the application's `LedgerEntry` table. Drift
  flags an `audit_action: 'finance.reconciliation.drift_detected'` row
  for OWNER review.

---

## Mode of operation

These specs are written so that a runtime PR can copy the acceptance
criteria verbatim into its description. Each spec ends with an
"Acceptance criteria" list a runtime PR is graded against.

The runtime PR sequence (for orientation; not authoritative — the
authoritative sequence lives in `tgp-finance-app/README.md`'s expansion
roadmap section once the relevant PRs are catalogued):

1. **Sub-coach offer-catalogue extension.** Adds `payout_split_pct` and
   the multi-coach payout fields to the offer model.
2. **Flow A wiring.** Sub-coach has own Stripe customer + own
   subscription. Refund cascade unaffected.
3. **Flow B wiring.** Head coach receives the full client charge; the
   platform takes its fee; the head coach's Stripe Connect account
   forwards the sub-coach's share. Refund cascade defined in §5 of the
   split spec.
4. **Org roll-up surfaces.** Federation endpoint and mobile drilldown.
5. **Reconciliation job.** Daily Balance Transactions cross-check.

Each step is a separate runtime PR with its own tests and gating.
