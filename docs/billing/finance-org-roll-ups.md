# Finance — org roll-ups

When an org exists (head coach + sub-coaches per the Wave 4 mobile spec
`growth-project-mobile/docs/product/role-experience-extension-org-mode.md`),
the finance app's MRR / ARR / cohort surfaces must roll up by org while
preserving per-sub-coach drilldown. This document specifies:

- The new federation read endpoint that surfaces org revenue.
- The cohort taxonomy alignment with the Wave 3 admin data-feed RFC.
- The drilldown invariant — sums always reconcile.
- The mobile read surface this spec serves
  (`OrgRevenueRollUp` on the mobile head-coach Org tab).

This is a docs-only spec. No `backend/src/`, `mobile/app/`, `prisma/`,
`.env`, or CI changes.

---

## 0. Cross-repo dependencies

- **`docs/billing/sub-coach-billing-split-spec.md`** in this directory —
  owns the data model (`org`, `org_memberships`, extended
  `ledger_entries` with attribution columns). Hard dependency.
- **`growth-project-backend/docs/admin/control-room-spec.md`** (Wave 3)
  — owns the cohort taxonomy. Soft dependency: this spec aligns to the
  taxonomy where it overlaps but does not consume the admin data feed.
- **`growth-project-backend/docs/product/sub-coach-hierarchy.md`**
  (Wave 2) — owns the org and membership shapes that the finance app
  reads via federation. Hard dependency.
- **`growth-project-mobile/docs/product/role-experience-extension-org-mode.md`**
  §4.5 — defines the mobile `OrgRevenueRollUp` screen that consumes the
  endpoint described here. Mobile is the consumer; this spec is the
  producer.

If any hard dependency has not landed, the runtime PR for this spec
pauses. Mirrored in repo-root `PERP_HANDOFF.md`.

---

## 1. The read surface

The finance app exposes two new endpoints, scoped to the head-coach JWT
(or to OWNER from the admin console):

```
GET /api/v1/org/:org_id/revenue/summary
  query: range = 7d | 30d | 90d | mtd | qtd | ytd

GET /api/v1/org/:org_id/revenue/by-sub-coach
  query: range = (same)
```

Both endpoints require:

- The caller is OWNER, **or**
- The caller is the head coach of the named org, **or**
- The caller is the named org's sub-coach **and** the response is
  filtered to that sub-coach's own attribution rows only.

This is enforced by a controller-level `OrgScopeGuard` (new in the
runtime PR). It reads the JWT, the path `:org_id`, and the requested
scope, and either narrows the response or returns 403.

### 1.1 Summary response shape

```
{
  org_id: string,
  org_display_name: string,
  range: '7d' | '30d' | '90d' | 'mtd' | 'qtd' | 'ytd',
  range_start: string,                           // ISO 8601
  range_end: string,                             // ISO 8601
  currency: string,                              // org's pinned currency
  generated_at: string,                          // ISO 8601
  metrics: {
    org_mrr:           { amount: string },        // string for Decimal precision
    org_arr:           { amount: string },
    new_mrr_in_range:  { amount: string },
    churn_mrr_in_range:{ amount: string },
    net_new_mrr_in_range: { amount: string },
    gross_revenue_in_range: { amount: string },
    refunds_in_range:  { amount: string },
    net_revenue_in_range: { amount: string },
    platform_fee_in_range: { amount: string },
  },
  trend_30d_mrr: Array<{ date: string, mrr: { amount: string } }>,    // 30 daily points, oldest first
}
```

Money values are strings. The `DecimalToNumberInterceptor` is
**bypassed** on this endpoint via a controller-level
`@SkipDecimalNormalisation()` decorator (added in the runtime PR), so
the wire shape preserves Decimal precision.

The `trend_30d_mrr` series is always 30 points regardless of the
requested `range`. This lets the mobile sparkline render consistently
even when the user picks `7d` for the metrics.

### 1.2 By-sub-coach response shape

```
{
  org_id: string,
  range: '7d' | '30d' | '90d' | 'mtd' | 'qtd' | 'ytd',
  range_start: string,
  range_end: string,
  currency: string,
  generated_at: string,
  rows: [
    {
      user_id: string,                            // sub-coach (or head coach for head's row)
      display_name: string,
      role: 'head_coach' | 'sub_coach',
      gross_revenue: { amount: string },
      refunds:       { amount: string },
      net_revenue:   { amount: string },
      net_new_mrr:   { amount: string },
      active_subscriptions: number,
      pct_of_org_net: string,                     // string, two decimals, e.g. "22.93"
    },
    ...
  ],
  totals: {
    gross_revenue: { amount: string },
    refunds:       { amount: string },
    net_revenue:   { amount: string },
    pct_of_org_net: '100.00',
  },
}
```

