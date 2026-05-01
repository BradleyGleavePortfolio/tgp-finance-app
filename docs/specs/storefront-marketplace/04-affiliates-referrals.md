# 04 — Affiliates & referrals

> **Status:** draft, documentation-only. Authorises runtime PR-FS-5 (affiliates / referrals).

## 1. WHY

Coach-to-coach affiliate sharing and client-to-friend referrals are
the two cheapest growth channels a finance coach has. They are also
the two channels that most quickly run into FTC, CAN-SPAM, and
consumer-finance disclosure trouble if shipped without guardrails.

A coach without an affiliate program will keep doing it manually
through DMs and shared promo codes; we lose attribution and the
client lands somewhere with no disclosure. A client without a
referral surface will keep screen-shotting their app to friends,
which is brand-incoherent and also a compliance risk if the
screenshot includes a balance.

The one-line claim:

> A coach can issue an attributed affiliate link to another coach's
> offer; a client can refer a friend with one tap; both are
> first-party-tracked, payout-controlled, FTC-disclosed, and
> rate-limited; no money figure ever appears in the share preview.

## 2. WHEN

PR-FS-5 ships once:

- PR-FS-3 (billing) is merged so payouts can be funded against
  successful orders.
- A counsel-approved FTC/CAN-SPAM disclosure copy block is pinned.
- A payout-floor + chargeback-clawback policy is approved.
- Per-coach `affiliates_enabled` flag exists.

## 3. WHERE

- `backend/prisma/schema.prisma` — `AffiliateLink`,
  `ReferralAttribution`, `AffiliatePayout`, `ReferralProgram`.
- `backend/src/affiliates/`.
- `mobile/app/(affiliates)/` — coach dashboard + client referral
  surface.
- `backend/src/share-card/` — server-rendered share-card template
  (no money on it).
- `backend/test/affiliates-attribution.spec.ts`,
  `backend/test/affiliates-disclosure.spec.ts`.

## 4. WHO

| Actor | Capability |
|---|---|
| Coach | Issue affiliate links to own offers (default open) and to other coaches' offers (only if source coach opts in to a partner program). View earnings, payouts, clawbacks. |
| Coach (source) | Enable / disable being affiliateable; set commission rate; ban a partner. |
| Client | Refer a friend with a one-tap share card; accept platform-funded referral credit on the friend's first checkout. |
| OWNER | Read all attributions; force-clawback; force-pause an affiliate; review the FTC-disclosure trip queue. |
| Compliance | Spot-check share-card surfaces. |

## 5. WHAT

### 5.1 The two systems, side-by-side

- **Affiliate** = coach issues a link to *any* coach's offer, gets a
  commission per qualified order. Commission rate set by source
  coach (capped at platform max, default 30%); platform takes a
  small share of the gross (parameter, default 10% of gross).
- **Referral** = client invites a friend; friend gets a platform-
  funded credit (default $20 off first one-time offer); referrer
  gets a non-cash recognition (a quiet "Referral made" ledger row
  in their profile, never a leaderboard, never a money line).

Two systems to keep referral simple (no payouts, no 1099) and to
keep affiliates accountable (per-coach payout, per-coach pause).

### 5.2 Data sketch

```prisma
model AffiliateLink {
  id              String       @id @default(cuid())
  partner_coach_id String      // the coach who EARNS from this link
  source_offer_id String       // the offer being affiliated
  source_coach_id String       // the coach who OWNS the offer
  code            String       @unique // url-safe, 8 chars, random
  commission_bps  Int          // basis points, 0..5000 (max 50%)
  state           AffiliateState @default(active)
  created_at      DateTime     @default(now())
  updated_at      DateTime     @updatedAt
}

enum AffiliateState { pending_source_opt_in active paused banned }

model ReferralAttribution {
  id              String       @id @default(cuid())
  referrer_kind   ReferrerKind // 'affiliate' | 'client_referral'
  referrer_id     String       // affiliate_link.id OR client.user.id
  attributed_user_id String    // the new client
  attributed_order_id String?  // resolves on first paid order
  state           AttributionState @default(active)
  attributed_at   DateTime     @default(now())
  paid_out_cents  Int          @default(0)
  clawed_back_cents Int        @default(0)
  expired_at      DateTime?    // 14d from attributed_at if no order
}

enum ReferrerKind { affiliate client_referral }
enum AttributionState { active matured clawed_back expired }

model AffiliatePayout {
  id              String       @id @default(cuid())
  partner_coach_id String
  period_start    DateTime
  period_end      DateTime
  gross_cents     Int
  fees_cents      Int
  net_cents       Int
  state           PayoutState
  processor_payout_id String?  @unique
  released_at     DateTime?
  notes           String?
}

enum PayoutState { pending released held disputed }
```

