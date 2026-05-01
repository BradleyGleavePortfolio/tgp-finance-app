# Rollout, Analytics, Telemetry, Operator Handoff

> **Read this last.** Every other spec in this set names its own
> feature flag, analytics events, and rollout cohort. This document
> consolidates them, names the kill-switches, defines the operator
> playbook, and sets the rules for adding new flags / events without
> having to amend every other spec.

## 1. Why

Eight downstream specs introduce eight surfaces. Each is shippable
independently. Without a single rollout doc the operator handoff is:
"read every README". With this doc, the operator reads one page and
runs the feature.

## 2. The flag taxonomy

Two categories, and only these two.

### 2.1 Global flags (`flyctl secrets set`)

Set on the Fly app (or your hosting equivalent). Affect every
request system-wide. Always default to `false` at first deploy so
the surface is dark.

| Flag | Surface | Off-state behaviour |
|---|---|---|
| `FEATURE_TIER_GATING_ENABLED` | Entitlements | Every `canAccess` returns true. **Off-state is more permissive** — see `08-entitlements.md` §9. |
| `FEATURE_PROGRAMS_ENABLED` | Regimens | `/api/coach/programs/*` and `/api/programs/*` return `404`. Legacy `/api/coach/templates/*` keeps working. |
| `FEATURE_CHALLENGES_ENABLED` | Challenges + leaderboards | Routes return `404`. EOD hook short-circuits. Leaderboards inherit. |
| `FEATURE_CONTENT_ENABLED` | Content boards | Routes return `404`. Existing assigned content metadata still readable; signed-URL mints rejected. |
| `FEATURE_AVATARS_ENABLED` | Avatars | Upload endpoint `404`. Stored avatars still served (CDN public URLs). |
| `FEATURE_MESSAGING_EXTENDED_ENABLED` | Subject threads + structured progress | Single-thread continues. Subject-thread routes `404`. |
| `FEATURE_MODERATION_QUEUE_ENABLED` | Owner moderation queue | Reports route to concierge inbox. |

### 2.2 Per-coach flags (`coach_profiles.feature_flags`)

A `Json` blob on `CoachProfile`. Controlled by the owner via
`/api/admin/coaches/:id/feature-flags` (implementation PR).
Default empty `{}`.

```jsonc
{
  "challenges_enabled": true,
  "leaderboards_enabled": false,
  "content_enabled": true,
  "programs_enabled": true,
  "messaging_extended_enabled": true,
  "tier_gating_active": true,
  // Future flags land here. The Json shape is intentionally open.
}
```