The drilldown invariant: `sum(rows.net_revenue) === totals.net_revenue`,
exactly, in Decimal. Any drift is a bug — the runtime PR has a
property-based test asserting this on every roll-up call.

Pct values sum to 100.00 ± 0.02 (the rounding boundary on banker's
rounding across N rows). The mobile UI renders the values rounded to
one decimal; the precision rule is internal.

---

## 2. Where the numbers come from

`org_mrr`, `org_arr`, `new_mrr_in_range`, etc. are computed from the
`ledger_entries` table extended in
`sub-coach-billing-split-spec.md` §2.4. Specifically:

| Metric | Source | Filter |
|---|---|---|
| `org_mrr` | sum of active subscriptions' monthly amount | `org_id = :id` AND `subscription.status = 'active'` |
| `org_arr` | `org_mrr × 12` | (computed) |
| `new_mrr_in_range` | sum of subscriptions started in range | `org_id = :id` AND `subscription.created_at IN [range]` AND `attributed_role IN ('head_coach', 'sub_coach')` |
| `churn_mrr_in_range` | sum of subscriptions cancelled in range, valued at their pre-cancel monthly | `org_id = :id` AND `subscription.cancelled_at IN [range]` |
| `net_new_mrr_in_range` | `new - churn` | (computed) |
| `gross_revenue_in_range` | sum of `attributed_amount` on positive ledger rows | `org_id = :id` AND `attributed_role IN ('platform', 'head_coach', 'sub_coach')` AND `created_at IN [range]` AND `attributed_amount > 0` |
| `refunds_in_range` | sum of `attributed_amount` on negative ledger rows | same filter, `attributed_amount < 0` |
| `net_revenue_in_range` | `gross + refunds` (refunds are negative) | (computed) |
| `platform_fee_in_range` | sum where `attributed_role = 'platform'` AND `attributed_amount > 0` | filter |

For Flow A orgs (sub-coach is the merchant), the `org_id` column on
`ledger_entries` is set by the charge-recording webhook from the
sub-coach's `org_memberships.org_id`, so the same query shapes work.

### 2.1 By-sub-coach math

The `by-sub-coach` endpoint groups by `attributed_role`'s underlying
user. For a row corresponding to a sub-coach:

```
gross_revenue = sum(attributed_amount > 0 where sub_coach_user_id = :id)
refunds       = sum(attributed_amount < 0 where sub_coach_user_id = :id)
net_revenue   = gross_revenue + refunds
```

For the head-coach row:

```
gross_revenue = sum(attributed_amount > 0 where head_coach_user_id = :id AND attributed_role = 'head_coach')
                 + sum(attributed_amount > 0 where attributed_role = 'sub_coach' AND head_coach_user_id IS NULL)
                 -- the second clause covers solo offers the head coach sells personally
                 -- under the org umbrella; payout_destination='self' charges
refunds       = same shape, attributed_amount < 0
net_revenue   = gross_revenue + refunds
```

The `head_coach_user_id IS NULL` clause is a legibility improvement on
the existing schema — it captures the case where a head coach sells a
personal offer (not an `org_split` offer), and the row's only
attribution is the platform fee + the head coach's net (no sub-coach
involvement). The runtime PR adds this denormalisation explicitly so
the query reads correctly.

`pct_of_org_net` is computed as
`(row.net_revenue / totals.net_revenue) × 100`, rounded with banker's
rounding to two decimals.

---

## 3. Cohort taxonomy alignment

The Wave 3 admin data-feed RFC
(`growth-project-backend/docs/admin/control-room-spec.md` and the
forthcoming admin data-feed RFC referenced in §11) defines a cohort
taxonomy for OWNER's cross-tenant analytics. The finance app's
**internal** cohort definitions must align to that taxonomy where they
overlap so a head coach's view of their own org's cohorts matches the
OWNER's cross-platform view.

### 3.1 Aligned cohort dimensions

These dimensions match the admin data-feed RFC verbatim:

| Dimension | Values | Source |
|---|---|---|
| `signup_month` | YYYY-MM | `users.created_at` |
| `first_paid_month` | YYYY-MM | min(`ledger_entries.created_at` where `user_id` matches and the user is the **client**, not the coach) |
| `flow` | `'A' \| 'B'` | `org.billing_flow` at the time of the cohort's first paid charge |
| `tier` | `'L1' \| 'L2' \| 'L3'` | per the entitlement contract from `tgp-finance-app` PR #106 / mobile PR #94 |

### 3.2 Org-only cohort dimensions

These are finance-app-specific and do not appear in the admin data-feed RFC:

| Dimension | Values | Source |
|---|---|---|
| `sub_coach_user_id` | uuid | the attributed sub-coach for the cohort's revenue |
| `offer_id` | uuid | the offer the cohort was acquired through |
| `offer_payout_destination` | `'self' \| 'org_split'` | per the offer extension in §2.3 of the split spec |

