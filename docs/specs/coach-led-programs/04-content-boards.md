# Coach Content Boards — PDFs, newsletters, videos, links

> **Closest existing module:** `backend/src/coach/` (program templates
> are the closest thing to coach-authored content today). New module
> sits next to it.

## 1. Why

Coaches today share artefacts out-of-band: a quarterly newsletter as
an email PDF; a 12-page debt strategy walkthrough as a Google Drive
link; a recorded onboarding session on Loom. These artefacts are the
**second-most-valuable thing** a coach gives a client, behind only
the 1:1 messages. We lose them today because the app does not host
them.

A content board fixes three problems simultaneously:

- **Distribution.** A coach uploads once and assigns to many.
- **Audit.** We can see whether a client opened the assigned PDF
  before a meeting; the coach can see "you haven't opened the
  Q1 letter yet" without nagging.
- **Doctrine.** Out-of-band PDFs are unsanitised, unversioned, and
  outside our compliance disclaimer surface. Hosting them brings
  them under the §09 disclaimer rendering rule.

We deliberately build the **lightest possible** content surface —
no in-app authoring tools (no rich-text editor, no video studio).
Coaches upload artefacts they already have; the app hosts them.

## 2. When

- **Uploaded** by the coach. Sits in `state = draft` until
  published.
- **Published** by the coach. Becomes assignable.
- **Assigned** to a client (or cohort) via the shared assignment
  primitive (`06-assignments.md`).
- **Opened** by the client — first open is recorded; subsequent
  opens are not (we do not track engagement minute-by-minute).
- **Archived** by the coach. Existing assignments still render the
  artefact; new assignments cannot reference an archived item.
- **Removed** by the owner only; this is the moderation /
  takedown path.

When the client sees what:

- **On assignment:** the item appears on the student's content
  board (`mobile/app/content/index.tsx`). A push notification is
  gated by `NotificationPreferences.coach_messages`.
- **On open:** a signed Supabase Storage URL is minted, valid for
  5 minutes, single-use is **not** enforced (a single signed URL
  can be re-used within its window — that is the platform default;
  we accept it).
- **On revoke** (coach rescinds the assignment): the item drops
  off the client's board immediately.

## 3. Where

- **Backend module:** new `backend/src/content/` (content board
  service) and `backend/src/media/` (already exists in spec for
  avatars; same module hosts the upload pipeline for PDFs / videos).
- **Schema:** new `ContentItem`, `ContentAssignment`,
  `ContentOpenEvent` (§5).
- **Storage:** Supabase Storage bucket `content`, **non-public**;
  signed URLs with 5-minute TTL.
- **Mobile routes:**
  - `mobile/app/content/index.tsx` — student board.
  - `mobile/app/content/[id].tsx` — viewer (PDF inline; video
    plays inline; newsletter renders as HTML; link opens external
    after a confirmation modal).
  - `mobile/app/coach/content/index.tsx` — coach board management.
  - `mobile/app/coach/content/new.tsx` — coach upload.

## 4. Who

- **Author / publish / archive:** coach (or owner).
- **Assign:** coach (or owner). A coach assigns only to their own
  roster; owner has cross-tenant bypass.
- **Read assigned items:** the assigned client only.
- **Read all items in their own board:** the coach.
- **Read across coaches:** owner only (admin / federation).
- **L1 clients:** content board surface returns `403 NOT_ENTITLED`.
  L2/L3 only.

## 5. What — data model

### 5.1 Schema