A coach gets a surface iff **both** the global flag is `true`
**and** the per-coach flag is `true`. The exception: when the
global flag is `false`, the per-coach flag can override (founders
running the feature dark globally). When the global flag is
`true`, the per-coach flag's `false` value still gates the coach
out (i.e. opt-in per coach is the model — opt-out is via the
global flag's `false`, which is the kill-switch).

## 3. Rollout cohorts

The same three-step cohort applies to every surface:

1. **Founders.** Owner enables the global flag; per-coach flag for
   the founding cohort. Validate end-to-end with a single client.
2. **Validating coaches.** Three-to-five additional coaches
   enable per-coach. 30 days of activity. Watch the analytics.
3. **General availability.** Per-coach becomes the coach's own
   decision; global flag stays on.

The order of surfaces: tier → programs → challenges → content →
leaderboards → avatars → messaging-extended → moderation-queue.
The order is deliberate:

- Tier first: every other surface gates against it.
- Programs before challenges: challenges optionally attach to
  program phases.
- Content before leaderboards: leaderboards are not a primary
  surface.
- Avatars in the middle of the order: independent of all the
  others, but the visual surface change is best landed after the
  data plumbing is on.
- Moderation queue last: until then, reports go to the concierge
  inbox.

## 4. The kill-switch playbook

Each surface has a **single command** kill-switch. The kill-switch
is the global flag.

| Incident | Command |
|---|---|
| Programs on fire | `flyctl secrets unset FEATURE_PROGRAMS_ENABLED -a tgp-finance-api` |
| Challenges/EOD hook misbehaving | `flyctl secrets unset FEATURE_CHALLENGES_ENABLED -a tgp-finance-api` |
| Content storage / signed URL bug | `flyctl secrets unset FEATURE_CONTENT_ENABLED -a tgp-finance-api` |
| Avatar moderation incident | `flyctl secrets unset FEATURE_AVATARS_ENABLED -a tgp-finance-api` |
| Messaging surface bug | `flyctl secrets unset FEATURE_MESSAGING_EXTENDED_ENABLED -a tgp-finance-api` |
| Tier gating regressing paying customers | `flyctl secrets unset FEATURE_TIER_GATING_ENABLED -a tgp-finance-api` |

After unsetting:

1. Verify on `/api/system/release-info` that the capability flag
   reports the surface as off.
2. The mobile app reads the capability flag on launch and hides
   the surface.
3. Page the owner; document the incident in the postmortem
   notebook.

A kill-switch never deletes data. Re-enabling restores the
surface; in-flight assignments resume where they left off.

## 5. Analytics — consolidated event vocabulary

A single namespace per surface. Events shipped to PostHog
(`POSTHOG_KEY` env var; today gated by
`backend/src/analytics/`).

```
entitlement.tier_changed
entitlement.gate_denied
entitlement.gate_allowed

programs.created
programs.published
programs.assigned
programs.phase_advanced
programs.completed
programs.abandoned
programs.migrated_version
programs.rescinded

challenges.created
challenges.published
challenges.assigned
challenges.progress_event
challenges.completed
challenges.abandoned
challenges.rescinded

leaderboards.viewed_by_coach
leaderboards.viewed_by_client
leaderboards.optin_changed

content.uploaded
content.published
content.assigned
content.opened
content.rescinded
content.takedown

avatar.uploaded
avatar.removed
avatar.takedown

messages.thread_created
messages.sent
messages.read
coach_progress.viewed

compliance.url_stripped
compliance.outcome_guarantee_flagged
compliance.report_filed
compliance.takedown
```

### 5.1 Required event-payload shape rules

- No PII in payloads. User ids; not emails, names, balances.
- No `Decimal` fields. Money never traverses the analytics
  pipeline.
- Server-side emitted only (the mobile app emits no analytics
  event tagged with tier or PII; see `08-entitlements.md` §7).
- Every event has a `timestamp` (auto-added) and `user_id` (auto-
  added when the request is authenticated).

A doctrine pin test (`test/analytics-doctrine.spec.ts`) asserts
that the payload schemas defined in `src/analytics/events.ts`
satisfy these rules.

## 6. Healthy-signal table

The "is the surface working?" signal per surface, monitored on the
existing PostHog dashboards.

| Surface | Healthy when |
|---|---|
| Programs | Median time-to-completion within 30 days of `duration_weeks`; ≥ 60% reach final phase. |
| Challenges | `(completed + active) / assigned > 0.6` over a 30-day window. |
| Leaderboards | Per-challenge opt-in rate > 30%. |
| Content | `opened / assigned > 0.5` within 7 days of assignment. |
| Avatars | Encoder error rate < 0.5%. |
| Messaging | Median time-to-first-read < 6h on coach → client. |
| Moderation | SLA: acknowledged within 48h, resolved within 7d. |

Below threshold: the surface is **not** killed automatically —
unhealthy signals trigger a quiet review by the owner, not an
automated rollback.

## 7. Telemetry — error budget per surface

Sentry (`SENTRY_DSN`) catches errors. The error-budget thresholds:

- **Programs / Challenges service errors**: < 0.5% of requests
  over a 24h window.
- **Content storage errors** (Supabase 5xx): < 1% (network
  variance).
- **Sanitiser exceptions** (markdown sanitiser, allowlist parser):
  zero. A sanitiser exception is a security alert, not a budget
  item.

A breached budget pages the owner via Sentry's existing alerting.

## 8. Operator playbook — first-deploy checklist

In order:

```
# 0. Apply the schema migration (release_command runs this for you).
#    Verify on the Fly logs that prisma migrate deploy completed.

# 1. Set every global flag to false.
flyctl secrets set \
  FEATURE_TIER_GATING_ENABLED=false \
  FEATURE_PROGRAMS_ENABLED=false \
  FEATURE_CHALLENGES_ENABLED=false \
  FEATURE_CONTENT_ENABLED=false \
  FEATURE_AVATARS_ENABLED=false \
  FEATURE_MESSAGING_EXTENDED_ENABLED=false \
  FEATURE_MODERATION_QUEUE_ENABLED=false \
  -a tgp-finance-api

# 2. Promote the founding cohort to L2/L3.
psql "$DATABASE_URL" -c "
UPDATE users SET entitlement_tier = 'L3'
WHERE email IN (...);
"

# 3. For each founding coach, enable per-coach flags.
psql "$DATABASE_URL" -c "
UPDATE coach_profiles
SET feature_flags = feature_flags
  || '{\"programs_enabled\": true,
       \"challenges_enabled\": true,
       \"content_enabled\": true,
       \"messaging_extended_enabled\": true}'::jsonb
WHERE user_id IN (...);
"

# 4. Validate end-to-end with one founding coach + one client.
#    See the surface-specific 'Operator handoff' sections.

# 5. Begin the global-flag rollout per the order in §3.
```

The playbook is also encoded as a script in
`scripts/rollout/coach-led-programs.sh` (implementation PR — kept
in `scripts/` so the operator can run it, not in
`backend/scripts/release.sh` which is for release-VM tasks).

## 9. The README updates required at merge

Per `README.md` §"Documentation rule — every PR updates a README":

- Each implementing PR updates its module's `README.md` (the
  spec set creates the modules; their READMEs ship empty
  templates and fill on each implementing PR).
