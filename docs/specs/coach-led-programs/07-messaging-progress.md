# Messaging & Progress Visibility

> **Closest existing module:** `backend/src/coach/` —
> `clientSummary` (Phase 1B) is the structured payload the existing
> messaging UI already reads. This document extends that surface; it
> does **not** rebuild the messaging primitive.

## 1. Why

Today the coach-client interaction surface is:

- The coach roster + per-client detail in `/api/coach/*`.
- The `clientSummary` Phase 1B payload (see
  `backend/src/coach/README.md` § Phase 1B `clientSummary`) — the
  structured sidebar a messaging UI uses.
- A single 1:1 thread between coach and client (this is implied by
  the Phase 1B surface and the way the mobile coach screen renders
  it).

The pieces that don't exist yet:

- A **structured progress update** the coach can attach to a
  message ("week 4 review of the cash floor regimen — here's
  where you are").
- Per-thread **subject** so the coach can run multiple parallel
  conversations with the same client (general, regimen X, content
  Y).
- A **read receipt + unread count** that doesn't surface online
  presence but does answer "did the client see this".
- A consolidated **progress visibility** surface for the coach —
  "where is each client across every regimen, challenge, content
  item, and EOD streak".

This spec is intentionally scoped: it does **not** introduce a
real-time chat primitive. We extend the existing thread shape with
structured updates and progress visibility; live messaging features
(typing indicators, presence, push-to-chat) are out of scope.

## 2. When

- A **structured progress update** is generated:
  - Automatically on assignment state transitions (challenge
    completed, regimen phase advanced, content opened, etc.) — but
    only the *coach* sees it; the client sees only the underlying
    state on their detail screen.
  - Manually by the coach via "send a progress update" composer.
- A **subject thread** is created when the coach starts a new one,
  or implicitly when they "discuss" a regimen / challenge / content
  item from its detail screen.
- The **progress visibility surface** is read on demand from the
  coach roster.

When the client sees what:

- Existing 1:1 thread continues unchanged.
- Subject threads appear as folder-like sections inside the
  thread view; the client can read and reply.
- Read receipts are visible to the **sender** only (coach sees
  "client read", client sees "coach read").
- The coach's progress visibility surface is **not** rendered to
  the client.

## 3. Where

- **Backend:** extends `backend/src/coach/` and `backend/src/users/`.
  No new top-level module. Two new sub-services:
  `coach-messaging.service.ts` (subject threads + structured
  updates) and `coach-progress.service.ts` (visibility view).
- **Schema:** `MessageThread`, `Message`, `MessageReadReceipt`,
  plus `MessageProgressUpdate` (denormalised snapshot of an
  assignment-state transition the coach attached to a message).
- **Mobile:**
  - `mobile/app/coach/student/[id]/messages.tsx` — extended.
  - `mobile/app/messages/[thread_id].tsx` — student thread.
  - `mobile/app/coach/progress.tsx` — coach visibility surface.

## 4. Who

- **Send (coach side):** coach (or owner).
- **Send (client side):** the assigned client.
- **Read:** participants (coach + client). Owner reads any thread
  for moderation.
- **Visibility surface:** coach (or owner).
- **L1 clients:** subject threads return `403 NOT_ENTITLED` —
  the existing single-thread continues unchanged. Structured
  progress updates are L2/L3 only.

## 5. What — data and API

### 5.1 Schema

```prisma
model MessageThread {
  id            String   @id @default(uuid())
  coach_id      String
  coach         User     @relation("CoachThreads", fields: [coach_id], references: [id])
  student_id    String
  student       User     @relation("StudentThreads", fields: [student_id], references: [id])
  // 'general' is the default thread; subject-specific threads link
  // to an artefact via these optional refs.
  subject       String   // ≤ 80 chars
  // optional artefact pin
  challenge_id  String?
  program_id    String?
  content_id    String?
  archived_at   DateTime?
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt
  messages      Message[]

  @@unique([coach_id, student_id, subject])
  @@index([student_id, archived_at])
  @@map("message_threads")
}

model Message {
  id          String   @id @default(uuid())
  thread_id   String
  thread      MessageThread @relation(fields: [thread_id], references: [id], onDelete: Cascade)
  sender_id   String
  body        String   // markdown, sanitized; ≤ 5000 chars
  // Optional structured progress payload — denormalised snapshot.
  progress    Json?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  @@index([thread_id, created_at])
  @@map("messages")
}

model MessageReadReceipt {
  id          String   @id @default(uuid())
  thread_id   String
  user_id     String
  // Last message id read by this user in this thread.
  last_read_message_id String?
  read_at     DateTime @default(now())

  @@unique([thread_id, user_id])
  @@map("message_read_receipts")
}
```

### 5.2 Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/messages/threads` | JWT | Caller's threads. Coach sees per-student; student sees per-coach. |
| POST | `/api/messages/threads` | JWT | Create a subject thread. Coach can also create on behalf of a client. |
| GET | `/api/messages/threads/:id` | JWT (participant) | Thread detail with last 50 messages. |
| POST | `/api/messages/threads/:id/messages` | JWT (participant) | Post a message. Optional `progress` payload on coach side only. |
| POST | `/api/messages/threads/:id/read` | JWT (participant) | Update read receipt. |
| POST | `/api/messages/threads/:id/archive` | JWT (participant) | Archive (per-side soft-archive — see §6). |
| GET | `/api/coach/progress` | coach | The visibility surface (§5.4). |

### 5.3 The `progress` payload

A coach-attached progress snapshot:

```ts
const ProgressUpdateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('challenge'),
    challenge_id: z.string().uuid(),
    score: z.number().int().min(0).max(100),
    state: ChallengeAssignmentStateEnum,
  }),
  z.object({
    kind: z.literal('regimen'),
    program_id: z.string().uuid(),
    phase_ordinal: z.number().int().min(0),
    state: ProgramAssignmentStateEnum,
  }),
  z.object({
    kind: z.literal('content'),
    content_id: z.string().uuid(),
    opened: z.boolean(),
  }),
]).strict();
```

The `progress` payload is **never** money-bearing. The doctrine
pin test asserts no `Decimal`-typed field appears.

### 5.4 The visibility surface

```
GET /api/coach/progress
```

Returns one row per (student, artefact) pair — the coach's union
of every challenge / regimen / content assignment for every
client on their roster:

```jsonc
{
  "rows": [
    {
      "student": { "id": "uuid", "name": "Alex T.", "tier": "L2" },
      "kind": "challenge",
      "artefact": { "id": "uuid", "title": "60-Day No-Spend Sundays" },
      "state": "active",
      "progress": { "score": 42, "days_remaining": 18 },
      "last_event_at": "2026-04-19T03:18:21Z"
    }
    // ...
  ],
  "summary": {
    "active_count": 32,
    "needs_attention_count": 4,
    // 'needs_attention' = state machine in 'pending' for >7d, OR
    // 'active' with no progress event for >5d, OR phase-target miss.
  }
}
```

This is the surface the coach reads from `mobile/app/coach/progress.tsx`.
It composes the three module's data; it does not denormalise it.

### 5.5 Mobile UX

- **Thread list (coach side, per student):** the existing inbox
  gains a "New thread" button. Default thread is "General"; subject
  threads list under it.
- **Thread detail:** message list with the structured progress
  update rendered as a card inline (a single hairline-stroke card,
  no oxblood unless explicitly the only accent). The card shows the
  artefact title, the state, the numeric (score / phase / opened),
  and a "view" link to the artefact detail.
- **Read receipts:** a single timestamp under the message ("read
  09:12"). No double-tick chrome, no presence.
- **Visibility surface (coach):** a sortable table. Default sort
  is `needs_attention` first, then `last_event_at` desc. Filters
  by client + by kind. Doctrine: no progress bars in oxblood, no
  red flags as crimson — the existing alerts surface in
  `/api/coach/alerts` is the canonical "red flag" rendering.

## 6. How — implementation pattern

### 6.1 Authorization

- Thread mutations require participant membership; service-layer
  asserts via `assertThreadParticipant`.
- The progress surface is coach-only: `RoleGuard('coach') +
  EntitlementGuard('messaging_extended')` (see
  `08-entitlements.md` §6.1; messaging extended is L2/L3).

### 6.2 Per-side archive

Archive is per-thread (not per-user) in the schema; both sides see
the archive. If we end up needing per-side archive, we add a
`MessageArchiveState` table — out of scope v1.

### 6.3 Sanitisation

- `Message.body` is markdown sanitised by the same helper as
  challenge/program descriptions; URLs follow the same allowlist.
- Mention syntax (`@coach`, `@client`) is **not** parsed in v1;
  the existing single-thread doesn't have it.

### 6.4 Doctrine pin tests

`test/messaging-doctrine.spec.ts`:

- The `Message` DTO carries no `Decimal` field.
- Auto-generated progress payloads have no audience framing.
- Progress payload is a `discriminatedUnion('kind')`; extra keys
  rejected.

`test/messaging.service.spec.ts`:

- `assertThreadParticipant` rejects non-participants.
- Coach can post a `progress` payload; student cannot.
- Read receipt update is idempotent.

## 7. Privacy & security

- **No money fields in messages.** Pinned by §6.4.
- **No presence.** We do not surface "online now" — anti-doctrine,
  and a non-trivial infra add (websockets / SSE).
- **Owner moderation reads everything**, with an audit trail
  (`coach_notes` row attributed to owner with a "moderation read"
  reason).
- **The progress payload is a snapshot, not a live link.** A
  coach who attaches "phase 3" to a message does not have the
  message auto-update if the client moves to phase 4 — the
  message reflects what the coach attached, period.

## 8. Abuse & moderation

1. **Coach harassment via subject threads.** A coach floods a
   client with subject-specific threads. **Mitigation:** the
   client's archive action hides the thread from their inbox;
   reports route to the owner queue.
2. **Client uses messaging to phish a coach.** Off-platform
   payment requests, fake landlord scams. **Mitigation:** URL
   allowlist on message body. Coaches receive a one-time
   onboarding note: messages are not a banking channel.
3. **Off-platform contact information leaking.** A coach shares a
   phone number for SMS. Out of scope to block, but the URL
   allowlist + the platform disclaimer cover the regulatory
   surface; we do not technically prevent text contact info.

## 9. Feature flags

- Global: `FEATURE_MESSAGING_EXTENDED_ENABLED`. When false, only
  the existing single-thread continues to work; subject threads
  and progress payload are dark.
- Per-coach: `coach_profiles.feature_flags.messaging_extended_enabled`.

## 10. Analytics

- `messages.thread_created` — `{ coach_id, student_id, subject }`.
- `messages.sent` — `{ thread_id, sender_role,
  has_progress_payload }`.
- `messages.read` — `{ thread_id, reader_role }`.
- `coach_progress.viewed` — `{ coach_id }`.

## 11. Rollout

1. Founders: enable global flag + per-coach for founding cohort.
2. Validate progress payload end-to-end with a single coach +
   client.
3. GA: flip global flag. The progress visibility surface
   becomes available to every L2/L3 coach.

## 12. Tests

- `test/messaging.service.spec.ts`.
- `test/messaging.controller.spec.ts`.
- `test/messaging-doctrine.spec.ts`.

## 13. Risks

1. **Read receipts feel like presence.** A user infers "they're
   online" from a fresh read receipt. **Mitigation:** the
   timestamp is hour-rounded ("read this hour") rather than
   minute-precise — a small change in the response formatter.
2. **The progress payload becomes a chat-card spam vector.** A
   coach sends 12 progress updates a day. **Response:**
   server-side rate limit per `(coach, student)` pair: max 4
   progress payloads per 24h.
3. **The visibility surface gets slow.** Coach with 100 clients
   on `coach_premium` reads `GET /api/coach/progress`; the union
   is expensive. **Response:** materialised view (Postgres
   refresh on EOD) once we have a coach above 50 clients.

## 14. Dependencies

- `01-challenges.md`, `04-content-boards.md`,
  `05-regimens.md` — sources of progress data.
- `08-entitlements.md` — `messaging_extended` capability.
- `09-compliance.md` — URL allowlist on message body.

## 15. Acceptance criteria

- [ ] Schema migration adds the four tables.
- [ ] Subject threads are L2/L3-only; existing single-thread
      continues unchanged for L1.
- [ ] `progress` payload is a strict discriminatedUnion; no
      money fields.
- [ ] Read receipts are hour-rounded.
- [ ] Coach progress surface composes data from the three
      assignment-shaped tables (no denormalisation table).

## 16. Operator handoff

1. Apply migration.
2. `flyctl secrets set FEATURE_MESSAGING_EXTENDED_ENABLED=false`.
3. Founding cohort: enable per-coach.
4. Validate end-to-end.
5. GA.
