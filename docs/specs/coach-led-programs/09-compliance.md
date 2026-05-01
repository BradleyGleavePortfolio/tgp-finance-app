# Compliance — consumer-finance boundaries

> **This document gates the spec set's merge.** A compliance reviewer
> with consumer-finance background must sign off in the PR thread
> before this document — and the spec set as a whole — merges. The
> rest of the spec docs reference this one for the URL allowlist, the
> disclaimer string, the scope-of-coaching guardrails, and the
> moderation policy.

## 1. Why

The Growth Project: Finance is **read-only**: it observes balances
and reports on them; it does not move money, originate credit,
recommend specific products, or hold funds. The existing app stays
on the safe side of the consumer-finance regulatory line by virtue
of doing nothing that would put it across.

The coach-led surfaces in this spec set introduce **third-party
authoring** of behavioural prompts, content, and assignments. A
coach is not a fiduciary, not (in most jurisdictions) a registered
investment advisor, and not (anywhere) a credit counsellor by
default. Some coaches in the cohort are CFP-credentialled; most are
not. The product cannot rely on per-coach credentialling to keep us
on the safe side of the line.

This document draws the bright line in code, not in policy:

- A coach **may** author a behavioural challenge ("save $X over N
  weeks", "log no-spend Sundays for 4 weeks").
- A coach **may** publish a regimen of priorities ("phase 1: build
  cash floor; phase 2: minimums; phase 3: aggressive top-line").
- A coach **may** share educational content (PDFs, newsletters,
  videos, links to educational sites).
- A coach **may not** prescribe a specific financial product
  ("open Robinhood", "use Citi credit card", "pay off via Lender X").
- A coach **may not** offer specific tax or investment advice that
  ties to a transaction ("buy SPY", "Roth-convert $50k by Friday").
- A coach **may not** make outcome guarantees ("save $100k in 12
  months").
- The app **must** render the platform disclaimer alongside every
  coach-authored artefact, server-side, on every read.
- The app **must** reject URLs that point at financial product
  vendors at write time.

## 2. When

- Disclaimer rendering is **always-on**: every coach-authored
  artefact returns the disclaimer in its read DTO. No flag turns
  it off. No coach can override.
- URL allowlist is enforced at **write time** (publish + send).
  Existing rows that pre-date a list change are checked at
  read time too — non-allowlisted links are stripped from
  rendered output even if they survived a previous publish.
- Moderation reports are **read on demand** by the owner; SLA
  documented in §10.

## 3. Where

- **Disclaimer text:** `backend/src/common/legal/disclaimer.ts`
  (new file, implementation PR). One exported constant, used by
  every spec module's response shaper. Shape:

  ```ts
  export const PLATFORM_DISCLAIMER = `
  This artefact is published by an independent coach using The
  Growth Project: Finance. It is provided for informational
  purposes only. Nothing here constitutes financial, tax, or
  investment advice. Coaches on this platform may not prescribe
  specific financial products. Consult a licensed financial
  professional before making financial decisions.
  `.trim();
  ```

  This text is the single source of truth and is rendered into
  every published coach artefact's payload. Edits go through a
  reviewed PR.

- **URL allowlist:** `backend/src/common/legal/url-allowlist.ts`.
  A list of allowlisted **eTLD+1 domains**. Out of the box:

  ```ts
  // Educational, deliberately narrow. Add via reviewed PR only.
  export const URL_ALLOWLIST = new Set([
    'irs.gov',
    'ssa.gov',
    'consumerfinance.gov',
    'investor.gov',
    'mymoney.gov',
    'usa.gov',
    'thegrowthproject.courses',  // first-party
    'tgp-finance-api.fly.dev',   // first-party
    'youtube.com',                // for embedded coach videos w/o uploading
    'vimeo.com',                  // same
    // ... reviewed list grows by reviewed PR ...
  ]);
  ```

  The list is **closed** for financial-product domains. Robinhood,
  Fidelity, Vanguard, Schwab, Citi, Chase, Wells Fargo, SoFi,
  Earnest, Affirm, Klarna, Coinbase, Binance — none are on the
  list and none are added without an explicit compliance review
  documented in the same PR.

- **Mobile rendering:** every coach-authored artefact's detail
  screen renders `PLATFORM_DISCLAIMER` at the bottom of the
  artefact, in the existing meta-text typography
  (`mobile/src/theme/`'s `meta` text variant — small, ink-on-bone,
  no oxblood).

## 4. Who

- **Disclaimer** is rendered to every reader of a coach-authored
  artefact (coach previewing, client viewing, owner auditing).
- **URL allowlist** affects authoring (coach blocked at write time)
  and rendering (links scrubbed at read).
- **Moderation queue** is read by the owner; reports are submitted
  by any client viewing a coach artefact.

## 5. What — the policy in code

### 5.1 The URL allowlist helper

```ts
// src/common/legal/url-allowlist.ts (implementation PR)
import { parse } from 'tldts';
import { URL_ALLOWLIST } from './url-allowlist.data';

export function isAllowlistedDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const tldts = parse(parsed.hostname);
    if (!tldts.domain) return false;
    return URL_ALLOWLIST.has(tldts.domain);
  } catch {
    return false;
  }
}
```

The allowlist is an `eTLD+1` match (so `youtu.be` would NOT match
`youtube.com` — they're separate eTLD+1s — and we add both
explicitly if we want both). Subdomain matching is implicit:
`www.irs.gov` and `apply.irs.gov` both match.

### 5.2 Where the allowlist is called

| Surface | Field | Hook |
|---|---|---|
| Challenge | `description` (markdown anchor URLs) | sanitiser strips non-allowlisted hrefs |
| Content (link kind) | `external_url` | Zod refine at boundary |
| Content (newsletter kind) | anchor URLs in HTML | sanitiser strips non-allowlisted hrefs |
| Program | `description` markdown | sanitiser strips |
| Message | `body` markdown | sanitiser strips |
| Avatar | n/a | n/a — avatars don't carry URLs |

The sanitiser is a single helper used by every surface
(`backend/src/common/markdown/sanitize.ts` in the implementation
PR). It runs on write **and** on read. Read-time scrub catches
rows authored under a previous, more permissive allowlist version.

### 5.3 Disclaimer rendering

Every spec module's read DTO includes a `disclaimer` field whose
value is `PLATFORM_DISCLAIMER`. The DTO is shaped server-side; the
client cannot suppress it, the coach cannot override it, the field
is never null.

```ts
// example shape (challenge detail DTO; analogous for content / regimen / message)
{
  challenge: { ... },
  assignment: { ... },
  disclaimer: PLATFORM_DISCLAIMER,
}
```

A doctrine pin test asserts the field is present and equal to
the constant: `test/legal-disclaimer.spec.ts`. Editing the
constant also edits the test fixture in the same PR (and the
README index).

### 5.4 Outcome-guarantee filter

A second filter rejects coach-authored copy that contains
outcome-guarantee language. The filter is intentionally simple
and intentionally lossy:

```ts
// src/common/legal/outcome-guarantee.ts (implementation PR)
const TRIGGERS = [
  /\b(guarantee|guaranteed)\b/i,
  /\bsave\s+\$[\d,]+\s+(in|by|within|over)\b/i,
  /\bdouble\s+your\s+(savings|net worth|income)\b/i,
  /\bzero\s+(debt|risk)\b/i,
  /\b(retire|fi(re)?)\s+by\s+(?:age\s+)?\d{2}\b/i,
];

export function flagsOutcomeGuarantee(text: string): string | null {
  for (const re of TRIGGERS) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}
```

On publish (challenge / regimen / content metadata / newsletter
HTML), the helper runs against the description / body. A match is
**not** a hard block — it's a soft warning surfaced to the coach
("this language reads as an outcome guarantee; please rephrase or
contact compliance"). The publish proceeds; the flag is recorded
in a `compliance_flag` column on the row for the moderation queue.

We deliberately don't hard-block: the false-positive rate is too
high (a regimen titled "Save $1000 in 3 months" is fine if it's
clearly a behavioural target rather than a promise). The owner
review queue is the actual safety net.

### 5.5 The moderation queue

`backend/src/admin/moderation.controller.ts` (implementation PR):

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/admin/moderation/queue` | owner | Pending reports + outcome-guarantee flags. |
| POST | `/api/admin/moderation/queue/:id/dismiss` | owner | Dismiss with reason. |
| POST | `/api/admin/moderation/queue/:id/takedown` | owner | Hard-archive the artefact, write audit. |

The schema:

```prisma
enum ModerationKind {
  user_report
  outcome_guarantee
  link_violation
  brand_violation
}

enum ModerationState {
  pending
  dismissed
  actioned
}

model ModerationItem {
  id            String   @id @default(uuid())
  kind          ModerationKind
  // Polymorphic ref. Exactly one is set.
  challenge_id  String?
  content_id    String?
  program_id    String?
  message_id    String?
  user_id       String?  // for avatar takedowns
  reporter_id   String?  // null for system-generated flags
  reason        String?  // user-provided
  detected_text String?  // for outcome_guarantee flags
  state         ModerationState @default(pending)
  resolved_at   DateTime?
  resolved_by   String?
  resolution    String?  // free-text
  created_at    DateTime @default(now())

  @@index([state, created_at])
  @@map("moderation_items")
}
```

## 6. How — implementation pattern

### 6.1 Write-time enforcement

Every coach-authored write surface calls `sanitizeMarkdown` (which
calls `isAllowlistedDomain`) and `flagsOutcomeGuarantee`. The
results inform:

- the row's stored content (sanitised),
- the flag column (if applicable),
- a `ModerationItem` row (if a flag fires).

### 6.2 Read-time enforcement

Every read DTO that carries coach-authored copy runs through the
same sanitiser. The reason: the allowlist may have shrunk between
the write and the read.

### 6.3 Doctrine pin tests

- `test/legal-disclaimer.spec.ts` — the constant is non-empty,
  contains the words "informational purposes only" and "coach",
  and is rendered into every coach-authored DTO.
- `test/legal-url-allowlist.spec.ts` — known financial-product
  domains are NOT in the allowlist (table-driven); known
  educational domains ARE.
- `test/legal-outcome-guarantee.spec.ts` — every trigger fires;
  benign copy does not.
- `test/legal-sanitizer.spec.ts` — sanitiser strips
  non-allowlisted anchor hrefs from markdown; preserves the
  link text.

## 7. Privacy & security

- **Reports do not name balances.** A reporter can describe a
  problem; the report's structured fields don't ingest user
  financial data.
- **Owner moderation reads of coach-client messages** write a
  visible audit trail to a `coach_notes`-style row. The owner is
  not invisible.

## 8. Abuse & moderation — concrete vectors

1. **Coach embeds a Bitly link.** Bitly is not in the allowlist.
   The link is stripped at write time. **Mitigation in place.**
2. **Coach embeds an `irs.gov` link to a misleading page.**
   This passes the allowlist; we do not validate the page
   content. **Mitigation:** moderation queue.
3. **Coach uses a PDF to bypass the allowlist.** PDFs are not
   OCR'd. **Mitigation:** disclaimer is rendered alongside; PDFs
   are reportable.
4. **Coach emails a client off-platform with a product link.**
   Out of platform scope. We do not police off-platform conduct.
5. **Owner under-resources moderation.** Reports pile up. **SLA
   in §10:** owner-acknowledged within 48h, resolved within 7d.

## 9. Feature flags

- Global: `FEATURE_MODERATION_QUEUE_ENABLED`. When false, reports
  are dropped to the concierge inbox (`SUPPORT_CONTACT_EMAIL`)
  and coaches see a passive "compliance flagged: please review"
  notice on flagged rows. When true, the dedicated owner
  moderation surface is live.
- The disclaimer and URL allowlist are **never** flag-gated.

## 10. Analytics

- `compliance.url_stripped` — `{ surface, coach_id }`.
- `compliance.outcome_guarantee_flagged` — `{ surface, coach_id,
  matched_text }`.
- `compliance.report_filed` — `{ surface, reporter_role }`.
- `compliance.takedown` — `{ surface, by_owner_id }`.

The owner dashboard surfaces the moderation queue with median
time-to-resolve as the headline metric. The SLA is:

- **Acknowledge** within 48h (a state change to `pending` →
  `under_review`, even if no action yet).
- **Resolve** within 7d (state → `dismissed` or `actioned`).

The SLA is monitored on the existing system surface
(`/api/system/release-info` extended). A breached SLA emails the
owner.

## 11. Rollout

The compliance machinery is **always on** as soon as any of the
spec modules ship. There is no founders-only / GA rollout for the
disclaimer, the allowlist, or the outcome-guarantee filter — they
ship with the first downstream surface and stay on.

The dedicated moderation queue ships behind `FEATURE_MODERATION_QUEUE_ENABLED`;
prior to that, reports route to the concierge inbox.

## 12. Tests

Listed in §6.3.

## 13. Risks

1. **The allowlist is too narrow.** Coaches request a banking
   regulator's whitepaper hosted on a `.com`. **Response:** add
   via reviewed PR. The PR template asks for compliance sign-off
   on every allowlist addition.
2. **The allowlist is too wide.** Someone PRs a financial-product
   domain ("for educational reasons"). **Response:** the rejection
   list (financial-product domains) is itself a list, and the test
   asserts the rejection list is disjoint from the allowlist. A
   PR adding a financial-product domain to the allowlist also has
   to remove it from the rejection list, which is a flagging
   marker for review.
3. **Outcome-guarantee filter false positives.** Coaches feel
   nagged. **Response:** soft warning, not block. We tune the
   triggers based on the moderation queue activity.
4. **The disclaimer becomes wallpaper.** Users stop reading it.
   **Response:** the disclaimer is a legal mitigation, not a UX
   one. Reading is not the goal; presence is.
5. **A jurisdiction shifts the line.** A state requires
   coach licensing for any "financial coaching". **Response:**
   per-jurisdiction allowlist on coach onboarding — out of scope
   for v1, documented as a known limitation.

## 14. Dependencies

- Every spec module that introduces coach-authored copy
  (challenges, content, regimens, messaging) references this doc
  for the sanitiser, disclaimer, and outcome-guarantee filter.
- The owner moderation surface is an admin module extension.
- `tldts` — new dependency for eTLD+1 parsing.

## 15. Acceptance criteria for the spec PR

- [ ] Compliance reviewer signs off in this spec PR thread.
- [ ] Every downstream spec references this doc by section for
      the disclaimer + URL allowlist + outcome-guarantee filter.
- [ ] The known-financial-product-domain rejection list exists in
      the test fixture so a future allowlist PR cannot quietly
      cross the line.

## 16. Operator handoff

Once the implementation PR ships:

1. Allowlist additions go through a reviewed PR. The PR template
   includes a compliance sign-off checkbox.
2. Outcome-guarantee triggers are tuned based on moderation
   queue throughput. Tuning is a reviewed PR; no live config.
3. Moderation SLA is monitored on the existing system dashboard.
   A breach emails the owner.
4. The owner manages the moderation queue. Concierge inbox
   continues to receive overflow until the dedicated surface is
   live.
