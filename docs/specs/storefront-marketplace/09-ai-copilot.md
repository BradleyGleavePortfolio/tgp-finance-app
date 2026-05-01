# 09 — AI business / copilot finance boundaries

> **Status:** draft, documentation-only. Authorises runtime PR-FS-10 (AI copilot for coaches).

## 1. WHY

Two AI surfaces will live in TGP: Finance:

1. **Client-side AI coach** — already shipped. Backed by Perplexity
   sonar-pro. Voice-pinned by `backend/test/ai-prompt-doctrine.spec.ts`.
   Read-only education; not advice; quiet doctrine.

2. **Coach-side AI copilot** — new, from this spec. Drafts replies,
   recaps, intake summaries, listing copy, post drafts, reward
   titles, application decision-notes. Operates against the
   coach's own data. Every output is a *draft*; a human reviews
   before sending.

Both must hold the consumer-finance line — no advice, no outcome
promise, no fiduciary framing — and that line is *strictly tighter*
than the equivalent fitness pin from PR #117 (AI Program Builder
RFC). This spec defines the shape of the coach copilot, the tool
allow-list, the doctrine pin, and the explicit handoff with PR #117
for the prompt-template / draft / publication pattern.

The one-line claim:

> A coach uses an in-app AI copilot to draft messages, recaps, and
> listing copy from their own data. Every draft passes the
> outcome-claim filter and the same voice doctrine the client-side
> AI coach holds. Nothing auto-sends; every send is a deliberate
> human action; the platform never gives financial advice.

## 2. WHEN

PR-FS-10 ships once:

- PR #117 (AI Program Builder RFC) is accepted in the fitness
  backend so the prompt template / draft / publication pattern is
  the one we extend.
- The doctrine pin is extended (`backend/test/copilot-doctrine.spec.ts`).
- The closed tool list (§5.3) is approved.
- Per-coach `copilot_enabled` flag exists.
- Provider posture is decided: by default, coach copilot uses the
  same provider as the client AI coach (Perplexity), but the
  spec is provider-pluggable; long-form drafting may use Anthropic
  per PR #117 §X.

## 3. WHERE

- `backend/prisma/schema.prisma` — `CopilotDraft`,
  `CopilotPromptTemplate`, `CopilotProviderEvent`.
- `backend/src/copilot/`.
- `backend/src/copilot/tools/` — closed tool list, each a typed
  function.
- `mobile/app/(copilot)/` — drafts inbox, drafts editor, history.
- `backend/test/copilot-doctrine.spec.ts`,
  `backend/test/copilot-tools.spec.ts`.

## 4. WHO

