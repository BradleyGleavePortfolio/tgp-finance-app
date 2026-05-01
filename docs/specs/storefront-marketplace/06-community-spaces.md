# 06 — Community spaces

> **Status:** draft, documentation-only. Authorises runtime PR-FS-7 (community spaces).

## 1. WHY

The thing a finance coach asks for after a checkout is a place for
their cohort to talk to each other and to them — without sharing
balances, without becoming a Discord, without exporting to an
external surface where the moderation hand-off breaks.

The existing TGP: Finance has 1:1 messaging via the existing thread
+ subject extension (per [`coach-led-programs/07-messaging-progress.md`](../coach-led-programs/07-messaging-progress.md)).
That covers coach ↔ client. It does not cover the *cohort* surface
or the *coach community* surface.

The one-line claim:

> A coach can run a quiet, scoped community space (per-coach,
> per-program, or per-cohort) inside the app, with text + image
> posts, threaded replies, pins, moderation, and a doctrine pin
> that money never appears in any post.

## 2. WHEN

PR-FS-7 ships once:

- A moderation queue surface and `mod_action` audit table exist
  (PR-FS-7 ships them as part of this PR; subsequent surfaces
  reuse).
- A scrubbing list exists for money-shaped tokens and is pinned.
- Per-coach `spaces_enabled` flag exists.

## 3. WHERE

- `backend/prisma/schema.prisma` — `Space`, `SpaceMembership`,
  `Post`, `Reply`, `Pin`, `Report`, `ModAction`.
- `backend/src/community/`.
- `mobile/app/(community)/` — space list, space view, post detail,
  compose, report flow.
- `backend/test/community-scrubber.spec.ts`,
  `backend/test/community-moderation.spec.ts`.

## 4. WHO

| Actor | Capability |
|---|---|
| Client | Member of every space they are entitled to (per offer / cohort / coach). Read posts; create posts (rate-limited); reply; report. Cannot DM other clients via spaces (DMs are separate, future). |
| Coach | Owner of own spaces. Pin / unpin posts; remove a post; mute a member. Cannot read other coaches' spaces. |
| Coach Premium | Same plus image-attachment posts and the "Announcements" pin type. |
| OWNER | Read all spaces; force-takedown any post; suspend any member from a space; kill a space. |
| Compliance | Spot-check spaces for systemic violations. |

## 5. WHAT

### 5.1 Space scopes

A `Space` has exactly one of:

- `coach_scope` (per-coach): every L1+ client of that coach is a
  member by default; opt-out is per-client.
- `offer_scope` (per-offer / per-cohort): members are exactly the
  paid clients of that offer.
