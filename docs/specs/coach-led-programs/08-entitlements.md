# Entitlements — L1 / L2 / L3 + Coach Tiers

> **Read this first.** Every other spec in this set cites the entitlement
> tiers by name. If a downstream spec contradicts this document, this
> document wins and the downstream spec needs an amendment.

---

## 1. Why

The Growth Project: Finance today has one product. After this work, it
has three: a solo product (L1), a coach-led product (L2), and a
concierge product (L3). The same backend serves all three, and the
**only** thing that changes between them is what the user can read,
what they can write, and which coach surfaces are addressable to them.

A clean entitlement model matters for three reasons:

- **Privacy.** L2/L3 features expose progress to a coach. We do not
  want a single missed gate to leak the wrong client's data into the
  wrong coach's roster.
- **Sale-readiness.** A potential acquirer wants to see one column
  that says "what does this user pay for". One column, on `users`,
  is the cheapest answer.
- **Doctrine.** The repo has a strict no-confetti, no-gamification
  rule. A tier model expressed in the data is hard to gamify; a
  tier model expressed in the UI ("UPGRADE NOW") is easy to gamify
  and we will not ship that.

## 2. When

The tier is set at three points in a user's lifecycle:

1. **At signup**, the default is `L1`. A user who arrives via a coach
   invite link gets `L2` if the inviting coach has the `coach_premium`
   tier and there is capacity on their plan; otherwise `L1`.
2. **On admin promotion** via `/api/admin/users/:id/tier` (owner-only),
   the column flips. This is the single mutation path for a tier
   change.
3. **On billing webhook** (out of scope for this spec set; the spec
   only requires that whatever wires Stripe → `users.entitlement_tier`
   uses the admin endpoint and not a direct DB write, so the audit
   log is consistent).

The tier never auto-downgrades. If a user's billing lapses, the
external billing system is responsible for calling the admin endpoint
to demote. There is no "trial expiration" cron in this spec set; we
prefer the owner explicitly downgrades than the system silently
removes a coach's view of their roster.

## 3. Where

- **Backend module:** `backend/src/users/` — the existing users module
  gains the `entitlement_tier` column on `User` and an admin route to
  set it. No new module.
- **Schema migration:** one migration adds the column with a default
  of `L1`. Existing rows backfill to `L1`. The founding cohort that
  is paying today gets bulk-updated to `L2` or `L3` in a one-shot
  script run by the owner during the rollout (see
  `10-rollout-and-ops.md`).
- **Mobile route:** no new route. The existing `mobile/app/settings/`
  surface gains a read-only "Membership" card that renders the tier
  the backend reports.
- **Federation:** the federation surface gains a `tier` field on the
  client summary so the unified admin console can show it.

## 4. Who