```prisma
enum ContentKind {
  pdf
  video           // mp4 / mov re-encoded server-side
  newsletter      // HTML body stored inline in the row
  link            // external URL, allowlisted (see 09-compliance)
}

enum ContentState {
  draft
  published
  archived
  removed
}

model ContentItem {
  id            String         @id @default(uuid())
  coach_id      String
  coach         User           @relation(fields: [coach_id], references: [id])
  kind          ContentKind
  title         String         // ≤ 120 chars
  description   String?        // markdown; sanitised; ≤ 2000 chars
  // For pdf / video: the Supabase Storage object key (NOT a URL).
  storage_key   String?
  // For newsletter: the HTML body (sanitised).
  html_body     String?
  // For link: the external URL (allowlist-validated).
  external_url  String?
  // Encoded MIME ("application/pdf", "video/mp4", "text/html",
  // "external/link"). Documented for the client renderer.
  mime          String
  // Coach's preferred ordering on their own board.
  sort_order    Int            @default(0)
  state         ContentState   @default(draft)
  published_at  DateTime?
  archived_at   DateTime?
  removed_at    DateTime?
  // Required disclaimer text rendered alongside the item by the
  // backend (§09). Coach-authored field; backend appends the
  // platform disclaimer regardless.
  coach_note    String?
  created_at    DateTime       @default(now())
  updated_at    DateTime       @updatedAt
  assignments   ContentAssignment[]

  @@index([coach_id, state])
  @@map("content_items")
}

model ContentAssignment {
  id          String       @id @default(uuid())
  content_id  String
  content     ContentItem  @relation(fields: [content_id], references: [id])
  student_id  String
  student     User         @relation(fields: [student_id], references: [id])
  state       String       // 'pending' | 'opened' | 'rescinded'
  assigned_at DateTime     @default(now())
  opened_at   DateTime?
  rescinded_at DateTime?

  @@unique([content_id, student_id])
  @@index([student_id, state])
  @@map("content_assignments")
}

model ContentOpenEvent {
  id            String   @id @default(uuid())
  assignment_id String
  opened_at     DateTime @default(now())
  // Coarse signal only — first open + subsequent opens beyond the
  // 24h dedupe window. We do not record minute-by-minute reads.

  @@index([assignment_id, opened_at])
  @@map("content_open_events")
}
```

### 5.2 Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/coach/content` | coach | Multipart for `pdf` / `video`; JSON for `newsletter` / `link`. |
| PATCH | `/api/coach/content/:id` | coach (owns) | Edit metadata. State transitions via dedicated endpoints. |
| POST | `/api/coach/content/:id/publish` | coach (owns) | Validates required fields per kind; writes `published_at`. |
| POST | `/api/coach/content/:id/archive` | coach (owns) | Soft-archive. |
| POST | `/api/coach/content/:id/assign` | coach (owns) | `{ student_ids: [...] }`. Creates one assignment per id. |
| POST | `/api/coach/content/assignments/:id/rescind` | coach (owns) | State → `rescinded`. |
| GET | `/api/coach/content` | coach | Coach's board. |
| GET | `/api/content` | student (L2/L3) | Student's assigned items, signed URLs minted on demand. |
| GET | `/api/content/:assignment_id/url` | student (L2/L3) | Returns a fresh signed URL (5m TTL); also writes `opened_at` if first. |
| POST | `/api/admin/content/:id/takedown` | owner | Hard-archive + storage delete; sets `state=removed`. |

The **read of a content item via signed URL** is intentionally
two-step (`GET /api/content` returns metadata, `GET
/api/content/:assignment_id/url` mints the URL). Reasons:

- Avoids minting a signed URL on every list view.
- Lets the open event correspond to the *intent to view*, not the
  list render.
- Signed URLs are short-lived; they age out before they could be
  shared meaningfully.

### 5.3 Per-kind validation

```ts
// src/content/dto.ts (implementation PR)
const PdfPublishSchema = z.object({
  kind: z.literal('pdf'),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  // file uploaded separately; storage_key written by backend
});

const VideoPublishSchema = z.object({
  kind: z.literal('video'),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  // file uploaded separately; coach_premium tier required (see §08)
});

const NewsletterPublishSchema = z.object({
  kind: z.literal('newsletter'),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  html_body: z.string().min(1).max(200_000),  // ~ 200 KB max
});

const LinkPublishSchema = z.object({
  kind: z.literal('link'),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  external_url: z.string().url().refine(isAllowlistedDomain, {
    message: 'external URL must be in the allowlist; financial product domains are not permitted',
  }),
});

export const ContentPublishSchema = z.discriminatedUnion('kind', [
  PdfPublishSchema, VideoPublishSchema, NewsletterPublishSchema, LinkPublishSchema,
]);
```

`isAllowlistedDomain` is the same allowlist used by `01-challenges.md`
description-link sanitisation; see `09-compliance.md` § How.

### 5.4 Mobile UX

- **Student index** — a list of cards. Each card: kind glyph
  (single-stroke icon, no fill), title, the 2000-char description
  if present, a "View" affordance. The card uses the existing
  `Card` primitive; doctrine forbids new chrome. Newly assigned
  items are surfaced at the top with a subtle hairline highlight,
  never a coloured badge.