Attribution is **first-touch** by default with a 14-day cookie-
equivalent (we store a server-side attribution row keyed on the
new account's `user_id`). If a user re-clicks a different link in
that window and signs up later, the *first* link wins. Last-touch
is a per-coach setting only on `affiliate` (not `client_referral`).

### 5.3 API sketch

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/affiliates/links` | coach | Create link to own offer (auto-active) or to another coach's (pending opt-in). |
| GET | `/api/affiliates/links/me` | coach | List own affiliate links. |
| POST | `/api/affiliates/links/:id/pause` | coach (own) | Pause. |
| POST | `/api/affiliates/links/:id/source_decide` | source coach | Approve / deny / ban. |
| GET | `/api/affiliates/dashboard/me` | coach | Earnings, payouts, attributions. |
| GET | `/api/admin/affiliates/payouts` | OWNER | Payout queue. |
| POST | `/api/admin/affiliates/payouts/:id/release` | OWNER | Release a payout. |
| POST | `/api/admin/affiliates/payouts/:id/clawback` | OWNER | Force clawback. |
| POST | `/api/referrals/me/links` | client | Issue / refresh own referral code. |
| GET | `/api/referrals/me` | client | View own referral history (no money figures, just counts). |
| GET | `/r/:code` | unauthed | First-touch attribution then redirect to deeplink. |

The `/r/:code` redirect is on the API host, not on the App. It
sets a 14-day attribution server-side keyed by anonymous tracking
id, then redirects to `tgp://app/c/<slug>` with the attribution
token. On signup, the attribution row gets a `user_id`.

### 5.4 Share card

A server-rendered PNG (1080×1920 portrait) with:

- The coach name, the offer title, the education-only line.
- **No money figure** anywhere on the card. Pinned by
  `backend/test/share-card-doctrine.spec.ts` — the renderer fails
  the test if any string token matches `\$\d` or `\b\d+%\b` or
  `\byield\b` etc.
- A subtle "Shared by Friend" or "Shared by Coach" footer (no real
  names without consent).

Share card is requested by the mobile share sheet via a signed URL;
the URL has a 24-hour expiry to avoid stale share cards persisting
across coach edits.

### 5.5 Disclosure copy (FTC etc.)

- On every coach dashboard surface that displays an affiliate link:
  "**Affiliate disclosure**: when a person you refer buys this
  offer, you earn a commission. The Growth Project requires you
  disclose this to anyone you share the link with. The link page
  also shows the disclosure to the buyer."
- On the offer page reached via an affiliate link:
  "You arrived here from a partner. The partner will earn a
  commission if you purchase. The Growth Project sets the
  commission cap and reviews partner activity."
- On the referral surface:
  "Refer a friend. They get $20 off their first program. You get
  acknowledgement in your profile (no cash). Standard education
  disclaimers apply."

All three blocks pinned in `backend/src/compliance/disclaimers.ts`.

## 6. HOW (the runtime PR shape)

PR-FS-5 ships:

1. The four schemas (additive).
2. `backend/src/affiliates/` module with the attribution service,
   the payout job (cron / nightly), the clawback job (on dispute
   webhook).
3. `backend/src/share-card/` server-rendered PNG (Headless Chromium
   already in use for charts? otherwise a small PIL/Skia rendering
   service — implementation chosen in the runtime PR).
4. The mobile coach dashboard + client referral surface.
5. The `/r/:code` redirect endpoint with first-touch logic.
6. The clawback hook on `Order.refunded` and `Order.charged_back`
   webhooks (PR-FS-3 emits these).
7. Pinning tests: attribution, share-card doctrine, disclosure
   copy.

## 7. Privacy & security

- Attribution is server-side; we do not embed the affiliate code in
  app local storage to avoid the tracker-cookie analogue. The
  `/r/:code` redirect creates a row keyed by an anonymous device id
  + IP hash; first signup within 14 days resolves that row to a
  `user_id`.
- The anonymous attribution token is rotated on signup; the IP hash
  is stored salted and dropped after 30 days.
- Coach affiliate dashboard never shows another coach's client
  list; only attributed-orders for *their* coach id.
- GDPR scrub covers `ReferralAttribution.attributed_user_id` and
  `attributed_order_id`.
- Payouts go through the processor's payout API (Stripe Connect,
  same posture as PR-FS-3). KYC/B is processor-managed.

## 8. Abuse & moderation

- Per-coach affiliate-link cap: 50 active links (configurable per
  OWNER override).
- Anti-self-referral: an affiliate link cannot earn on an
  attribution where the new user's email matches the partner
  coach's email (or any of the coach's claimed accounts).
- Sock-puppet check: if a partner coach's attributions cluster on a
  single device-id family, OWNER is paged.
- Chargeback ratio: a partner whose attributions show > 1.5%
  chargeback rate (90-day rolling) is auto-paused.
- Refund clawback: a refunded order claws back the commission
  (full); a partial refund claws back proportionally. Pinned.
