# Waves 6 / 7 / 9 / 10 — Finance app mirrors

> **Status:** draft, **documentation-only**. Not merged.
>
> This spec set is the finance-side mirror of cross-repo Waves 6, 7,
> 9, and 10. Each wave has a fitness-side spec in
> `growth-project-backend` or `growth-project-mobile`; this set
> declares the **finance app's specific obligations** for that wave
> with the consumer-finance compliance line preserved.
>
> Wave 8 (the payout rail) is **separate** — see
> `docs/specs/wave-8-payout-extensions/` (PR #110).

## What this set is for

The cross-repo wave model groups platform initiatives:

- **Wave 1** — enterprise-readiness pass (already shipped on `main`).
- **Wave 2** — backend sub-coach hierarchy (`growth-project-backend`).
- **Wave 3** — backend admin control room (`growth-project-backend`).
- **Wave 4** — mobile org mode (`growth-project-mobile`).
- **Wave 5** — finance sub-coach billing split (this repo, PR #109).
- **Wave 6** — app marketplace permission scopes for financial data.
- **Wave 7** — discovery trust signals for finance outcomes.
- **Wave 8** — content rewards / affiliate payouts with Stripe Connect (this repo, PR #110).
- **Wave 9** — storefront finance offer blocks, funnel analytics, and community rooms with strict privacy.
- **Wave 10** — cross-product federation / account identity.

Waves 6, 7, 9, 10 each have a fitness-side or platform-side
counterpart. The **finance-side obligations** are not derivable from
the fitness specs without compliance review (money-shape leak,
balance redaction, FTC, outcome-claim filter, federation identity
mapping under privacy). This set encodes those obligations so the
runtime PRs in this repo can land without re-litigating doctrine.

## Files

| File | Wave | Purpose |
|---|---|---|
| [`00-overview.md`](./00-overview.md) | all | Cross-wave narrative; the seam against PR #106, #108, #109, #110; OWNER decisions tabled. |
| [`wave-6-marketplace-permission-scopes.md`](./wave-6-marketplace-permission-scopes.md) | 6 | App-marketplace permission-scope model for **financial data** access. Closed scope enum. Consent UX. Audit. ≥ 5 failure modes. |
| [`wave-7-discovery-trust-signals.md`](./wave-7-discovery-trust-signals.md) | 7 | Trust signals on the marketplace discovery feed. Bucketed-only signals, no outcome claims. Editorial overrides + boost cap. |
| [`wave-9-storefront-funnel-analytics-and-community.md`](./wave-9-storefront-funnel-analytics-and-community.md) | 9 | Storefront finance offer blocks (the **finance**-tinted variant of PR #108 §01). Funnel analytics with consent + bucketing. Community rooms with strict privacy (money-shape scrubber + balance redaction at the post layer). |
| [`wave-10-federation-identity.md`](./wave-10-federation-identity.md) | 10 | Cross-product (`fitness ↔ finance`) account identity. `shared_identity_id`. Email-mapping today; `shared_identity_id` upgrade path. GDPR export/delete spans. Privacy posture. |

Total: ~2,500 lines across 5 files (plus this README).

## Reading order

1. [`00-overview.md`](./00-overview.md) — the seam map.
2. Pick the wave you need. Each spec is **self-contained** with its
   own dependency list, schema delta, API contract, state-transition
   table, ≥ 5 failure modes, and acceptance criteria.

## Cross-repo dependency map

| Wave | Hard dep (cross-repo) | Hard dep (this repo) |
|---|---|---|
| 6 | `growth-project-backend/docs/marketplace/app-permissions-spec.md` (Wave 6 backend) | PR #108 §05 (marketplace), PR #109 §1 (org), PR #110 §02 (ledger), PR #110 §07 (anti-fraud) |
| 7 | `growth-project-backend/docs/marketplace/discovery-trust-spec.md` (Wave 7 backend) | PR #108 §05, PR #106 §02 (leaderboards bucketing) |
| 9 | `growth-project-mobile/docs/product/storefront-funnel-spec.md` (Wave 9 mobile) | PR #108 §01, §06; PR #110 §02 |
| 10 | `growth-project-backend/docs/admin/federation-spec.md` (extends Wave 1 PR #93) | this repo `backend/src/admin/federation/`, this repo PR #109 (org_id surface) |

If any hard dep has not landed when a runtime PR derived from this
set opens, the runtime PR pauses.

## Anti-scope (deliberately not in this set)

- **Wave 8 payout extensions** — separate set in
  `docs/specs/wave-8-payout-extensions/` (PR #110).
- **Public web marketplace.** All marketplace surfaces are in-app.
- **Public web finance coach profile.** Deferred. Out of scope.
- **Member-balance write surfaces.** Read-only doctrine preserved.
- **Multi-tier affiliate / MLM, cash bounties, crypto rails.** All
  out of scope per PR #110 anti-scope.
- **Anonymous / shared identity beyond email-mapping in v1.** The
  `shared_identity_id` upgrade path is specced; the v1 implementation
  remains email-only per PR #93.

## Doctrine pin extensions

Each wave below adds at most one doctrine pin spec, listed in its
own file's §8 / §9 acceptance section. The five pins added by this
set:

| Pin | Wave | Asserts |
|---|---|---|
| `marketplace-permission-scope.spec.ts` | 6 | Closed scope enum; every consent surface renders the verbatim copy; revoking a scope removes the access immediately. |
| `discovery-bucketed-signals.spec.ts` | 7 | No raw money in any discovery rank input; bucketed bands only; outcome-claim filter applies to every card field. |
| `community-privacy.spec.ts` | 9 | Money-shape scrubber on every post-write path; balance redaction on every quoted reply path; OWNER kill-switch reachable. |
| `funnel-analytics-consent.spec.ts` | 9 | Funnel events carry only consented fields; bands not amounts; PII-free user identifiers. |
| `federation-identity-shape.spec.ts` | 10 | Email-mapping is the only mapping in v1; `shared_identity_id` is reserved; cross-app responses always carry `identityMapping: 'email'` per PR #93. |

These pins **extend** existing doctrine pins; they do not replace.