- **Student detail (per kind):**
  - **pdf** — inline `react-native-pdf` viewer; fetches the signed
    URL from the dedicated endpoint.
  - **video** — inline `expo-av` player; signed URL.
  - **newsletter** — sanitised HTML rendered with
    `react-native-render-html`; a constrained subset of tags + no
    external image fetches.
  - **link** — confirmation modal: "this opens an external page
    your coach has linked. Coaches do not link financial product
    pages on this app." Then `Linking.openURL`.
- **Coach board** — a sortable list of authored items, with a
  small per-item statistic: "assigned to N clients, opened by M".

## 6. How — the implementation pattern

### 6.1 Storage

- Bucket `content`, non-public. Backend mints signed URLs via the
  Supabase service-role key.
- Signed URL TTL: 5 minutes.
- Object key: `content/<coach_id>/<content_id>/<random-uuid>.<ext>`.
- Re-upload on edit creates a new object; the old one is
  scheduled for deletion 7 days out (same cleanup cron as
  `03-profile-avatars.md` §6).

### 6.2 Encoding

- **PDF:** accepted as `application/pdf`, max 25 MB. We do **not**
  re-render PDFs server-side; we reject anything not parseable as a
  PDF (`pdf-parse` or similar to validate the first page).
- **Video:** accepted as `video/mp4` or `video/quicktime`, max 500
  MB. Re-encoded server-side to H.264 1280×720, AAC audio, ≤ 5
  minutes. Anything over 5 minutes is rejected at the boundary
  (the doctrine: a coach video is a short walkthrough, not a
  feature film). `coach_premium` tier required (§08).
- **Newsletter HTML:** sanitised with `sanitize-html` against an
  allowlist of tags (`p, h1..h4, em, strong, ul, ol, li, a, hr,
  blockquote, br`) and attributes (`href` on `a`).
- **Link external URL:** Zod-validated against `isAllowlistedDomain`.

### 6.3 Authorization

- Mutating coach endpoints: `JwtAuthGuard + RoleGuard('coach') +
  OwnsContentGuard`. The new guard mirrors `OwnsStudentGuard`.
- Service-layer assert: `assertCoachOwnsContent`, called before
  every Prisma write.
- Student reads: `JwtAuthGuard + EntitlementGuard('content')`.
- Owner takedown: `JwtAuthGuard + RoleGuard('owner')`.

### 6.4 Doctrine pin tests

`test/content-doctrine.spec.ts`:

- The DTO returned to a student carries no Supabase service-role
  artifacts (no `service_role` substring, no bucket name, no full
  object key — only the signed URL).
- Newsletter HTML output is sanitised: a fixture with a `<script>`,
  `<iframe>`, `onload=`, `javascript:` URL is sanitised away.
- Link `external_url` rejected if not in the allowlist.
- The platform disclaimer string is rendered inside every published
  content payload (server-side) — pinned by reading the response
  body and asserting the disclaimer constant is present.

`test/content.service.spec.ts`:

- `assertCoachOwnsContent` rejects cross-tenant.
- Open event idempotency (24h dedupe).
- Rescind state machine.

## 7. Privacy & security

- **Signed URLs only.** Pinned by §6.4.
- **Sanitised HTML.** No remote image embeds; the renderer
  configuration disables `<img>` to non-allowlisted hosts (we
  surface a placeholder for omitted images).
- **No client-side fetch of bucket directly.** The mobile app never
  has a Supabase service-role key; signed URLs are the only path.
- **Audit on takedown.** `POST /api/admin/content/:id/takedown`
  writes a `coach_notes` row attributed to the owner with the
  `reason`. The audit trail mirrors the entitlement-tier change
  pattern (`08-entitlements.md` §6.2).

## 8. Abuse & moderation

1. **Coach uploads a financial-product brochure as a PDF.**
   "Open this lender account by Friday." **Mitigation:** PDFs
   bypass the URL allowlist (we don't OCR the PDF body — that's
   too expensive). The platform disclaimer is rendered alongside
   every PDF, and the report queue surfaces flagged items to the
   owner. We accept that PDFs are a softer surface than challenge
   description URLs.
2. **Coach uploads a video that violates licensing.** Movie clip
   as a "motivation" intro. **Mitigation:** moderation queue.
   We do **not** integrate Content ID at v1.
3. **Newsletter as a phishing vector.** A `<a href="bad.com">`
   link inside a newsletter bypasses the link allowlist. **Mitigation:**
   the HTML sanitiser passes anchor `href`s through the same
   `isAllowlistedDomain` check the link kind uses. Anchors with
   non-allowlisted hrefs are stripped (text retained).
