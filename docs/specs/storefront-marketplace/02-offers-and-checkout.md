# 02 — Offers, checkout, deposits, subscriptions

> **Status:** draft, documentation-only. Authorises runtime PR-FS-2 (offers catalogue) and PR-FS-3 (billing wiring).

## 1. WHY

A storefront without offers is a poster. A finance coach needs a
small, well-defined set of sellable shapes — a one-time program, a
deposit-then-balance package, a monthly subscription, an event
ticket, an application-gated cohort, and a payment plan — and each
of those shapes needs a checkout that does not look like a landing-
page lift.

The existing app has none of this. There is `ProgramTemplate` (per
PR #106 §5 and the `coach-led-programs/05-regimens.md`), there is no
billing, there is no cart, there is no checkout. The MONEY.md
guardrails exist for the user's own balances, not for transactions.

This spec defines the **offer object** (what is for sale), the
**checkout flow** (how someone buys), the **subscription / dunning
state machine** (what happens on renewal failure), and the
**compliant copy** (verbatim disclaimers, refund and dispute terms).
PR-FS-2 ships the catalogue and zero billing. PR-FS-3 ships the
billing wiring behind `BILLING_ENABLED=false` for a soft-launch and
flips on for production after the platform-readiness §05 lane (PR
#120) accepts.

The one-line claim:

> A coach can publish a one-time, deposit-balance, subscription, or
> payment-plan offer without any custom code; a client can buy it
> in three taps; and every screen in the flow carries the verbatim
> education-only and no-outcome disclaimers.

## 2. WHEN

- **PR-FS-2 (catalogue, no billing)** can ship as soon as the
  outcome-claim filter and the disclaimer constants from PR-FS-1
  are merged.
- **PR-FS-3 (billing wiring)** ships only when **all** of the
  following hold:
  1. The chosen processor is decided (Stripe is the assumed default
     unless the founder chooses otherwise; this spec is processor-
     agnostic where possible).
  2. PR #120 platform-readiness lane #05 (billing packaging) is
     accepted.
  3. Refund and dispute policy is approved by counsel.
  4. Receipt-page copy is pinned.
  5. Sentry filters PCI-relevant fields.
  6. Webhook signature verification is mandatory and tested.
  7. `BILLING_ENABLED` flag exists, default `false`.

## 3. WHERE

- `backend/prisma/schema.prisma` — `Offer`, `OfferMedia`, `Order`,
  `OrderItem`, `Subscription`, `RefundEvent`, `WebhookInbound`.
- `backend/src/offers/` (PR-FS-2), `backend/src/billing/` (PR-FS-3).
- `backend/src/billing/processor/` — adapter interface + Stripe
  implementation.
- `mobile/app/(checkout)/offer/[id].tsx`, `mobile/app/(checkout)/cart.tsx`,
  `mobile/app/(checkout)/result.tsx`, `mobile/app/(billing)/manage.tsx`.
- `mobile/src/api/billing.ts` — Zod-validated.
- `backend/src/compliance/disclaimers.ts` — extended.
- `backend/test/offers-doctrine.spec.ts`, `backend/test/billing-state.spec.ts`.
- `backend/docs/MONEY.md` — extended for transaction-side Decimal
  rules (the existing decimal-aware DTOs from PR #100 generalise).

`new-website/` untouched.

## 4. WHO

| Actor | Capability |
|---|---|
| Coach | Create / edit / archive offers on own storefront; cannot publish without `OFFERS_ENABLED` × `coach_profiles.offers_enabled`. |
| Coach Premium | Same + video offer kind + payment-plan kind. |
| Client (L1+) | Browse offers on a storefront they have access to; complete checkout for non-application offers; see receipt; manage own subscription. |
| OWNER | View all offers; force-unpublish; refund any order; pause any subscription; respond to disputes. |
| Compliance reviewer | Review queue for offer titles + descriptions before publish (first-time per coach + on edit). |

## 5. WHAT

### 5.1 The offer kinds (closed enum)

Closed enum, not freeform. Adding a kind is a schema migration, not
a config flag.

| Kind | Description | Money shape | Examples |
|---|---|---|---|
| `one_time_program` | A program (regimen, content board, course) that bills once. | `amount_cents` | "12-week debt-free track", "Spending DNA workshop". |
| `subscription` | Recurring monthly or annual. | `amount_cents` + `interval` | "Coach access — monthly". |
| `application_gated` | Locked behind an application; deposit-on-approval; balance on confirm or refund on rejection. | `deposit_cents` + `balance_cents` | "L3 mastermind cohort". |
| `payment_plan` | One total split over N installments. | `total_cents` + `installments` | "12-week regimen, 3 × $X". |
| `event_ticket` | Single-use access to an event (live call, AMA, IRL). | `amount_cents` + `event_id` | "Q3 cohort kickoff call". |
| `content_pass` | Recurring or one-time access to a content board (`coach_premium`). | `amount_cents` ± `interval` | "Newsletter subscription". |
| `affiliate_link` | A pointer to another coach's offer; resolved server-side; the coach earns affiliate share. | references another `offer_id` | n/a (cross-coach). |
| `free` | No money; gives access to a community space, a free regimen, or a free event. | none | "Intro cohort waitlist". |

`amount_cents` is an integer in the *processor's settlement currency*
(default USD). All money is integer cents in the schema; rendered as
Decimal-aware money in the API per
[`backend/docs/MONEY.md`](../../../backend/docs/MONEY.md).

### 5.2 Data sketch

```prisma
model Offer {
  id                  String          @id @default(cuid())
  coach_id            String
  coach               CoachProfile    @relation(fields: [coach_id], references: [id])
  storefront_id       String
  storefront          Storefront      @relation(fields: [storefront_id], references: [id])
  kind                OfferKind
  title               String          @db.VarChar(80)
  summary             String          @db.VarChar(240)
  description         String          @db.VarChar(4000)
  amount_cents        Int?            // null for application_gated, payment_plan, free, affiliate_link
  deposit_cents       Int?            // application_gated only
  balance_cents       Int?            // application_gated only
  total_cents         Int?            // payment_plan only
  installments        Int?            // payment_plan only (2..12)
  interval            BillingInterval? // subscription, content_pass
  event_id            String?         // event_ticket only
  references_offer_id String?         // affiliate_link only
  currency            String          @default("USD")
  state               OfferState      @default(draft)
  capacity            Int?            // optional seat cap (cohort, event)
  visibility          Visibility      @default(public) // 'unlisted' = direct deeplink only
  refund_policy       RefundPolicy    @default(coach_default)
  filter_blocked      Boolean         @default(false)
  published_at        DateTime?
  created_at          DateTime        @default(now())
  updated_at          DateTime        @updatedAt
  archived_at         DateTime?
}

enum OfferKind { one_time_program subscription application_gated payment_plan event_ticket content_pass affiliate_link free }
enum OfferState { draft pending_review published archived taken_down }
enum BillingInterval { month year }
enum RefundPolicy { coach_default no_refund pro_rata seven_day_full }
```

```prisma
model Order {
  id                  String       @id @default(cuid())
  client_id           String
  coach_id            String
  offer_id            String
  state               OrderState
  amount_cents        Int          // captured at creation
  currency            String
  processor           String       // 'stripe' (only)
  processor_session_id String?     @unique
  processor_payment_intent_id String? @unique
  processor_subscription_id String? @unique
  application_id      String?      // when application_gated
  paid_at             DateTime?
  refunded_at         DateTime?
  refunded_cents      Int          @default(0)
  failure_code        String?
  metadata            Json?
  created_at          DateTime     @default(now())
  updated_at          DateTime     @updatedAt
}

enum OrderState {
  pending           // session created
  paid              // first capture succeeded
  partial_refunded
  refunded
  failed
  disputed
  charged_back
}

model Subscription {
  id                  String       @id @default(cuid())
  client_id           String
  coach_id            String
  offer_id            String
  state               SubState
  current_period_end  DateTime
  cancel_at_period_end Boolean    @default(false)
  processor_subscription_id String @unique
  created_at          DateTime     @default(now())
  updated_at          DateTime     @updatedAt
}

enum SubState { trialing active past_due unpaid canceled }
```

The webhook table (`WebhookInbound`) holds the raw payload + the
signature-verification result + whether it has been processed.
Idempotency key = processor event id; duplicate POST is a no-op
returning 200.

### 5.3 API sketch

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/offers/:id` | client (with access) or coach (own) | Read offer detail. |
| GET | `/api/storefronts/:slug/offers` | as storefront | Read published offers for a storefront. |
| POST | `/api/offers` | coach | Create offer. Lands in `pending_review` on first publish. |
| PATCH | `/api/offers/:id` | coach (own) | Edit offer. |
| POST | `/api/offers/:id/publish` | coach (own) | Submit for review. |
| POST | `/api/offers/:id/archive` | coach (own) | Archive. Subscriptions stay; no new orders. |
| POST | `/api/checkout/sessions` | client | Create a processor session for an offer. Returns `{ session_url }` for redirect. |
| POST | `/api/billing/webhooks/processor` | processor | Signature-verified inbound webhook. |
| GET | `/api/orders/:id` | client (own) or coach (own offer) or OWNER | Read order. |
| GET | `/api/subscriptions/me` | client | Read own subscriptions. |
| POST | `/api/subscriptions/:id/cancel` | client (own) or OWNER | Cancel at period end. |
| POST | `/api/orders/:id/refund` | OWNER (full refund) or coach (per policy) | Issue refund. |
| GET | `/api/admin/orders/disputes` | OWNER | Disputes inbox. |

Idempotency-Key header required on `POST /api/checkout/sessions` to
prevent double-charges on a retried tap. Returns `409 ORDER_DUPLICATE`
if the same key is used with different parameters within 24 hours.

### 5.4 Checkout UX

Three taps, one screen each.

1. **Offer detail** — `(checkout)/offer/[id].tsx`.
   - Header: title, kind label ("One-time program" / "Subscription —
     monthly" / "Application required" / "Payment plan — 3 ×"), price
     in big bone-on-ink Cormorant, refund policy as a quiet line.
   - Body: summary + description in Inter.
   - Coach card: avatar + name + "Education only" badge.
   - Verbatim `no_outcome_promise` block under the price.
   - CTA: "Continue to checkout" / "Subscribe" / "Apply" / "Buy
     ticket" — single button, oxblood ink on bone.

2. **Confirm** — modal sheet, half-screen.
   - Itemised: `Offer name`, `Coach`, `Amount today`, `Renewal terms`
     (sub only) or `Balance due on confirm` (application-gated) or
     `N installments of $X` (payment plan).
   - `purchase_terms` verbatim disclaimer block above the button.
   - CTA: "Pay $X". Tap → opens processor's hosted checkout (Stripe
     Checkout) in a webview / external browser.

3. **Result** — `(checkout)/result.tsx`.
   - On success: "Receipt — $X — $offer_name — $coach. A copy is in
     your email." plus the `education_only` disclaimer.
   - On failure: "Payment did not go through. No charge was made.
     [Try again]" plus the support email line.

The `(billing)/manage.tsx` screen lets a client see their
subscriptions, cancel-at-period-end, or change their default
payment method (which opens the processor's hosted portal).

### 5.5 Subscription / dunning state machine

```
trialing ──(period end + payment ok)──▶ active
active   ──(payment fails)─────────────▶ past_due
past_due ──(retry succeeds within 14d)──▶ active
past_due ──(retry fails after 14d)──────▶ unpaid
unpaid   ──(client cancels OR 30d)──────▶ canceled
active   ──(client cancels)─────────────▶ canceled (at period end)
canceled ──(period actually ends)───────▶ canceled (terminal)
```

- `past_due` triggers an in-app banner ("Your subscription needs a
  card update.") and an email at T+0, T+3d, T+7d. No SMS without
  consent.
- `unpaid` revokes access to the gated content/space at the end of
  the billing period; the subscription remains in `unpaid` so the
  client can self-revive within 30 days without re-onboarding.
- `canceled` (terminal) preserves history; analytics keeps the row.

### 5.6 Refund policy

A coach picks one of:

- `coach_default` (platform default): 7-day full refund, no-questions-
  asked, then no refund unless OWNER overrides.
- `no_refund`: explicit, ALL CAPS in the offer detail and the
  confirm sheet ("This offer is non-refundable. Continue?").
- `pro_rata`: refund the unused portion (only valid for subs and
  payment plans).
- `seven_day_full`: stronger version of default; explicit copy.

OWNER can refund any order regardless of policy (always-recoverable
escape hatch). Refund triggers an audit log row + an email to the
client + an in-app row in the order history.

## 6. HOW (the runtime PR shape)

PR-FS-2 ships the catalogue: `Offer` + `OfferMedia`, the offer
controller, the read-side mobile screens, and a stub "Buy" button
that returns "Billing not enabled — contact your coach." until
PR-FS-3 lands.

PR-FS-3 ships:

- `Order`, `Subscription`, `RefundEvent`, `WebhookInbound` schema.
- `backend/src/billing/processor/` with the `BillingProcessor`
  interface and the Stripe implementation.
- `POST /api/checkout/sessions`, `POST /api/billing/webhooks/processor`,
  `POST /api/subscriptions/:id/cancel`, `POST /api/orders/:id/refund`.
- `backend/src/billing/state-machine.ts` for subscription transitions.
- Mobile checkout screens.
- The dunning email templates (use the existing transactional email
  pipe from PR #103 area).
- Sentry breadcrumb scrubbing for PCI fields (no card data ever
  enters our stack; this is belt-and-suspenders).
- Pinning tests.

PR-FS-3 ships with `BILLING_ENABLED=false` globally. Production
flip is a separate operator task and is documented in
[`11-rollout-and-ops.md`](./11-rollout-and-ops.md) §7.

## 7. Privacy & security

- **PCI scope** = SAQ-A (we never touch raw card data; processor's
  hosted checkout owns the form).
- **Webhook handling**: signature must be verified; raw body is
  required (NestJS body parser configured per processor); failed
  signature returns 400 and is logged but not retried by us.
- **Idempotency**: every checkout-session POST requires
  `Idempotency-Key` header; duplicates return the existing session.
- **Tenant boundary**: every `Order` carries `coach_id` and
  `client_id`; queries always filter on caller tenant; OWNER
  bypass only with `RoleGuard`.
- **Audit log**: every refund, every dispute, every state
  transition.
- **PII in receipts**: receipt email contains the offer title, the
  coach name, the amount, the date, and the platform support
  address. No client-side balance or net-worth data.
- **Privacy on subscription cancel**: cancellation reason is an
  optional, free-text field; if provided, it stays in the order
  metadata and is not exposed to the coach without explicit opt-in
  by the client.

## 8. Abuse & moderation

- Outcome-claim filter on `title`, `summary`, `description`. Same
  list as PR-FS-1 §8.
- A flag-trip on offer copy halts publish; the offer stays in
  `pending_review` until OWNER or compliance approves.
- Refund-rate alarm: if a coach's 30-day refund rate exceeds 20% of
  orders, OWNER is paged and the coach's `OFFERS_ENABLED` is paused
  pending review.
- Dispute-rate alarm: any dispute >0.5% of trailing-90 volume is a
  pager.
- A coach cannot publish an `affiliate_link` offer pointing to
  another coach's offer that is in `taken_down` state; the coach
  cannot publish if the source coach has `affiliates_enabled=false`.

## 9. Disclaimers (verbatim where they ship)

- `purchase_terms` — above every "Pay" / "Subscribe" / "Apply"
  button on confirm sheets.
- `no_outcome_promise` — under every offer title.
- `education_only` — receipt page footer + manage-billing footer.
- For payment-plan: explicit installment language on the confirm
  sheet: "This is a payment plan. By continuing you authorise N
  charges of $X over Y weeks."
- For application-gated deposit: "Your deposit is fully refundable
  until your application is decided. After approval, the deposit
  is applied to the program balance and is not refundable except
  per the offer's stated refund policy."

## 10. Feature flags & entitlements

| Flag | Scope | Default | Notes |
|---|---|---|---|
| `OFFERS_ENABLED` | global | off | Catalogue master gate. |
| `BILLING_ENABLED` | global | off | Hard gate; off until PR #120 lane #05. |
| `coach_profiles.offers_enabled` | per-coach | off | Pre-condition for first publish. |
| `OFFERS_PAYMENT_PLAN_ENABLED` | global | off | Sub-flag for payment-plan kind. |
| `OFFERS_AFFILIATE_LINK_ENABLED` | global | off | Sub-flag, depends on PR-FS-5. |

Capability matrix delta:

| Capability | L1 | L2 | L3 | coach | coach_premium | OWNER |
|---|---|---|---|---|---|---|
| Buy a one-time / subscription / payment-plan offer | ✓ | ✓ | ✓ | n/a | n/a | n/a |
| Apply to an application-gated offer | ✓ | ✓ | ✓ | n/a | n/a | n/a |
| Create one-time / subscription | n/a | n/a | n/a | ✓ | ✓ | n/a |
| Create payment-plan | n/a | n/a | n/a | ✗ | ✓ | n/a |
| Create application-gated cohort | n/a | n/a | n/a | ✗ | ✓ | n/a |
| Issue refund within own policy | n/a | n/a | n/a | ✓ | ✓ | n/a |
| Force-refund any order | n/a | n/a | n/a | ✗ | ✗ | ✓ |
| Pause coach's offers | n/a | n/a | n/a | ✗ | ✗ | ✓ |

## 11. Analytics

| Event | Where | Properties |
|---|---|---|
| `offer_view` | offer detail mounts | offer_id, kind, coach_id, source |
| `checkout_started` | `POST /api/checkout/sessions` returns | offer_id, kind, amount_cents |
| `checkout_completed` | webhook → `Order.state=paid` | order_id, offer_id, amount_cents, currency |
| `checkout_abandoned` | session > 24h with no event | offer_id, kind |
| `subscription_renewed` | webhook → renewed | subscription_id, period_end |
| `subscription_cancelled` | client OR OWNER cancels | subscription_id, source |
| `subscription_pastdue` | webhook → past_due | subscription_id |
| `refund_issued` | refund completes | order_id, amount_cents, actor |
| `dispute_received` | webhook → disputed | order_id, amount_cents, code |
| `offer_blocked_by_filter` | filter trips on edit/publish | offer_id, field, matched |

## 12. Rollout

- Stage 0: this spec + PR-FS-2 catalogue (no billing).
- Stage 1: PR-FS-3 ships with `BILLING_ENABLED=false`. Internal QA.
- Stage 2: `BILLING_ENABLED=true` for 3 OWNER-selected coaches with
  $1 test offers; smoke test refund + dispute paths against
  processor sandbox.
- Stage 3: 25 coaches, real money, monthly cap on first month
  (`OFFERS_FIRST_MONTH_CAP_CENTS=$X`).
- Stage 4: GA.

Kill switch: `BILLING_ENABLED=false` returns 503 from
`/api/checkout/sessions` and the mobile checkout shows "Billing
temporarily unavailable. Existing subscriptions are not affected."
Existing subscriptions continue to bill (we cannot stop them
without canceling each, which is a separate operator action).

## 13. Tests

- `backend/test/offers.controller.spec.ts`:
  - L1 client cannot create an offer (403).
  - Coach cannot edit another coach's offer (403).
  - First publish lands in `pending_review`.
  - Outcome-claim filter trips on `title` and prevents publish.
- `backend/test/offers-doctrine.spec.ts`:
  - All 30 forbidden phrases trip on `title`, `summary`, `description`.
- `backend/test/billing-state.spec.ts`:
  - Subscription state machine matches §5.5.
  - `past_due → active` on retry within 14d.
  - `past_due → unpaid` after 14d.
  - `unpaid → canceled` after 30d or on client cancel.
  - Webhook idempotency: same event id processed twice is a no-op.
- `backend/test/billing-processor.spec.ts`:
  - Signature verification rejects mangled payloads.
  - `BillingProcessor` adapter interface fakes pass full e2e
    scenarios (paid, refund, dispute, sub renewal).
- `backend/test/refund-policy.spec.ts`:
  - `no_refund` policy: coach cannot refund; OWNER can.
  - `seven_day_full`: full refund within 7 days, otherwise
    `coach_default`.
  - `pro_rata`: subscription refund computes correctly.
- `mobile/test/checkout-screen.spec.tsx`:
  - All disclaimers verbatim on confirm sheet, result page, manage
    page.
  - Result page has no balance / net-worth data.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Processor outage breaks checkout. | Hosted processor checkout means we degrade to "Billing temporarily unavailable" + the existing app keeps working; subscriptions are processor-managed so no double-bill. |
| Refund rate climbs and damages our processor reputation. | Per-coach refund-rate alarm; OWNER auto-pause threshold. |
| Charge-back rate ditto. | Dispute-rate alarm; OWNER pause. |
| Coach issues outcome-promise refunds in support. | Outcome-claim filter on offer copy + on coach-issued refund-decline message templates. |
| Webhook reordering causes state drift. | Idempotency key on every webhook; state machine guards illegal transitions; nightly reconciliation against processor. |
| PCI scope creep (someone tries to take card numbers in-app). | Code review check; doctrine pin that bans `card_number` field name; PR template checkbox. |
| Affiliate link points to a removed offer. | Resolution at checkout time; if source offer is `taken_down`, return 410 + show "This offer is no longer available." |
| Tax handling. | Out of scope for v1; receipts say "Tax may apply per your jurisdiction." Coaches handle their own 1099/T4 with the platform. Stripe Tax is the obvious follow-up; not in scope. |

## 15. Dependencies

- PR-FS-1 (storefront read).
- PR #120 lane #05 (billing packaging) — hard gate.
- PR #120 lane #04 (data lifecycle) — extend GDPR scrub for orders.
- PR #120 lane #07 (migration safety) — additive migration under
  load.
- PR #100 (decimal-aware DTOs) — extends to transaction-side.
- PR #88 (enterprise-hardening) — error envelope reuse.

## 16. Acceptance criteria

For PR-FS-2 (catalogue):

- [ ] `Offer` migrated; closed enum kinds.
- [ ] CRUD endpoints work; coach can author all kinds except
      payment-plan / application-gated unless `coach_premium`.
- [ ] Outcome-claim filter on `title`, `summary`, `description`.
- [ ] Mobile offer detail renders all disclaimers verbatim.
- [ ] "Buy" button is a stub returning "Billing not enabled" until
      PR-FS-3 lands.

For PR-FS-3 (billing):

- [ ] `Order`, `Subscription`, `RefundEvent`, `WebhookInbound`
      migrated.
- [ ] Stripe (or chosen processor) adapter implemented; sandbox
      smoke green.
- [ ] Subscription state machine pinned.
- [ ] Webhook idempotency pinned.
- [ ] Refund policies pinned.
- [ ] All checkout screens render verbatim disclaimers.
- [ ] `BILLING_ENABLED=false` gate works (503 returned).

## 17. Operator handoff

- Runbook: `runbook/billing.md` covers refund process, dispute
  process, dunning timeline, kill-switch flip, processor secrets
  rotation.
- Dashboard tiles: paid orders / 24h, refund rate / 30d, dispute
  rate / 90d, dunning state distribution.
- Alerts: refund rate > 20% (per coach), dispute rate > 0.5%
  (global), webhook signature failures > 5/min, subscription
  failures > 1% (global).
- Smoke check post-deploy: a $1 offer in the QA storefront
  completes end-to-end (paid → refund) against the processor
  sandbox.