- The root `README.md` § "What is in the app" gains entries for
  programs, challenges, content board, leaderboard, messaging
  extensions, avatars.
- The root `README.md` § "Environment Variables" gains every new
  global flag.
- `backend/docs/TENANCY.md` § "RLS migration plan" gains the new
  tables in the appropriate phase.
- `backend/src/admin/README.md` extends the federation surface
  section with the new endpoints.
- `mobile/DESIGN.md` is reviewed but is not expected to grow new
  rules — the surfaces follow the existing rules.
- `.env.example` adds every new flag with a sensible default
  (`=false`).

## 10. Capacity & cost projections

Rough numbers for the operator's expected steady-state:

| Surface | Per-coach storage | Per-client storage | Compute |
|---|---|---|---|
| Programs / Challenges | < 1 MB rows | < 100 KB rows | EOD hook adds ~5ms per submission. |
| Content (PDF) | ~10 MB / 10 PDFs | n/a | Single signed-URL mint per open. |
| Content (video) | ~300 MB / 10 videos at `coach_premium` | n/a | ~30s encode on upload. |
| Avatars | ~150 KB | ~150 KB | One-time encode on upload. |
| Messaging | < 1 MB rows | < 1 MB rows | n/a |

Steady-state for a 50-coach, 1500-client cohort:

- Postgres: rows are dominated by `messages` and `program_assignment_events`.
  Estimate ~5 GB after 12 months. The existing single-DB Postgres
  instance handles this comfortably.
- Supabase Storage: dominated by video. ~50 coaches × 300 MB =
  ~15 GB. Plus avatars: 1500 × 150 KB = ~250 MB. Total ~15 GB on
  the `content` + `avatars` buckets combined.
- Compute: the EOD hook is the only new hot-path. Add at most 10ms
  to the existing ~50ms EOD submission p50.

If the cohort 10x's, revisit. Materialised views for the coach
progress surface; CDN tier-up for video.

## 11. Failure modes — where the operator looks

| Symptom | First check |
|---|---|
| Client reports "I can't see my regimen" | (1) tier on `users` row, (2) `coach_profiles.feature_flags.programs_enabled` for their coach, (3) global `FEATURE_PROGRAMS_ENABLED`. |
| Coach reports "challenge not advancing" | EOD pipeline logs for the EOD that should have triggered the score; `challenge_events` for that user/day. |
| Owner reports "moderation backlog" | `moderation_items` count by `state`; the SLA dashboard. |
| Spike in 5xx on `/api/content/.../url` | Supabase Storage status; signed URL TTL config. |
| Video upload failures | `sharp` / `ffmpeg` (we use `fluent-ffmpeg`) error log; `coach_premium` tier on the uploader. |

## 12. Out of scope for this rollout doc

- Per-jurisdiction enforcement (e.g. a CFP-only mode in CA).
- White-label deployment.
- Migration scripts for moving a client between coaches in
  bulk.

These remain manual ops paths via direct DB updates — the same
posture as the existing operator actions in `README.md` §
"Operator actions".

## 13. Acceptance criteria

- [ ] Every global flag from §2.1 is set to `false` on first
      deploy.
- [ ] The healthy-signal table (§6) has dashboards on PostHog.
- [ ] The kill-switch playbook (§4) is rehearsed once on
      staging before production rollout.
- [ ] `.env.example` and the root `README.md` env table list
      every new flag.
- [ ] The capacity projection (§10) is verified against actual
      Supabase Storage / Postgres usage after 30 days of GA.

## 14. Operator handoff — single-page summary

When the spec set's implementation has shipped:

1. **Read** `08-entitlements.md` § Operator handoff. Enable tier
   gating per its instructions.
2. **Run** the §8 playbook to set all flags off.
3. **Promote** the founding cohort to L2/L3.
4. **Enable** per-coach flags on the founding cohort.
5. **Validate** each surface in the §3 order with one founding
   coach + one client.
6. **Roll out** by flipping each global flag on, in order.
7. **Watch** the healthy-signal dashboards (§6) for 30 days.
8. **Triage** moderation queue daily; the SLA is 48h to ack and
   7d to resolve.
9. **Document** any kill-switch event in the postmortem
   notebook.