4. **A leaked signed URL.** A client forwards the signed URL to a
   non-client. **Mitigation:** 5-minute TTL bounds the leak. We
   accept that within the 5-minute window the URL is open.

## 9. Feature flags

- Global: `FEATURE_CONTENT_ENABLED`. Defaults to false at first
  deploy. When false, every endpoint returns `404`.
- Per-coach: `coach_profiles.feature_flags.content_enabled`.
- Per-tier: `video` kind requires `coach_premium`. The endpoint
  validates this at write time.

Kill-switch: flip the global flag. In-flight assigned content
remains visible to clients (the metadata endpoint still works);
new uploads and assignments are rejected. Reasoning: a kill-switch
that hides a client's content board mid-incident is more disruptive
than one that hides the authoring surface.

## 10. Analytics

- `content.uploaded` — `{ coach_id, kind, file_size_bytes }`.
- `content.published` — `{ coach_id, content_id, kind }`.
- `content.assigned` — `{ coach_id, student_id, content_id }`.
- `content.opened` — `{ assignment_id, kind, time_to_first_open_ms }`.
- `content.rescinded` — `{ assignment_id }`.
- `content.takedown` — `{ content_id, by_owner_id }`.

The "healthy" signal: `opened / assigned > 0.5` within 7 days for
non-archived items. Below that, the coach's content surface tab in
the admin dashboard flags the coach for a content-quality review.

## 11. Rollout

1. **Founders + PDF/link only.** Owner enables global flag, sets
   per-coach flag for founding cohort. PDF + link kinds only;
   newsletter and video flags off.
2. **Newsletter.** After two weeks of PDF/link, enable
   `newsletter` kind. The HTML sanitiser is the highest-risk
   surface; a separate ramp.
3. **Video.** Last; only `coach_premium` coaches.

Rollback: global flag.

## 12. Tests

- `test/content.service.spec.ts` — tenancy, state machine, dedupe.
- `test/content.controller.spec.ts` — auth, multipart, signed URL
  TTL.
- `test/content-doctrine.spec.ts` — sanitisation, disclaimer
  presence, allowlist enforcement.
- `test/content-cleanup.spec.ts` — orphan storage object deletion.

## 13. Risks

1. **PDF is a compliance hole.** We can't OCR every PDF for
   product-recommendation language. **Response:** the disclaimer
   is the legal mitigation; the moderation queue is the
   operational one. Coaches sign a content policy at
   `coach_premium` purchase that makes this explicit.
2. **Storage cost on video.** Encoding to 720p caps it at ~30 MB
   for a 5-minute clip; per coach, ~300 MB if they publish 10.
   **Response:** `coach_premium` covers the storage cost. The 5-
   minute cap is the budget control.
3. **Mobile rendering of newsletters is brittle.** The sanitised
   HTML may render badly on smaller devices. **Response:** the
   newsletter kind is the *third* rollout phase; we ship PDF/link
   first, gather feedback, then enable newsletter.

## 14. Dependencies

- `08-entitlements.md` — L2/L3 + coach tier gating.
- `06-assignments.md` — shared assignment primitive (folded here).
- `09-compliance.md` — URL allowlist, disclaimer string.
- `media` module — shared upload pipeline, cleanup cron.
- `sanitize-html`, `pdf-parse`, `react-native-pdf`, `expo-av`,
  `react-native-render-html` — new deps.

## 15. Acceptance criteria

- [ ] Schema migration adds the three tables.
- [ ] Each kind round-trips end-to-end in a smoke test.
- [ ] Signed URL TTL is 5 minutes; pinned by test.
- [ ] HTML sanitiser strips scripts, iframes, on-handlers, and
      non-allowlisted anchor hrefs.
- [ ] Disclaimer string is rendered inside every published
      content payload server-side.
- [ ] Owner takedown endpoint exists and writes audit.
- [ ] Cleanup cron deletes orphan storage objects after 7 days.

## 16. Operator handoff

1. Apply the migration.
2. Create the `content` Supabase Storage bucket; non-public.
3. `flyctl secrets set FEATURE_CONTENT_ENABLED=false -a
   tgp-finance-api`.
4. Founding-cohort: enable per-coach flag.
5. Phase 1 GA: PDF + link kinds only — gated at the controller.
6. Phase 2 GA: enable `newsletter`.
7. Phase 3 GA: enable `video` for `coach_premium`.
8. Moderation reports surface to the concierge inbox until a
   dedicated owner moderation surface ships.
