# Profile Avatars — coach + client portraits

> **Closest existing module:** `backend/src/users/` (the existing
> `users.controller.ts` membership-card surface; pinned by
> `users-controller.spec.ts`). This module's `User.name` column is
> already exposed; an avatar is the visual analogue and lives next to
> it.

## 1. Why

Today every TGP Finance surface that names a person renders text
only — coach detail, client roster, accountability partner widget,
community feed. That is intentional under the luxury-quiet doctrine
(`mobile/DESIGN.md` §1, §2: bone, ink, oxblood; no ornament). A real
photo of a person is **not** ornament — it is identity, and identity
is part of the trust handshake between a coach and a client.

The product reasons are concrete:

- **Coach trust.** A prospect arriving via an invite link sees the
  inviting coach's display name today. A face above that name halves
  the friction of a "who is this person" check.
- **Client recognition.** A coach with 30+ clients who occasionally
  meets them on a call wants to attach the name to the face they
  saw. The accountability-partner widget, the leaderboard, and the
  coach roster all benefit.
- **Federation parity.** The fitness backend already exposes coach
  avatars on its admin console. The unified console renders both;
  finance returning `null` is a visible gap.

The product reasons we **do not** ship every fitness-app avatar
behaviour:

- No animated / video avatars. The luxury register forbids it.
- No "look how I'm doing" frames around an avatar (e.g. green
  border for streak). Forbidden by `mobile/DESIGN.md` §1 (one
  oxblood accent per screen) and §6 (no gamification chrome).