Sub-coach drilldown on the mobile screen uses `sub_coach_user_id`. The
admin data-feed RFC does not need this — OWNER's cross-tenant cohort
view is org-level, not membership-level.

### 3.3 What "alignment" means in practice

When the admin data-feed RFC asks "show me the LTV of all clients who
signed up in 2026-Q1, on Flow B, on tier L2," the same query against
the finance app's roll-up tables — when constrained to a single org —
must return the same number for that org's slice. The runtime PR has
a cross-tenant test that proves this for at least one realistic
fixture (5 orgs, mixed flows, mixed tiers, 100 clients).

The "what alignment means" rule is enforced by sharing the cohort
membership view-table definition (when both repos have it) — but
because each repo computes its own metrics, the runtime test is the
real guarantee.

---

## 4. Drilldown invariants

The finance app has three roll-up shapes:

1. **Platform-wide** (OWNER only) — admin data-feed RFC's surface.
2. **Org-wide** — the endpoint in §1.1.
3. **Per-sub-coach** — the endpoint in §1.2.

Sums must reconcile across these shapes. Specifically:

- For any range, **sum of org-wide net_revenue across all orgs** =
  **sum of platform-wide net_revenue minus solo-coach net_revenue**.
  (Solo coaches not in any org contribute to platform-wide but not to
  any org-wide.)
- For any range, **sum of by-sub-coach net_revenue within an org** =
  **org-wide net_revenue for that org**, exactly.
- For any range, **org platform_fee_in_range** = sum across all charges
  in that org of `application_fee_amount`. This must match Stripe's
  recorded fees on the platform's account, modulo the 1-cent drift
  allowance per currency from the reconciliation job.

The runtime PR has property-based tests for each invariant. Failures
fail loudly — there is no "approximate" reconciliation in the finance
app's doctrine.

---

## 5. Mobile read surface

The mobile screen `OrgRevenueRollUp` (defined in
`growth-project-mobile/docs/product/role-experience-extension-org-mode.md`
§4.5) renders a subset of the response shape from §1.1 + §1.2. The
contract:

- The mobile client calls `/api/v1/org/:org_id/revenue/summary` first.
- The mobile client calls `/api/v1/org/:org_id/revenue/by-sub-coach` to
  populate the contribution table.
- Both calls share the same `range` query param.
- Both calls produce the same `currency`, `range_start`, `range_end`,
  and `generated_at`. If they differ, mobile picks the latest
  `generated_at` and warns Sentry — this is a server-side bug.
- React Query keys: `['org', orgId, 'revenue', 'summary', range]` and
  `['org', orgId, 'revenue', 'by-sub-coach', range]`. They are
  invalidated together when the user changes the range chip.

The mobile screen does not render any number not present in the
response. Specifically: there is no client-side computation of MRR,
ARR, percentage shares, or sparkline data points. The server is the
only computer.

---

## 6. Caching and freshness

| Layer | TTL | Invalidation |
|---|---|---|
| Server-side compute | 5 minutes | A `charge.succeeded` / `refund.processed` / `subscription.updated` event in the org invalidates all cached summaries for that org |
| Mobile React Query (persisted) | 5 minutes | On screen mount AND on range chip change |
| OWNER admin console | 1 minute | OWNER explicitly refreshes |

The 5-minute TTL on server-side compute is a soft TTL — within 5
minutes the server returns the cached projection. Beyond 5 minutes the
projection is recomputed on next request. Webhook-driven invalidation
keeps the cache from going stale during high-traffic windows.

The mobile UI labels the surface with
`Last updated 4 May, 09:17` so head coaches understand the freshness
contract. The label reads `generated_at` from the response.

---

## 7. Performance and query shape

The roll-up endpoints must be sub-200ms p95 on a roster of up to 50
sub-coaches and 5,000 active subscriptions per org. The runtime PR
achieves this via:

1. **A materialised projection table** `org_revenue_projections`
   refreshed by:
   - the webhook (`charge.succeeded`, `refund.processed`,
     `subscription.created`, `subscription.cancelled`,
     `invoice.payment_succeeded`),
   - a daily safety-net rebuild at 03:00 UTC.
2. The summary endpoint reads from the projection, not from
   `ledger_entries` directly.
3. The by-sub-coach endpoint reads from a sibling projection
   `org_sub_coach_revenue_projections` keyed by `(org_id, user_id, range_bucket)`.

Range buckets are computed nightly for `7d`, `30d`, `90d`, `mtd`,
`qtd`, `ytd`. Mid-day requests serve from the most recent bucket; the
"last 5 minutes" of activity is layered on at read time from the live
ledger to keep numbers current.

The runtime PR includes a load test against the projections to confirm
the p95.