- **Reads:** the user themselves (own tier only), their coach (tier
  of every client on their roster, but no other coach's clients), the
  owner (everyone).
- **Writes:** the owner only. Coaches and clients have no write path
  to their own tier or anyone else's. The admin endpoint enforces
  this.
- **Tenancy:** unchanged from the existing tenancy model
  (`backend/docs/TENANCY.md`). The new column is read-scoped using
  the same role-aware helper.

## 5. What — the data model

### 5.1 Schema additions

```prisma
enum EntitlementTier {
  L1   // solo client (today's product)
  L2   // coach-led
  L3   // concierge
}

enum CoachTier {
  coach           // standard
  coach_premium   // expanded capacity + video on content boards
}

model User {
  // ... existing fields ...
  entitlement_tier EntitlementTier @default(L1)
  // ... existing relations ...
}

model CoachProfile {
  // ... existing fields ...
  coach_tier            CoachTier @default(coach)
  feature_flags         Json      @default("{}")   // per-coach allowlist (see §7.5 of overview)
  max_active_clients    Int?
  max_published_programs Int?
}
```

`feature_flags` is intentionally `Json` and intentionally
unconstrained — its shape is described in `10-rollout-and-ops.md`,
and it is the per-coach half of the global+coach flag pair from
`00-overview.md` §7.5.

### 5.2 What each tier unlocks

| Capability | L1 | L2 | L3 |
|---|---|---|---|
| Net-worth, EOD, priority waterfall, what-if, AI coach (20 req/hr), milestones, accountability pairing, community feed | ✅ | ✅ | ✅ |
| Coach-assigned regimens (`05-regimens.md`) | — | ✅ | ✅ |
| Coach-assigned challenges (`01-challenges.md`) | — | ✅ | ✅ |
| Coach content board (`04-content-boards.md`) | — | ✅ | ✅ |
| Opt-in leaderboard (`02-leaderboards.md`) | — | opt-in | opt-in |
| Coach messaging beyond a single thread | — | ✅ | ✅ |
| AI coach 60 req/hr (vs 20 req/hr default) | — | — | ✅ |
| Concierge support response (24h SLA) | — | — | ✅ |
| Founding-member identity title surface | — | — | ✅ |

### 5.3 What each coach tier unlocks

| Capability | `coach` | `coach_premium` |
|---|---|---|
| Up to 25 active clients | ✅ | ✅ |
| Up to 100 active clients | — | ✅ |
| Publish up to 5 regimens | ✅ | ✅ |
| Publish unlimited regimens | — | ✅ |
| Content board accepts PDF + link + newsletter | ✅ | ✅ |
| Content board accepts video uploads | — | ✅ |
| Run leaderboards | — | ✅ |

The exact numbers are tunable via `coach_profiles.max_active_clients`
/ `max_published_programs` per-coach overrides; the defaults above
ship in the migration.

## 6. How — the implementation pattern

### 6.1 Reading the tier

All read paths route through a single helper:

```ts
// src/common/entitlements.ts (new file in implementation PR)
export function tierOf(user: { entitlement_tier: EntitlementTier }) {
  return user.entitlement_tier;
}

export function canAccess(
  user: { entitlement_tier: EntitlementTier },
  capability: 'programs' | 'challenges' | 'content' | 'leaderboard' | 'messaging_extended' | 'ai_coach_high_rate' | 'concierge_support' | 'founding_title',
): boolean {
  // Single switch, named capabilities only. No "feature_flags"
  // string lookup at the call site.
}
```

Every controller that gates an L2/L3 surface calls `canAccess` and
returns `403 NOT_ENTITLED` (with no further detail) when it returns
false. The error code is the same shape as `NOT_YOUR_STUDENT` so an
attacker cannot probe the tier of another user by trying their ID
on a tier-gated route.

### 6.2 Writing the tier

```
PUT /api/admin/users/:id/tier
Body: { tier: 'L1' | 'L2' | 'L3', reason?: string }
Auth: JWT + RoleGuard('owner')
```

On success, writes:

- the `users.entitlement_tier` column,
- a `coach_notes` row attributed to the owner with the `reason`
  string (or "tier change without reason"). This is the audit log;
  there is no separate audit table for tier changes.
- a `push_logs` event for the user with type `entitlement_changed`.

The endpoint is idempotent: setting the tier to its current value is
a no-op (no audit row, no push).

### 6.3 Rejecting writes from non-owners

The endpoint is the only mutation path. There is no "self-upgrade"
endpoint. There is no client-side path. Anyone trying to write
`entitlement_tier` directly via the existing `/api/profile` PUT
endpoint gets the field stripped at the Zod boundary
(`UpdateProfileSchema` will not include it).

### 6.4 Tests

- `test/entitlements.spec.ts` — `canAccess` unit tests for every
  (tier × capability) cell.
- `test/admin-tier.controller.spec.ts` — owner can write, coach
  cannot, student cannot, idempotent on no-op.
- `test/profile-update.spec.ts` — `entitlement_tier` is rejected at
  the Zod boundary on `PUT /api/profile`.
- `test/users-access-status.spec.ts` (existing) — extended to assert
  the membership card shows the live tier.

## 7. Privacy & security

- **Read scope.** The tier of another user is never returned to a
  caller who is not (a) the user themselves, (b) their coach, or (c)
  the owner. This is enforced at the Zod *response* layer (the
  outbound DTO drops the field if the caller is not in the
  privileged set), not just the query.
- **No tier in client-side analytics events.** The mobile app may
  send `analytics.capture('upgrade_clicked')` — it must **not** send
  `analytics.capture('upgrade_clicked', { tier: 'L2' })`. The reason
  is that PostHog identifies users; if we ship the tier as a property
  we are PII-mapping to a billing state and our retention policy is
  not built for that.
- **Tier in server-side analytics is allowed**, but only on the
  events that already enumerate tenancy (e.g. coach-roster summary).

## 8. Abuse & moderation

Three concrete abuse vectors:

1. **Tier inference via response shape.** An attacker hits
   `/api/programs` (which is L2-gated) on someone else's session
   token; if it returns 403 with a different shape from a 404 they
   can probe tier. **Mitigation:** the 403 shape is identical to the
   404 shape — `{ error: 'NOT_FOUND' }` — for unauthorised reads.
   The actual `NOT_ENTITLED` shape is reserved for the *caller's
   own* requests.
2. **Coach induces a client to reveal tier in chat.** Out-of-band;
   not technically preventable. We document the policy in the coach
   onboarding email: tier is a billing detail; do not pressure
   clients to upgrade in chat. The chat moderation pass
   (`07-messaging-progress.md`) does not block tier-related text by
   default but flags it for review.
3. **Owner promotes themselves.** The owner already has every
   bypass. There is no defensive measure here beyond the existing
   audit log; the threat is "rogue owner", not "rogue user", and the
   answer is process, not code.

## 9. Feature flags

Two flags govern rollout:

- `FEATURE_TIER_GATING_ENABLED` — global. When false, every
  `canAccess` call returns true for L2/L3 capabilities (so we can
  ship the code dark and verify the tier surface is wired without
  enforcing). Defaults to false at first deploy.
- `coach_profiles.feature_flags.tier_gating_active` — per-coach.
  When set, the coach's roster is subject to tier gating regardless
  of the global flag. This is the rollout hammer.

The kill-switch for an incident is to flip
`FEATURE_TIER_GATING_ENABLED=false` and let every request through.
The off-state is more permissive than the on-state so a bad release
does not lock paying customers out.

## 10. Analytics

Server-side events emitted on the `analytics` module:

- `entitlement.tier_changed` — `{ user_id, prev_tier, next_tier,
  reason, by_user_id }`. Powers the owner audit dashboard.
- `entitlement.gate_denied` — `{ user_id, capability }`. Powers the
  "who tried what" funnel for product to see which gated surface is
  most-pulled-against.
- `entitlement.gate_allowed` — emitted only on capability boundaries
  (first time a user uses a tier-gated capability per session). Not
  emitted on every read.

Client-side: nothing tier-aware. See §7.

## 11. Rollout

Three cohorts, in order:

1. **Founders.** Owner manually sets the founding cohort to `L2`
   via the admin endpoint. Validates the membership card renders.
   No external-facing changes.
2. **Consenting coaches.** A small number of coaches enable
   `coach_profiles.feature_flags.tier_gating_active` for their own
   roster. Validates that coach-led surfaces work end-to-end.
3. **General availability.** Owner flips
   `FEATURE_TIER_GATING_ENABLED=true`. Every coach is now subject
   to the tier model.

The kill-switch is the global flag. Rollback is `flyctl secrets
unset FEATURE_TIER_GATING_ENABLED -a tgp-finance-api`.

## 12. Tests (must exist before merge of the implementation PR)

- `test/entitlements.spec.ts` — every cell of the matrix.
- `test/admin-tier.controller.spec.ts` — write surface auth + audit.
- `test/profile-update.spec.ts` — Zod strips `entitlement_tier`.
- `test/users-access-status.spec.ts` — membership card surface.
- `test/admin-federation.service.spec.ts` (extend) — federation
  surface includes `tier` on the client summary.

## 13. Risks

1. **Tier drift between billing system and `entitlement_tier`.**
   A Stripe webhook fails; the column stays stale; the coach
   surfaces the wrong view of the client. **Response:** the billing
   system reconciles nightly via the admin endpoint; staleness > 24h
   surfaces on an owner alert.
2. **A new module forgets to call `canAccess`.** **Response:** the
   `canAccess` helper is the ONLY tier check in the codebase; a
   `grep` test in CI rejects any controller that gates a capability
   with a string compare on `entitlement_tier` instead. (See
   `test/entitlements-codebase.spec.ts` in the implementation PR.)
3. **The L2/L3 boundary blurs.** Marketing wants to add a feature
   to L3; eng wants to gate it differently. **Response:** every
   capability is named in §5.2 of this doc; adding a new capability
   means amending this doc in the same PR as the implementation,
   per the §"Documentation rule" gate in `README.md`.

## 14. Dependencies

- `00-overview.md` §8 (the matrix is duplicated there in a shorter
  form; keep this doc as the authoritative source).
- `users` module (column add, admin endpoint).
- Federation service (extends client summary with tier).
- Mobile settings surface (read-only render).

## 15. Acceptance criteria

- [ ] Migration adds `entitlement_tier` to `users` and
      `coach_tier`, `feature_flags`, `max_active_clients`,
      `max_published_programs` to `coach_profiles`. Backfill is
      `L1` / `coach`.
- [ ] `PUT /api/admin/users/:id/tier` exists, owner-only, writes
      audit + push.
- [ ] `canAccess` is the single tier check. CI rejects any other
      pattern.
- [ ] Membership card on the mobile settings surface renders the
      live tier.
- [ ] Federation surface includes the tier field on client summary.
- [ ] Trust Center capability flag for "tier gating" is **not**
      added in this PR (we don't put a sales surface on the Trust
      Center; the Trust Center is for capabilities that exist
      end-to-end and the gate-not-bypass is the capability, not
      the existence of paid tiers).

## 16. Operator handoff

When the implementation PR ships:

1. Apply the migration (`npm run migrate:deploy` runs as the
   release command — see `README.md` §"Production Deploy"). The
   migration is non-destructive (default-backed column add).
2. Bulk-promote the founding cohort:
   ```sql
   UPDATE users SET entitlement_tier = 'L3'
   WHERE email IN ( ... founding cohort emails ... );
   ```
   Execute against production once, log the row count, paste in the
   ops thread.
3. Set the global flag dark for one release cycle:
   `flyctl secrets set FEATURE_TIER_GATING_ENABLED=false -a
   tgp-finance-api`. Verify the membership card renders.
4. Enable per-coach for the validating coaches.
5. Flip the global flag on for GA.
6. The `entitlement.gate_denied` analytics event is the funnel
   marketing reads; surface it on the existing PostHog dashboard.