- No automatic avatar generation from EOD data ("today's mood as a
  graphic"). Out of scope and forbidden.

## 2. When

- **Set** by the user themselves on the settings surface, any time.
- **Replaced** by overwriting; previous storage object is deleted
  on a 7-day delay (so a CDN cache miss + rapid replace doesn't
  show a 404 to a peer).
- **Removed** by setting `avatar_url = NULL` on the user row. The
  storage object is deleted on the same 7-day delay.
- **Read** any time the user's name renders. The mobile UI
  optionally renders the avatar; if the URL is `NULL`, the name
  alone is rendered. There is no placeholder portrait silhouette
  glyph (mobile design forbids placeholder copy + chrome — and the
  same rule applies here: a missing avatar is a missing avatar,
  not a stand-in).
- **Deleted** as part of a GDPR-style erasure: when an account is
  deleted, the avatar storage object is hard-deleted in the same
  cleanup job.

## 3. Where

- **Backend module:** new `backend/src/media/` — the broader media
  module. It hosts avatars, and (in §04) the same module pattern
  hosts coach content. Two services under the same module so the
  Supabase Storage client is configured once.
- **Schema:**
  - `users.avatar_url` — nullable string, the canonical URL into
    Supabase Storage.
  - `users.avatar_uploaded_at` — nullable timestamp; powers the
    "uploaded recently" UX hint.
  - No avatar table; the URL is the source of truth.
- **Storage:**
  - Supabase Storage bucket `avatars`, public-read, write via the
    backend service role only.
  - Object key: `avatars/<user_id>/<random-uuid>.jpg`.
  - The random UUID in the path defeats trivial enumeration (you
    cannot guess another user's avatar URL even if you know their
    user id, because you don't know the per-image suffix). This is
    the **only** access control on avatars; the bucket itself is
    public-read.
  - We accept that a leaked avatar URL is leaked forever (no
    revocation primitive on a public-read CDN object). The user's
    rotation path is "upload a new one"; the old object is
    deleted on the 7-day cleanup.
- **Mobile route:**
  - `mobile/app/settings/avatar.tsx` — the user's own upload
    screen.
  - The avatar renders inline on existing surfaces; no new
    top-level route for viewing.

## 4. Who

- **Read:** anyone who can read the `User` row's name. Avatars
  follow the same scope as `name`. There is no "private avatar"
  affordance.
- **Write:** the user themselves. The owner can write any user's
  avatar via `/api/admin/users/:id/avatar` (used for moderation
  takedowns; sets to `NULL`). Coaches **cannot** set or remove a
  client's avatar — same precedent as setting names.

## 5. What — data and API

### 5.1 Schema additions

```prisma
model User {
  // ... existing fields ...
  avatar_url          String?
  avatar_uploaded_at  DateTime?
}
```

That is the entire schema change.

### 5.2 Storage layout

- Bucket: `avatars` (Supabase Storage, public-read).
- Path: `avatars/<user_id>/<random-uuid>.jpg`.
- Accepted formats: JPEG and PNG. Re-encoded server-side to JPEG
  at quality 88, max 512×512, EXIF stripped. (PNG is decoded and
  re-encoded; we don't keep PNG output.)
- Max upload size pre-encoding: 5 MB.
- Output size budget: ~120–180 KB for a 512×512 JPEG.

### 5.3 Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/users/me/avatar` | JWT | multipart upload; returns `{ avatar_url, avatar_uploaded_at }`. |
| DELETE | `/api/users/me/avatar` | JWT | clears the URL; queues storage object for 7-day delete. |
| POST | `/api/admin/users/:id/avatar/takedown` | owner | clears the URL on a flagged user. |

The upload endpoint is the **only** path that writes
`avatar_url`; no profile PUT carries the field. This is intentional
— uploads need encoding + size enforcement, and the profile PUT
should not become a media path.

### 5.4 The cleanup cron

A nightly job in `backend/src/media/avatar-cleanup.cron.ts`
(implementation PR) walks Supabase Storage and deletes objects
where:

- the object key's `<user_id>` segment maps to a user with a
  different current `avatar_url`, AND
- the object's storage `created_at` is older than 7 days.

The cleanup is the **only** delete path for storage objects. The
endpoints schedule deletes via this row (a `media_pending_deletes`
table or, simpler, a stamped column — see implementation PR for
the ergonomic call).

### 5.5 The mobile UX

- Settings screen has an "Avatar" card with the current avatar (or
  the user's name typeset in Cormorant Garamond at hero scale, the
  same way `mobile/app/(tabs)/profile.tsx` already presents the
  user's identity), an "Upload" button, and a "Remove" button.
- On upload, the client crops to 1:1 in a modal, posts the
  cropped JPEG, and re-renders on success.
- The avatar appears inline:
  - On the profile tab, top-left of the membership card.
  - On the coach detail card seen by an invited prospect.
  - On the accountability-partner widget (next to the partner
    name, replacing the existing initials chip).
  - **Not** on the leaderboard rows (see `02-leaderboards.md` §5.5
    — initials only on leaderboard rows, by doctrine).
  - **Not** on the community feed rows. The community feed is
    anonymised (`anonymiseName`); attaching an avatar to an
    anonymised name is a doctrine violation.
- A muted, single-stroke hairline circle frames the avatar (inherits
  the existing card stroke). No drop shadow, no glow, no oxblood
  border.

## 6. How — the implementation pattern

### 6.1 Encoding

The backend uses `sharp` to:

- decode JPEG / PNG,
- reject unsupported formats early (before allocating memory),
- strip EXIF + colour profile,
- centre-crop to square if not already,
- resize to 512×512,
- encode as JPEG quality 88,
- write to Supabase Storage with a fresh UUID suffix,
- then update `users.avatar_url` and `users.avatar_uploaded_at` in
  one Prisma call.

The 5 MB cap is enforced at the multipart middleware layer
(`@nestjs/platform-express` with `limits: { fileSize: 5 * 1024 *
1024 }`). Anything larger is rejected at the boundary; no
half-uploaded tempfiles.

### 6.2 The race window

Between writing the new storage object and updating the row, a
read may see the old URL. We accept this; it self-heals on the
next mobile fetch. We do **not** roll back the storage write on
DB failure — the cleanup cron deletes any orphan after 7 days.

### 6.3 Doctrine pin tests

`test/avatars-doctrine.spec.ts`:

- The output of the encoder is JPEG, ≤ 512×512, no EXIF.
- The `User` DTO returned from `/api/users/me` includes
  `avatar_url` only as a string; no signed-URL field, no expiry,
  no `srcset`. (The luxury register has one avatar at one size;
  responsive images are a future affordance, not v1.)
- `mobile/src/components/Avatar.tsx` (new) renders the image
  inside the existing `Card` stroke and never adds a coloured
  border (regex test on the JSX of the component).

`test/avatars.controller.spec.ts`:

- 5 MB cap enforced; 6 MB body returns `413` before reaching the
  encoder.
- Non-JPEG/PNG rejected with `415`.
- Cross-user write rejected — the path uses `request.user.id`,
  never a body field for the user id.

## 7. Privacy & security

- **Public-read URLs.** Documented; the per-image UUID suffix is
  the access control.
- **EXIF stripped.** Phone-camera EXIF carries GPS. We strip it
  unconditionally.
- **No facial recognition.** We do not run any classifier on
  avatars at upload. The owner moderation queue is the only check
  on inappropriate content.
- **GDPR delete cascades.** Account deletion enqueues the avatar
  storage object for deletion on the same path.
- **No biometric data.** Avatars are JPEGs. We don't store face
  embeddings, hashes, or any derivative.

## 8. Abuse & moderation

1. **Inappropriate avatar.** Nudity, harassment, brand violation.
   **Mitigation:** every avatar surfaces a "report" affordance to
   the viewing user. Reports route to the owner moderation queue.
   The owner action is `POST /api/admin/users/:id/avatar/takedown`,
   which clears the URL.
2. **Impersonation.** A client uploads a coach's photo as their
   own avatar. **Mitigation:** initial response is the report
   queue; structurally, this is a name-impersonation problem
   (avatars without name parity rarely fool anyone). The client's
   `name` field is also user-controlled today; the threat surface
   is unchanged.
3. **Brand abuse.** A client uploads a competitor's logo as their
   avatar to advertise. **Mitigation:** moderation queue. Same
   action as §1.
4. **Avatar-as-tracking-pixel.** Avatars are public-read at a
   stable URL; an external site could embed a coach's avatar and
   detect when a user views the third-party page. **Mitigation:**
   we accept this. The avatar URL is no more a tracking pixel than
   any public-read CDN asset. The bucket's CDN config does not
   honour third-party referrer-based access control.

## 9. Feature flags

- Global: `FEATURE_AVATARS_ENABLED`. When false, the upload
  endpoint returns `404`, the avatar field is stripped from
  user-facing DTOs, and the mobile settings card is hidden.
- No per-coach flag. Avatars are per-user.
- Kill-switch: flip the global flag; existing storage objects are
  not deleted (so re-enabling restores avatars).

## 10. Analytics

- `avatar.uploaded` — `{ user_id, role, file_size_bytes }`.
- `avatar.removed` — `{ user_id, role }`.
- `avatar.takedown` — `{ user_id, role, by_owner_id }`.

Avatar uploads do not appear in any client-side PostHog event with
PII.

## 11. Rollout

1. **Founders, opt-in.** Owner enables the global flag.
   Founding-cohort coaches upload first; a quiet email asks them
   to validate the encoding pipeline against their phone-camera
   uploads (the most common shape we see in production).
2. **Coach-wide.** Every coach can upload.
3. **Client-wide.** Clients can upload.

There is no kill-switch beyond the global flag. Storage objects
persist across rollback; re-enabling restores the surface.

## 12. Tests

- `test/avatars.controller.spec.ts` — auth, file size, content
  type, cross-user rejection.
- `test/avatars.encoder.spec.ts` — encoder output is JPEG, ≤
  512×512, no EXIF.
- `test/avatars-doctrine.spec.ts` — DTO shape, mobile render shape.
- `test/avatars-cleanup.spec.ts` — orphan deletion after 7 days.

## 13. Risks

1. **Storage cost spikes.** Per-image budget is small (~150 KB),
   but a 100k-user product with monthly avatar churn approaches
   tens of GB. **Response:** the cleanup cron caps the steady-state.
   We watch the `avatars` bucket size in Supabase.
2. **Encoder denial-of-service.** A pathological PNG that decompresses
   to gigabytes ("zip bomb"). **Response:** the multipart cap is
   5 MB pre-decode; `sharp` is configured with a max input pixel
   count (e.g. `limitInputPixels: 64_000_000`).
3. **The luxury register breaks.** A future PR adds a coloured
   border for streaks / completed challenges. **Response:** doctrine
   pin test (§6.3) on the `Avatar.tsx` component asserts no
   coloured border, and the `mobile/DESIGN.md` § "Forbidden" entry
   for "second accent" applies.

## 14. Dependencies

- Supabase Storage (already configured for the existing
  `SUPABASE_SERVICE_ROLE_KEY`).
- `sharp` — new dependency on the backend.
- `@nestjs/platform-express` (already installed) for the
  multipart middleware.
- The owner moderation surface (`10-rollout-and-ops.md`).

## 15. Acceptance criteria

- [ ] Migration adds `avatar_url` and `avatar_uploaded_at` to
      `users`. Backfill is `NULL`.
- [ ] Encoder produces JPEG ≤ 512×512, no EXIF.
- [ ] Upload endpoint enforces the 5 MB cap pre-decode.
- [ ] Owner takedown endpoint exists and routes through the
      same admin guard pattern.
- [ ] Cleanup cron deletes orphans after 7 days.
- [ ] `mobile/DESIGN.md` review: no oxblood border, no streak
      frame, no shadow.

## 16. Operator handoff

1. Apply the migration.
2. Create the `avatars` Supabase Storage bucket; set public-read.
3. `flyctl secrets set FEATURE_AVATARS_ENABLED=true -a
   tgp-finance-api`.
4. Schedule the cleanup cron (Fly machine cron entry; daily at
   03:17 UTC). The cron reads the same `DATABASE_URL` and
   `SUPABASE_*` secrets the API uses.
5. The owner moderation surface (concierge inbox) handles takedowns
   until a dedicated admin moderation surface ships.