- `program_scope` (per-regimen, per PR #106 §5): members are
  clients on that regimen.

A coach can run multiple. A client may be in many spaces. A coach
cannot create a *cross-coach* space (out of scope; would need a
new entitlement).

### 5.2 Data sketch

```prisma
model Space {
  id            String      @id @default(cuid())
  coach_id      String
  scope_kind    SpaceScope
  scope_id      String?     // offer_id or program_id; null for coach_scope
  name          String      @db.VarChar(60)
  description   String?     @db.VarChar(500)
  state         SpaceState  @default(active)
  rules         String?     @db.VarChar(2000)
  created_at    DateTime    @default(now())
  updated_at    DateTime    @updatedAt
}

enum SpaceScope { coach_scope offer_scope program_scope }
enum SpaceState { active archived taken_down }

model Post {
  id            String      @id @default(cuid())
  space_id      String
  author_id     String
  body          String      @db.VarChar(4000)
  attachments   Json?       // array of signed-url refs (coach_premium only)
  pinned        Boolean     @default(false)
  pin_kind      PinKind?    // 'announcement' | 'rule' | 'event'
  state         PostState   @default(visible)
  scrubbed_tokens Json?     // record of what was scrubbed (audit)
  created_at    DateTime    @default(now())
  updated_at    DateTime    @updatedAt
  taken_down_by String?
}

enum PostState { visible hidden_by_filter taken_down }
enum PinKind { announcement rule event }

model Reply {
  id            String      @id @default(cuid())
  post_id       String
  author_id     String
  body          String      @db.VarChar(2000)
  state         PostState   @default(visible)
  created_at    DateTime    @default(now())
}
```

### 5.3 The scrubber

A post (or reply) body runs through:

1. **Outcome-claim filter** (the same).
2. **Money-shape scrubber** — replaces tokens matching the
   no-money corpus (`\$\d`, `\b\d+%\b\s*(?:return|yield|growth)\b`,
   common account names, "balance is", "income is", etc.) with the
   token `[redacted]` and writes the original to
   `Post.scrubbed_tokens`. The body is never published with the
   raw figure.
3. **Profanity tier**: a small allow-list of mild profanity is
   permitted; slurs are blocked.
4. **PII guard**: phone numbers, emails, SSN-shaped strings are
   blocked.

Posts that are scrubbed display a quiet "edited for privacy" line.

### 5.4 API sketch

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/spaces/me` | client | List spaces I'm a member of. |
| GET | `/api/spaces/:id` | member | Get space metadata + recent posts. |
| GET | `/api/spaces/:id/posts` | member | Paginated. |
| POST | `/api/spaces/:id/posts` | member | New post (scrubbed). |
| POST | `/api/posts/:id/replies` | member | New reply. |
| POST | `/api/posts/:id/report` | member | Report (spam / outcome / abuse / off-topic / PII). |
| POST | `/api/coach/posts/:id/pin` | coach (owner) | Pin / unpin. |
| POST | `/api/coach/posts/:id/takedown` | coach (owner) | Take down own coach's post. |
| POST | `/api/admin/posts/:id/takedown` | OWNER | Force takedown. |
| POST | `/api/admin/spaces/:id/kill` | OWNER | Kill space. |
| GET | `/api/admin/spaces/queue` | OWNER + compliance | Moderation queue. |

Throttle: 10 posts / hour / member; 50 posts / hour / coach
(announcements are still capped). `429 SPACES_RATE_LIMIT`.

### 5.5 Screens & navigation

- `(community)/spaces.tsx` — list of joined spaces, last activity
  preview.
- `(community)/space/[id].tsx` — feed: pinned section first, then
  chronological. Compose drawer at bottom. Quiet UI; no like
  counter; reaction set is a closed list (`👁` view, `🤝` agree,
  `?` confused — *no emoji actually rendered*; we use ink glyphs
  per `mobile/DESIGN.md`).
- `(community)/post/[id].tsx` — post + replies, infinite scroll.
- Compose modal: writes are subject to the scrubber; an inline
  diff-style preview shows what would be redacted before submit.
- Report flow: closed reasons; submit → "Reported. Thank you."

## 6. HOW (the runtime PR shape)

PR-FS-7 ships:

1. The seven schemas.
2. `backend/src/community/` module + scrubber service + moderation
   queue service.
3. Mobile screens.
4. The space-scope resolution job: when a client buys an offer
   bound to an `offer_scope` space, they are auto-added at webhook
   processing.
5. Pin: scrubber, moderation, doctrine.

## 7. Privacy & security

- Tenancy: `space_id` carries `coach_id`; queries always filter by
  membership.
- A space's audience is **never** exposed to other coaches.
- Posts are not searchable globally.
- Image attachments (coach_premium) live in Supabase Storage with
  signed URLs; EXIF stripped; same posture as PR #106 §3.
- GDPR scrub: posts and replies authored by a deleted client are
  redacted to "(removed)" and the author_id is null-ed; the
  audit-log row holds the original body in case of legal hold.
- Report submissions include a reason and a free-text field; the
  reporter's identity is exposed to OWNER only.

## 8. Abuse & moderation

- Pre-publish: scrubber + outcome filter + PII guard.
- Post-publish: report flow + sample audit by OWNER.
- Coach moderation power is scoped to their own spaces only.
- A space can be killed by OWNER (state → `taken_down`); members
  see "This space has been retired."
- Repeat-offender mute: 3 reports against the same author in 30
  days within one space → auto-mute (no posting / replies for 7d).
- A coach who repeatedly posts blocked-by-filter content → OWNER
  page; their `spaces_enabled` is paused.

## 9. Disclaimers (verbatim)

- Footer of every space view:
  `education_only` (verbatim).
- On compose:
  "Posts are public to your space. Money figures will be
  redacted. Outcomes are not guaranteed."
- On reply: same compose hint.
- On a redacted post: "edited for privacy" inline (not a banner).

## 10. Feature flags & entitlements

| Flag | Default | Notes |
|---|---|---|
| `SPACES_ENABLED` | off | global. |
| `coach_profiles.spaces_enabled` | off | per-coach. |
| `SPACES_IMAGE_ATTACH_ENABLED` | off | global; `coach_premium` only when on. |
| `SPACES_KILL` | off | OWNER override; flip kills all spaces (for incident response). |

| Capability | L1 | L2 | L3 | coach | coach_premium | OWNER |
|---|---|---|---|---|---|---|
| Member of own coach's spaces | ✓ | ✓ | ✓ | n/a | n/a | n/a |
| Image attachment in post | per flag | per flag | per flag | n/a | n/a | n/a |
| Create space | n/a | n/a | n/a | ✓ | ✓ | n/a |
| Image post | n/a | n/a | n/a | ✗ | ✓ | n/a |
| Pin post | n/a | n/a | n/a | ✓ | ✓ | n/a |
| Force-takedown | n/a | n/a | n/a | ✗ | ✗ | ✓ |
| Kill space | n/a | n/a | n/a | ✗ | ✗ | ✓ |

## 11. Analytics

| Event | Where | Properties |
|---|---|---|
| `space_post_published` | POST /posts | space_id, author_role, body_len, scrubbed_tokens_count |
| `space_post_blocked` | filter trip | space_id, kind |
| `post_reported` | report | post_id, reason |
| `mod_action_taken` | OWNER or coach action | actor, target, action |
| `space_killed` | OWNER kill | space_id, reason |

## 12. Rollout

- Stage 0: spec.
- Stage 1: PR-FS-7 ships with `SPACES_ENABLED=false`.
- Stage 2: 5 coaches enabled; image attachments off; queue
  staffed.
- Stage 3: 25 coaches; image attachments on for `coach_premium`.
- Stage 4: GA.

Kill switch: `SPACES_KILL=true` puts every space into
`hidden_by_filter` and disables compose; existing posts visible
but read-only. `SPACES_ENABLED=false` returns 503 from
`/api/spaces/*`.

## 13. Tests

- `backend/test/community-scrubber.spec.ts`:
  - All money-shape tokens redacted; original logged in
    `scrubbed_tokens`.
  - PII guard fires.
- `backend/test/community-moderation.spec.ts`:
  - Auto-mute after 3 reports / 30d.
  - Coach can only mod own space.
  - Force-takedown writes audit.
- `backend/test/community-doctrine.spec.ts`:
  - Disclaimers verbatim on every variant.
- `mobile/test/space-screen.spec.tsx`:
  - Palette + type.
  - Reaction glyphs are ink, not emoji.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| A balance leaks via screenshot of a post. | Scrubber on body; image-attachment is `coach_premium` only and reviewed; future-PR OCR scrubber on images is a follow-up. |
| Off-topic harassment. | Report flow + auto-mute. |
| Coach uses pin for outcome promises. | Pin body still goes through outcome filter and scrubber. |
| Cross-coach leak via shared client. | Space membership query is per-space; client sees only their joined spaces. |

## 15. Dependencies

- PR-FS-1 (storefront — for coach context).
- PR-FS-2 (offers — for `offer_scope` resolution).
- PR #106 §5 (regimens) for `program_scope`.
- Existing thread + subject extension (PR #106 §7) for compose
  patterns.

## 16. Acceptance criteria

- [ ] Schemas migrated.
- [ ] Scrubber pinned.
- [ ] Outcome filter + PII guard pinned.
- [ ] All disclaimers verbatim.
- [ ] OWNER force-takedown audited.
- [ ] Auto-mute pinned.

## 17. Operator handoff

- Runbook: `runbook/community.md` — moderation triage, force-
  takedown, space kill, repeat-offender escalation.
- Dashboard tiles: posts / day, scrub rate, report volume,
  takedown count.
- Alerts: scrub rate > 10% in any 1h window (page; suggests filter
  drift or a bot run); takedown rate > 5/24h (page).