- Disclosure-trip: any share card that fails the no-money pin
  renders a fallback card with no media (just the title and the
  disclaimer line) and pages OWNER.

## 9. Disclaimers (verbatim)

- See §5.5 — three blocks pinned.
- Plus the platform-wide `education_only` and `no_outcome_promise`
  inherit on every share card, dashboard, and inbox surface.

## 10. Feature flags & entitlements

| Flag | Default | Notes |
|---|---|---|
| `AFFILIATES_ENABLED` | off | global. |
| `coach_profiles.affiliates_enabled` | off | per-coach gate; pre-condition for issuing or earning. |
| `REFERRALS_ENABLED` | off | global; client-to-friend surface. |
| `REFERRALS_CREDIT_CENTS` | 2000 | platform-funded credit per qualified referral. |
| `AFFILIATES_PAYOUT_FLOOR_CENTS` | 5000 | minimum balance before payout runs. |

| Capability | client | coach | coach_premium | OWNER |
|---|---|---|---|---|
| Refer a friend | ✓ | n/a | n/a | n/a |
| Issue affiliate link to own offer | n/a | ✓ | ✓ | n/a |
| Issue link to *another coach's* offer | n/a | only with source opt-in | only with source opt-in | n/a |
| Pause / ban a partner | n/a | source coach only | source coach only | always |
| Force clawback | n/a | n/a | n/a | ✓ |

## 11. Analytics

| Event | Where | Properties |
|---|---|---|
| `affiliate_link_created` | POST /links | partner_coach, source_coach, offer_id, commission_bps |
| `affiliate_link_clicked` | /r/:code | code (attribution row id only — no PII) |
| `referral_attributed` | first paid order | referrer_kind, attributed_order, gross_cents (for analytics only — never displayed to a user) |
| `referral_clawed_back` | refund/chargeback | attributed_order_id, amount |
| `affiliate_payout_run` | OWNER releases | partner, net_cents, period |
| `affiliate_paused` | source-coach action | partner, source_offer |
| `share_card_blocked_by_filter` | renderer | offer_id, matched |

## 12. Rollout

- Stage 0: this spec.
- Stage 1: PR-FS-5 ships with `AFFILIATES_ENABLED=false` and
  `REFERRALS_ENABLED=false`.
- Stage 2: REFERRALS_ENABLED for L1+ users; no payouts (credit
  funded by platform OOB).
- Stage 3: AFFILIATES_ENABLED for 3 partner pairs; manual payout.
- Stage 4: Automated payouts through Stripe Connect.

Kill switch: either flag off → 503 on `/api/affiliates/*` and
`/api/referrals/*`. Existing attributions stay; payouts pause.

## 13. Tests

- `backend/test/affiliates-attribution.spec.ts`:
  - First-touch wins.
  - 14-day expiry.
  - Anti-self-referral.
  - Clawback proportional to refund.
- `backend/test/affiliates-disclosure.spec.ts`:
  - All three disclosure blocks present on the relevant surfaces.
- `backend/test/share-card-doctrine.spec.ts`:
  - Renderer rejects any token matching the no-money corpus.
- `mobile/test/referral-screen.spec.tsx`:
  - No money figures rendered.
  - Disclosure block verbatim.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Sock-puppet farms inflating affiliate revenue. | Device-id clustering; chargeback-rate alarm; OWNER review on first payout. |
| Self-referral. | Anti-self-referral check; OWNER pause on detection. |
| Disclosure misses on a share. | Pinned disclosure copy on every surface; share-card no-money pin. |
| Coach uses affiliate link to bypass their own offer's outcome filter. | Outcome filter still applies on the source offer copy; affiliate link doesn't bypass. |
| Refund-on-purchase loophole (buy with friend's link, refund). | Clawback is proportional and immediate; refund-rate alarm includes referred orders. |
| Cookie-equivalent attribution privacy. | Server-side row, no cross-site data; salted IP hash; 30-day retention. |

## 15. Dependencies

- PR-FS-3 (billing).
- PR #120 lane #03 (security/RBAC).
- PR #120 lane #05 (billing packaging — Stripe Connect for payouts).
- Existing GDPR scrub pipe.

## 16. Acceptance criteria

- [ ] Schemas migrated additively.
- [ ] First-touch attribution + 14-day expiry pinned.
- [ ] Anti-self-referral pinned.
- [ ] Clawback on refund/chargeback pinned.
- [ ] All three disclosure blocks pinned and rendered.
- [ ] Share card no-money pin green.
- [ ] Payouts manual in stage 3, automated in stage 4.

## 17. Operator handoff

- Runbook: `runbook/affiliates.md` covers payout release, clawback,
  partner ban, sock-puppet investigation.
- Dashboard tiles: active partners, attributions / 7d, payout
  queue depth, clawback rate.
- Alerts: chargeback rate > 1.5% for any partner; disclosure-block
  render failure; share-card filter trip.
