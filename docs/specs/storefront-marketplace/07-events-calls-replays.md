# 07 — Events, calls, replays

> **Status:** draft, documentation-only. Authorises runtime PR-FS-8 (events/calls/replays).

## 1. WHY

A coach selling a cohort or a 1:1 program runs live calls. Today
they do this on Zoom or Google Meet, post the link in a Slack
channel or a DM, and email a recording afterward. Each step bleeds
out of TGP and each step has its own consent / privacy posture.

We want a single in-app surface where:

- The coach schedules a call (live cohort session, AMA, IRL event
  per PR #122).
- Cohort members get reminders (in-app + email + optional push).
- The call URL (Zoom/Meet/whatever) is stored, displayed at the
  right time, and never leaks to the wrong audience.
- Recording consent is captured per attendee.
- A replay (with captions) is stored in a per-cohort or per-coach
  replay library with TTL.

This is the surface that lets a finance coach do "Hop on a call
about your debt-free strategy" without sending the cohort to a
separate tool.

The one-line claim:

> A coach schedules an event in TGP; members see it in their
> calendar surface, get reminded, attend on the third-party
> conferencing tool of choice, and watch the captioned replay
> in-app — without the link or replay leaking to the wrong
> audience and without prompting consent in a way that is dark.

## 2. WHEN

PR-FS-8 ships once:

- A captioning provider is chosen (Whisper-on-our-side or AssemblyAI
  / Deepgram are typical candidates; the runtime PR picks one).
- The recording-consent UX is approved by counsel.
- A storage bucket and a TTL policy are decided (default: replay
  retained for 365 days; coach can extend to 'permanent' for
  `coach_premium`).
- Per-coach `events_enabled` flag exists.

## 3. WHERE

- `backend/prisma/schema.prisma` — `Event`, `EventAttendee`,
  `Reminder`, `Replay`, `Caption`, `RecordingConsent`.
- `backend/src/events/`.
- `mobile/app/(events)/` — calendar, event detail, replay player.
- `backend/src/captioning/` — provider adapter.
- `backend/test/events-consent.spec.ts`,
  `backend/test/replay-doctrine.spec.ts`.

## 4. WHO

| Actor | Capability |
|---|---|
| Coach | Schedule events in own scope. Upload manual replay (in-PR-FS-8 v1; live-recording capture is later). |
| Coach Premium | Same plus IRL event surface (see PR #122). |
| Member (paid into the offer / in the cohort / in the space) | View event, RSVP, get reminder, attend, watch replay. |
| OWNER | Read all events (audited); takedown a replay if it violates doctrine. |
| Compliance | Spot-check replay descriptions and captions. |

## 5. WHAT

### 5.1 The event object

```prisma
model Event {
  id              String        @id @default(cuid())
  coach_id        String
  scope_kind      EventScope    // 'space' | 'offer' | 'cohort'
  scope_id        String
  kind            EventKind     // 'live_call' | 'ama' | 'workshop' | 'irl'
  title           String        @db.VarChar(120)
  description     String        @db.VarChar(2000)
  starts_at       DateTime
  ends_at         DateTime
  timezone        String        // IANA
  conferencing    Json?         // { provider: 'zoom'|'meet'|'irl', url?: string, location?: string }
  recording_policy RecordingPolicy
  state           EventState    @default(scheduled)
  created_at      DateTime      @default(now())
  updated_at      DateTime      @updatedAt
}

enum EventScope { space offer cohort }
enum EventKind { live_call ama workshop irl }
enum EventState { scheduled live ended canceled }
enum RecordingPolicy {
  no_recording           // never record
  record_with_consent    // record only if all attendees consent at start
  record_default         // recording on; consent collected; non-consenters blurred / muted in replay (provider-dependent)
}
```

```prisma
model EventAttendee {
  id              String        @id @default(cuid())
  event_id        String
  user_id         String
  state           AttendeeState @default(invited)
  rsvp_at         DateTime?
  joined_at       DateTime?
  consent_state   ConsentState? // captured at join
}

enum AttendeeState { invited rsvp_yes rsvp_no joined attended no_show }
enum ConsentState { granted withdrawn unknown }
```

```prisma
model Replay {
  id              String        @id @default(cuid())
  event_id        String        @unique
  storage_path    String
  duration_s      Int
  caption_state   CaptionState  @default(pending)
  retention_days  Int           @default(365)
  redacted_tokens Json?         // captions ran through scrubber
  created_at      DateTime      @default(now())
  takedown_at     DateTime?
  takedown_actor  String?
}

enum CaptionState { pending generated edited failed }

model Caption {
  id              String        @id @default(cuid())
  replay_id       String
  segments        Json          // [{ start_ms, end_ms, text }]
  language        String        @default("en")
  source          String        // 'auto' | 'edited'
}
```

### 5.2 Scheduling flow

1. Coach picks scope (`space` | `offer` | `cohort`), kind, time
   range, timezone, conferencing (Zoom/Meet/IRL location), and
   recording policy.
2. Title + description run through the outcome-claim filter.
3. Event is saved; attendees are computed from membership and
   inserted with `invited` state.
4. RSVP UI shown to each attendee in-app.
5. Reminders fire at T-24h and T-15min (in-app + email; SMS only on
   explicit opt-in).
6. At `starts_at`, the conferencing URL becomes visible.
7. After `ends_at`, the event moves to `ended`; the replay-upload
   surface opens for the coach.

### 5.3 Replay flow

- Coach uploads the recorded video (v1 manual upload; later
  versions can pull directly from Zoom/Meet via the conferencing
  adapter).
- File goes to Supabase Storage with a per-replay random prefix +
  signed URL with 24h expiry on each fetch.
- Captioning kicks off async. State: `pending → generated`.
- Captions are scrubbed through the no-money corpus; redacted
  tokens are recorded.
- Coach can edit captions inline; `edited` state.
- Replay is then published to the scope audience.

### 5.4 API sketch

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/events/me` | client | Calendar of upcoming + past events. |
| POST | `/api/coach/events` | coach | Create. |
| PATCH | `/api/coach/events/:id` | coach | Edit (until `live`). |
| POST | `/api/coach/events/:id/cancel` | coach | Cancel + notify. |
| POST | `/api/events/:id/rsvp` | client | RSVP yes/no. |
| GET | `/api/events/:id/join` | client (member, t in [starts-15min, ends]) | Returns conferencing URL + a join token. |
| POST | `/api/events/:id/consent` | client | Set consent state (granted/withdrawn). |
| POST | `/api/coach/events/:id/replay` | coach | Upload replay file (multipart). |
| GET | `/api/replays/:id/captions` | member | Get caption track. |
| POST | `/api/coach/replays/:id/edit` | coach | Edit caption text. |
| POST | `/api/admin/replays/:id/takedown` | OWNER | Takedown. |

The `/join` endpoint is **time-windowed**: returns 410 outside
the join window. This stops the URL from leaking ahead of time.

### 5.5 Screens & navigation

- `(events)/calendar.tsx` — list of upcoming events, grouped by
  day; each row tappable.
- `(events)/event/[id].tsx` — title, description, RSVP, recording
  policy badge ("This event will not be recorded" / "This event
  will be recorded with consent" / "Recording on by default —
  withdraw consent at join"), conferencing area (visible only at
  start window), attendee count (bucketed: "small / mid / large"
  bucket, never raw).
- `(events)/replay/[id].tsx` — video player with captions toggle,
  segment search, and the verbatim `education_only` line on the
  description.
- Coach editor: `(events)/coach/edit.tsx` — title (filtered),
  description (filtered), schedule, conferencing, recording
  policy, caption-edit panel.

### 5.6 Reminders

- T-24h: in-app card + email.
- T-15min: push (if push enabled) + in-app banner.
- T-0: conferencing URL visible.
- Reminders are best-effort; rate-limited (no spam from a coach
  scheduling 5 events in a row).

## 6. HOW (the runtime PR shape)

PR-FS-8 ships:

1. The six schemas.
2. `backend/src/events/` module + reminder cron.
3. `backend/src/captioning/` adapter (one provider; the rest is
   future).
4. Mobile screens.
5. Outcome filter + caption scrubber + replay doctrine pin.
6. OWNER takedown action.

## 7. Privacy & security

- The conferencing URL is gated behind the `/join` window; it is
  not embedded in the event detail until the window opens. Stored
  encrypted-at-rest at the column level (using the existing
  application-key approach if available; otherwise pgcrypto).
- Consent state is per-attendee and per-event; a withdraw resets to
  `withdrawn` for that event only. Replays processed under
  `record_default` policy must blur or mute non-consenters where
  the provider supports it; otherwise the replay is **not
  published** and the coach is notified.
- Replay storage path is a long random suffix; signed URL has 24h
  expiry; not listable.
- Caption text runs through the same scrubber as community posts;
  redacted tokens are kept in `redacted_tokens` for audit.
- GDPR scrub: a deleted user's attendance row is anonymised; their
  on-camera frames in published replays are out of scope for
  removal in v1 (we will not retroactively re-render). The
  consent UX makes that limitation explicit.
- Audit log on every event create / cancel / replay upload /
  takedown.

## 8. Abuse & moderation

- Outcome filter on event title + description.
- Caption scrubber; if scrub rate > 5% of segments, replay state
  flips to `redacted_high`; OWNER paged.
- A coach cannot schedule >20 events / 24h (rate limit).
- A replay can be force-taken-down by OWNER; the audience sees
  "This replay has been retired."
- IRL events do not produce a replay or a join URL; they expose a
  location which goes through a "venue allow-list" (countries
  allowed for our compliance posture; default US, GB, CA).

## 9. Disclaimers (verbatim)

- Footer of event detail:
  `education_only`.
- Above RSVP button:
  "RSVPing does not guarantee a live attendance slot if capacity
  is reached. Coach-led content is delivered by the coach, not by
  The Growth Project."
- On consent flow:
  "By granting consent, you agree to be recorded and to appear in
  the published replay. You can withdraw at any point during the
  event; the system will mute or blur your stream where the
  provider supports it. The Growth Project does not guarantee
  successful redaction in all cases — see the help center."
- Footer of replay player:
  `education_only` + the line "Recorded $date. Captions edited by
  the coach. Outcomes are not guaranteed."

## 10. Feature flags & entitlements

| Flag | Default | Notes |
|---|---|---|
| `EVENTS_ENABLED` | off | global. |
| `coach_profiles.events_enabled` | off | per-coach. |
| `EVENTS_RECORDING_DEFAULT` | off | global; if off, only `record_with_consent` permitted. |
| `EVENTS_IRL_ENABLED` | off | depends on PR #122 acceptance. |
| `EVENTS_REPLAY_PERMANENT_RETENTION` | off | only for `coach_premium`. |

| Capability | L1 | L2 | L3 | coach | coach_premium | OWNER |
|---|---|---|---|---|---|---|
| Schedule live call / AMA / workshop | n/a | n/a | n/a | ✓ | ✓ | n/a |
| Schedule IRL | n/a | n/a | n/a | ✗ | ✓ | n/a |
| Edit captions | n/a | n/a | n/a | ✓ | ✓ | n/a |
| Permanent retention | n/a | n/a | n/a | ✗ | ✓ | n/a |
| Force-takedown replay | n/a | n/a | n/a | ✗ | ✗ | ✓ |

## 11. Analytics

| Event | Properties |
|---|---|
| `event_scheduled` | event_id, scope_kind, kind |
| `event_rsvp` | event_id, state |
| `event_attended` | event_id, attendee_count_bucket |
| `event_canceled` | event_id, reason |
| `replay_uploaded` | replay_id, duration_s |
| `replay_caption_failed` | replay_id, kind |
| `replay_viewed` | replay_id, segment_count |
| `replay_taken_down` | replay_id, actor, reason |
| `event_filter_blocked` | event_id, field |

## 12. Rollout

- Stage 0: spec.
- Stage 1: `EVENTS_ENABLED=false`. Internal QA on a Zoom test
  account.
- Stage 2: 3 coaches; manual replay upload; auto-captioning on a
  cheap provider; manual caption review by coaches.
- Stage 3: 25 coaches; conferencing-side recording pull (Zoom
  webhooks) added in a follow-up PR.
- Stage 4: GA.

Kill switch: `EVENTS_ENABLED=false` returns 503 on
`/api/events/*` and `/api/replays/*`. Existing replays remain
accessible but new joins are blocked.

## 13. Tests

- `backend/test/events-consent.spec.ts`:
  - Consent state captured on join; withdraw blocks frame from
    replay where provider supports.
- `backend/test/events-doctrine.spec.ts`:
  - Outcome filter on event title + description.
- `backend/test/replay-doctrine.spec.ts`:
  - Caption scrubber on the no-money corpus; pinned.
- `backend/test/replay-takedown.spec.ts`:
  - OWNER force-takedown writes audit, sets `takedown_at`.
- `mobile/test/replay-player.spec.tsx`:
  - Disclaimers verbatim.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Conferencing URL leaks via screenshot. | Time-windowed join; coach-side warning copy; URL rotates per event. |
| Recorded user contests publication. | Consent UX explicit; takedown via OWNER; provider-side blur where possible. |
| Caption transcription leaks money figures. | Scrubber; redacted_tokens audit; OWNER pageable on high scrub rate. |
| IRL location privacy. | Venue allow-list; address shown only to confirmed attendees. |
| Replay storage cost. | TTL default 365d; permanent retention only on `coach_premium`. |

## 15. Dependencies

- PR-FS-1 (storefront — for coach context).
- PR-FS-2 (offers).
- PR-FS-7 (community spaces) for `space_scope`.
- PR #122 (masterminds) for IRL.
- PR #120 lane #04 (data lifecycle) — replay retention extension.

## 16. Acceptance criteria

- [ ] Schemas migrated.
- [ ] Outcome filter + caption scrubber pinned.
- [ ] Consent state captured per attendee.
- [ ] Time-windowed join URL pinned.
- [ ] OWNER takedown audit pinned.
- [ ] All disclaimers verbatim.

## 17. Operator handoff

- Runbook: `runbook/events.md` — replay-upload SLA, caption
  failures, consent disputes, takedown procedure, retention
  extensions.
- Dashboard tiles: events / day, replay backlog, caption-failure
  rate, takedown count.
- Alerts: caption failure rate > 5% in 1h (page); replay backlog >
  24h (page); join-URL leak suspected (manual paged).