---

## 8. Audit and observability

The roll-up endpoints are read-only and do **not** write `AuditLog`
rows by default. However:

| Action | Audited? | Why |
|---|---|---|
| OWNER reads any org's roll-up | yes | `audit_action='admin.org.revenue_read'` with `org_id` and `range`. Forensic accountability. |
| Head coach reads own org's roll-up | no | Tenant-side reads are not audited. |
| Sub-coach reads own roll-up (filtered) | no | Tenant-side reads are not audited. |
| Mobile detects `generated_at` mismatch between summary and by-sub-coach | yes | `audit_action='finance.rollup.staleness_drift'` — server bug forensic. |

Sentry tags include `org_id` and `range` on every roll-up endpoint
call so org-correlated performance issues are filterable. PostHog
events on the mobile side fire from the named callsites in
`role-experience-extension-org-mode.md` §9.

---

## 9. Acceptance criteria

A runtime PR closing this spec is accepted when:

1. `org_revenue_projections` and `org_sub_coach_revenue_projections`
   tables exist with the schemas implied by §7. Migration is reversible
   (drops cleanly).
2. Webhook-driven projection refresh is implemented for the five
   webhook events listed in §7. Idempotent — replaying a webhook does
   not double-count.
3. Daily safety-net rebuild runs at 03:00 UTC with the same shape as
   the reconciliation job in the split spec.
4. `GET /api/v1/org/:org_id/revenue/summary` returns the §1.1 shape
   with `range` validation (Zod). Returns 403 on out-of-scope JWT.
5. `GET /api/v1/org/:org_id/revenue/by-sub-coach` returns the §1.2
   shape with the drilldown invariant from §1.2 verified server-side
   before response is sent. If the invariant fails, the endpoint
   returns 500 with a typed error and writes
   `finance.rollup.staleness_drift`.
6. `@SkipDecimalNormalisation()` decorator is implemented and applied
   to both endpoints. Money values are returned as strings.
7. Property-based tests verify the four invariants from §4 across at
   least 5 fixture orgs with mixed flows and tiers.
8. `OrgScopeGuard` enforces the auth rules from §1.
9. The mobile contract from §5 is honoured — mobile receives the same
   `currency`, `generated_at`, `range_start`, `range_end` from both
   endpoints when called with the same `range`.
10. p95 latency on the summary endpoint is ≤ 200ms on the load-test
    fixture (50 sub-coaches × 5,000 active subs).
11. Sentry tags `org_id` and `range` are set on every roll-up endpoint
    scope.
12. No `parseFloat`, no `Number` coercion of money values. Decimal
    end-to-end.
13. The runtime PR ships behind a feature flag `org_rollups_v1` in
    **off** state. Backend Wave 2 sub-coach hierarchy and the split
    spec's runtime PR (the data-model migration) must land first.

---

## 10. Out of scope

- **OWNER cross-tenant cohort UI.** Owned by `tgp-admin-web` and the
  Wave 3 admin data-feed RFC. The finance app produces the data; the
  admin console renders it.
- **CSV / PDF export.** Owned by a future runtime PR. The endpoints
  support pagination via `cursor` (not yet exposed in v1) so a future
  export job can stream rows without holding everything in memory.
- **Custom date ranges.** v1 supports the six named ranges. A future
  custom-range option requires either an additional projection bucket
  or live-compute fallback. Reserved.
- **Multi-currency totals.** Per `sub-coach-billing-split-spec.md` §6,
  the org pins to one currency. v1 returns single-currency roll-ups
  only.
- **Forecasting (predicted MRR for next quarter).** Out of scope.
- **Per-offer revenue breakdown** below the per-sub-coach drilldown.
  Reserved as `/api/v1/org/:org_id/revenue/by-offer` for a future
  surface.
- **Real-time websocket push of roll-up updates.** Not needed — the
  5-minute server-cache + webhook-driven invalidation produces
  acceptable freshness without the operational cost of a websocket
  channel.

---

## 11. Reference: cohort taxonomy as named here

For convenience, the cohort dimensions used by the finance app:

| Dimension | Values | Lives on |
|---|---|---|
| `signup_month` | YYYY-MM | client `users.created_at` |
| `first_paid_month` | YYYY-MM | min charge per client |
| `flow` | A / B | `org.billing_flow` at first paid month |
| `tier` | L1 / L2 / L3 | entitlement at first paid month |
| `sub_coach_user_id` | uuid | attributed sub-coach |
| `offer_id` | uuid | the offer purchased |
| `offer_payout_destination` | self / org_split | per offer |

The first four match the admin data-feed RFC. The last three are
finance-app-internal. When the admin RFC and this spec disagree on a
dimension's name or value space, the admin RFC wins and the finance
app's runtime PR is updated.