| Actor | Capability |
|---|---|
| Coach | Trigger a draft from a coach-facing surface (post compose, reply compose, listing compose, intake review, etc.). Edit; send. Cannot trigger a draft against another coach's data. |
| Coach Premium | Same plus long-form drafting (intake summary, weekly recap, mass-message draft) and voice tuning (per PR #121 spec #24 — coach AI voice / tone). |
| Client | Does not see the copilot. The existing client AI coach is unchanged. |
| OWNER | Read all drafts (audited); review the filter-trip queue; force-disable a coach's copilot. |
| Compliance | Spot-check drafts that exited the queue. |

## 5. WHAT

### 5.1 The draft object

```prisma
model CopilotDraft {
  id              String       @id @default(cuid())
  coach_id        String
  surface         CopilotSurface  // 'reply' | 'post' | 'listing' | 'intake_summary' | 'weekly_recap' | 'reward_title' | 'application_note'
  scope_kind      String?      // optional: 'space' | 'offer' | 'cohort' | 'client'
  scope_id        String?
  prompt_template_id String
  inputs_json     Json         // tool inputs at request time
  output_text     String       @db.VarChar(8000)
  filter_state    FilterState  @default(passed)
  filter_matches  Json?
  state           DraftState   @default(draft)
  sent_at         DateTime?
  sent_to_kind    String?      // 'reply', 'post', etc.
  sent_to_id      String?
  created_at      DateTime     @default(now())
  updated_at      DateTime     @updatedAt
}

enum CopilotSurface { reply post listing intake_summary weekly_recap reward_title application_note }
enum FilterState { passed soft_blocked hard_blocked }
enum DraftState { draft edited blocked sent discarded }
```

```prisma
model CopilotPromptTemplate {
  id              String       @id @default(cuid())
  surface         CopilotSurface
  template_text   String       @db.Text
  voice_pinned   Boolean      @default(true)
  version         Int
  active          Boolean      @default(false)
  created_at      DateTime     @default(now())
}
```

```prisma
model CopilotProviderEvent {
  id              String       @id @default(cuid())
  draft_id        String
  provider        String       // 'perplexity' | 'anthropic'
  request_tokens  Int
  response_tokens Int
  latency_ms      Int
  created_at      DateTime     @default(now())
}
```

### 5.2 Draft lifecycle

1. Coach clicks "Draft with AI" on a surface.
2. Backend resolves the prompt template (per surface), gathers
   inputs via the **closed tool list**, calls provider.
3. Output goes through:
   - **Outcome-claim filter** — the same.
   - **Voice doctrine filter** — same regex set as the client AI
     coach pin (`no emoji`, `no audience framing`, `no FP persona`,
     etc., per `mobile/DESIGN.md` §5).
   - **Money-shape scrubber** — same as community.
4. Filter state recorded. `passed` → draft visible to coach as-is;
   `soft_blocked` → draft visible with redactions + warning;
   `hard_blocked` → draft hidden, OWNER queue, coach sees
   "Could not draft — blocked by filter. Edit your prompt and
   retry."
5. Coach edits inline.
6. Coach sends. Send routes to the surface controller (`reply`
   → community reply controller, `listing` → offer update, etc.)
   with the draft id attached for audit.

### 5.3 Closed tool list

The copilot is a **constrained tool-using assistant**, not a
free-form chatbot. Every tool is a typed function in
`backend/src/copilot/tools/`. New tools = code change + review.

| Tool | Reads | Used by surfaces |
|---|---|---|
| `getClientSnapshot` | client's bucketed insights (savings rate band, debt band, streak length, WVS level, priority level) — **never raw amounts** | `reply`, `intake_summary`, `weekly_recap`, `application_note` |
| `getRecentMessages` | thread for a (coach, client) pair, last N | `reply` |
| `getOfferDraft` | the offer being authored | `listing` |
| `getCohortRoster` | cohort_id → roster bands (bucketed) | `weekly_recap` |
| `getRewardTriggerSpec` | reward kind + params | `reward_title` |
| `getCoachVoiceProfile` | per PR #121 #24 — coach's voice setting | every surface |
| `getApplicationContext` | application_id → form responses + bucketed snapshot | `application_note` |

The tool layer is the *only* way the copilot reads data. No free
SQL, no embeddings beyond the prompt-template-embedded examples.
No tool returns raw money. Pinned by
`backend/test/copilot-tools.spec.ts`.

### 5.4 Voice doctrine

The system prompt for every surface inherits from the existing
client AI coach prompt:

- No emoji.
- No audience framing ("As a finance professional...").
- No "FP" persona.
- No 15-example sales-funnel pattern.
- Voice-rule keywords present (per `ai-prompt-doctrine.spec.ts`).
- Numbers over adjectives.
- Bone/ink/oxblood register.

Plus the copilot-only additions:

- "Drafts only. Never send."
- "Never claim a financial outcome."
- "Never be a fiduciary."
- "Never quote a balance, account name, or institution."

Pinned by `backend/test/copilot-doctrine.spec.ts`. The system
prompt is a `CopilotPromptTemplate` row; activating a new version
requires the test to pass against the new prompt.

### 5.5 Filter state semantics

- `passed`: draft is visible; sending is one tap.
- `soft_blocked`: a low-stakes match (e.g., a percentage in a
  context the filter doesn't fully resolve). Draft visible with
  the matched span highlighted in oxblood; coach must explicitly
  acknowledge to send.
- `hard_blocked`: a high-stakes match (e.g., "guaranteed return",
  "earn 5%"). Draft is **not** visible; coach sees only "Blocked
  by filter — try a different prompt." Audit row written; OWNER
  reviews trends in the trip queue.

### 5.6 API sketch

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/copilot/drafts` | coach | Trigger a draft. Body: `{ surface, scope, inputs }`. Returns draft id + state. |
| GET | `/api/copilot/drafts/:id` | coach | Get draft. |
| PATCH | `/api/copilot/drafts/:id` | coach | Edit `output_text`. |
| POST | `/api/copilot/drafts/:id/send` | coach | Send. Routes to the destination surface. |
| POST | `/api/copilot/drafts/:id/discard` | coach | Discard. |
| GET | `/api/admin/copilot/blocked-queue` | OWNER + compliance | Hard-blocked queue. |

Throttling: 60 drafts / hour / coach (a working session is fine; a
batch run is rate-limited).

Every successful provider call is logged in
`CopilotProviderEvent` for cost analysis (per PR #117 §13).

## 6. HOW (the runtime PR shape)

PR-FS-10 ships:

1. The three schemas.
2. `backend/src/copilot/` module + the closed tool list + the
   prompt template store.
3. The provider adapter (one provider in v1; pluggable interface).
4. The seven `CopilotSurface` integrations: each surface gets a
   "Draft with AI" CTA in its existing compose surface and a
   send-route.
5. Doctrine pin + tools pin + filter pin.
6. OWNER queue UI.
7. Module README at `backend/src/copilot/README.md` per the
   module-level shape.

## 7. Privacy & security

- Tenancy: every tool call carries the coach's tenant id; tools
  reject cross-tenant requests.
- Money privacy: tools return bucketed insights only; pinned.
- Provider posture: PII (client display names, message threads) is
  passed to the provider only via the prompt; provider is on a
  no-retain agreement (per PR #117 §X). Cost / latency logged
  separately.
- Drafts that include client-thread context are tagged with a
  `client_id` and respected by GDPR scrub: a deleted client's
  drafts are anonymised.
- Audit log on every send.
- Provider key in `backend/src/config/secrets.ts`; rotation via
  Fly secrets.
- The system prompt is *never* shipped to the client; only the
  rendered draft.

## 8. Abuse & moderation

- Outcome filter on every draft.
- Doctrine pin on every prompt template.
- Hard-blocked queue surfaced in OWNER UI; OWNER reviews weekly.
- A coach with > 10% hard-block rate over 7 days is paged and may
  have `copilot_enabled` paused.
- A coach cannot run drafts on another coach's data; tool-layer
  enforces.
- Rate-limit prevents prompt-grind attacks on the filter
  (60 / hour / coach).

## 9. Disclaimers (verbatim)

- Header of every draft surface (coach view):
  `ai_copilot_to_coach` (verbatim from `00-overview.md` §8).
- Footer of every drafted message that the coach sends to a
  client (e.g. via reply or recap):
  "Drafted with AI assistance and reviewed by your coach.
  Education only — not financial advice."
- The hard-blocked-queue UI:
  "Blocked drafts contain copy that does not pass the platform's
  outcome-claim filter. They are recorded for review and never
  shown to clients."

## 10. Feature flags & entitlements

| Flag | Default | Notes |
|---|---|---|
| `COPILOT_ENABLED` | off | global. |
| `coach_profiles.copilot_enabled` | off | per-coach; default off; `coach_premium` gets enabled by default after PR #117 acceptance. |
| `COPILOT_LONGFORM_ENABLED` | off | sub-flag for `intake_summary` / `weekly_recap` / `mass_message_draft` (the longer drafts). |
| `COPILOT_PROVIDER` | `'perplexity'` | which provider. |

| Capability | client | coach | coach_premium | OWNER |
|---|---|---|---|---|
| Trigger a draft | n/a | ✓ (short surfaces) | ✓ (all surfaces) | n/a |
| Send a draft | n/a | ✓ | ✓ | n/a |
| View blocked queue | n/a | ✗ | ✗ | ✓ |
| Force-disable copilot for a coach | n/a | ✗ | ✗ | ✓ |

## 11. Analytics

| Event | Properties |
|---|---|
| `copilot_draft_created` | surface, coach_id, prompt_template_id |
| `copilot_draft_filter_state` | draft_id, state |
| `copilot_draft_blocked_by_filter` | draft_id, matches |
| `copilot_draft_edited` | draft_id, char_delta |
| `copilot_draft_sent` | draft_id, surface, sent_to_kind |
| `copilot_draft_discarded` | draft_id |
| `copilot_provider_event` | draft_id, provider, latency_ms, request_tokens, response_tokens |

## 12. Rollout

- Stage 0: spec.
- Stage 1: PR-FS-10 ships with `COPILOT_ENABLED=false`. Internal
  smoke against fixtures.
- Stage 2: 3 `coach_premium` accounts; only `reply` and `listing`
  surfaces; OWNER reviews blocked-queue daily.
- Stage 3: 25 coaches; `intake_summary` and `weekly_recap` added.
- Stage 4: GA.

Kill switch: `COPILOT_ENABLED=false` returns 503 on
`/api/copilot/*`. Existing drafts visible read-only.

## 13. Tests

- `backend/test/copilot-doctrine.spec.ts`:
  - All voice-doctrine keywords present.
  - Outcome-claim filter trips on the corpus.
  - System prompt re-pinned on every template version change.
- `backend/test/copilot-tools.spec.ts`:
  - Each tool is typed; raw money never returned.
  - Cross-tenant tool call returns 403.
- `backend/test/copilot-filter-state.spec.ts`:
  - Soft / hard block thresholds match §5.5.
  - Hard-blocked drafts are not visible to coach.
- `mobile/test/copilot-screen.spec.tsx`:
  - Disclaimers verbatim.
  - Soft-block UI shows the matched span.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Copilot drafts an advice statement. | Outcome filter + doctrine pin + hard-block on advice phrasing. |
| Copilot leaks client PII to provider. | Bucketed tool returns; PII review on prompt templates; provider no-retain agreement. |
| Provider outage breaks coach UX. | Drafts are an opt-in CTA; surface continues to work without copilot. |
| Cost runaway. | Per-coach throttle; per-coach monthly token cap; PR #117 §13 cost controls reused. |
| Voice drift. | Doctrine pin re-runs on every template change. |
| Soft-block fatigue (coach ignores warnings). | Soft-block UI always requires explicit acknowledgement; analytics catches "send despite soft-block" patterns. |

## 15. Dependencies

- PR #117 (AI Program Builder) — prompt template + draft pattern.
- PR #121 #24 (coach AI voice) — voice tuning.
- Existing client AI coach pin (`backend/test/ai-prompt-doctrine.spec.ts`).
- PR #120 lane #08 (AI governance).

## 16. Acceptance criteria

- [ ] Schemas migrated.
- [ ] Closed tool list implemented; pinned.
- [ ] Doctrine pin extended to copilot.
- [ ] Soft / hard block thresholds pinned.
- [ ] Hard-blocked queue surfaced for OWNER.
- [ ] All disclaimers verbatim on coach-facing surfaces.
- [ ] Drafts to clients carry the AI-disclosure footer.
- [ ] Provider key + secrets management documented.

## 17. Operator handoff

- Runbook: `runbook/copilot.md` — blocked-queue triage, prompt
  template version bump, provider rotation, cost / token
  thresholds.
- Dashboard tiles: drafts / 24h, hard-block rate, sent rate,
  provider latency p95.
- Alerts: hard-block rate > 10% (page; suggests filter drift or
  prompt drift); provider latency p95 > 5s (FYI); per-coach token
  cap breach (page).
