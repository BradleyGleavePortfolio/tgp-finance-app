# AI

Backend-side proxy to a hosted LLM provider with a hand-written
finance-coach system prompt and a structured user-context payload. The
mobile client never talks to the upstream provider directly — every
call is authenticated, rate-limited, and hydrated with on-server data.

## Files

- `ai.controller.ts` — `/api/ai/*` routes.
- `ai.service.ts` — chat proxy, EOD insight, monthly Spending DNA
  report, `buildUserContext` (the structured payload exposed both to
  the LLM and to the mobile client via `GET /api/ai/context`).
- `ai.module.ts`.

The upstream client is the `openai` SDK pointed at the provider's
OpenAI-compatible base URL with `model: 'sonar'`. The model and base
URL live as constants in `ai.service.ts` — change them in one place
when swapping providers. Provider choice is informed by per-token
cost and the size of the combined prompt + context payload, which has
to fit comfortably inside the model's window without truncation.

## Endpoints

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/api/ai/chat` | `{ message, conversation_history? }` | The financial-coach chat. Last 10 turns of history are forwarded. Counts against the AI quota. |
| GET | `/api/ai/context` | — | Returns the structured user-context payload (without sending it to the model). Mobile reads this to render context-aware UI. Free. |
| POST | `/api/ai/eod-insight` | `{ eod_submission_id }` | One-sentence insight written to `EODSubmission.ai_insight`. Counts against the AI quota. |
| POST | `/api/ai/spending-dna` | `{ month: 'YYYY-MM' }` | Three-paragraph monthly report; upserted into `SpendingDnaReport`. Counts against the AI quota. |
| GET | `/api/ai/spending-dna/latest` | — | Lightweight `{ month, generated_at }` for the "your report is ready" notification guard. |
| GET | `/api/ai/rate-limit` | — | `{ limit, used, remaining, window_seconds }` for the calling user. Read-only — does not consume a request. |

## Rate limiting

Database-backed sliding window. Implementation lives in
`ai-rate-limit.service.ts`; the underlying table is `ai_request_logs`
(`user_id`, `endpoint`, `created_at`, composite index on
`(user_id, created_at)`). Each call to `chat`, `eod_insight`, or
`spending_dna` writes one row and counts the rows in the last hour for
the calling user; the (limit + 1)th call returns HTTP 429
`RATE_LIMITED` with the user-facing "Reset in N minutes" copy plus a
machine-readable `reset_at` ISO timestamp.

The counter is correct under horizontal scale-out — any web VM can
read and write the table without coordination. A best-effort retention
sweep (capped at one delete per process per minute) prunes rows older
than four windows so the count query stays sub-ms.

The check + insert are intentionally not transactional. Two concurrent
calls at the boundary may both pass and both insert, leaving the user
one over the limit on a single hour. That overage is acceptable; a
SERIALIZABLE transaction would add latency to the hot path on every AI
call to defend a +/- 1 boundary, which is the wrong trade-off for a
coach chat product.

## User context payload (`buildUserContext`)

Used both as the system-prompt context for the LLM and as the mobile
read endpoint for context-aware UI. Shape:

```jsonc
{
  "profile": {
    "name", "monthly_income_gross", "take_home_monthly",
    "primary_goal", "dream_lifestyle_cost_mo",
    "wealth_velocity_score", "streak_days",
    "motivation_style", "city", "state", "country",
    "current_priority_index"
  },
  "financials": {
    "net_worth", "total_assets", "total_debt",
    "total_cash", "monthly_debt_cost"
  },
  "top_debts":  [{ "name", "balance", "apr" }, ...],   // up to 3
  "top_assets": [{ "name", "balance", "type" }, ...],  // up to 3
  "recent_eod": [{ "date", "net_worth", "total_debt", "total_assets", "mood" }, ...],
  "recent_habits": [{ "habit_key", "completed", "days_logged" }, ...],
  "relationship": {
    "role": "student",
    "coach_id": "...",
    "coach_display_name": "..."
  },
  "guardrails": {
    "no_individual_stocks": true,
    "no_early_retirement_withdrawals": true,
    "escalation_resources": ["nfcc.org", "211.org"]
  }
}
```

Notes:

- **Habits are summarized, not dumped.** Raw habit log rows are reduced
  to per-key `{ completed, days_logged }` so the LLM sees adherence
  signal ("checked balances 12/14 days") instead of a row dump. Keeps
  the prompt small and cache-friendly.
- **Coach context is scoped.** Only `coach_id` and a display name
  reach the model — never the coach's email or other PII.
- **Take-home is approximated** at a 22% effective tax rate so the
  LLM has a usable cash-flow figure without us shipping a tax engine.
- **`take_home_monthly` is approximate.** Don't quote it as
  authoritative tax advice; the system prompt already tells the model
  to flag tax answers as general education.
- **Money fields go through `toN`** before any arithmetic — Prisma
  surfaces `Decimal` and `+` without `toN` becomes string concat.
- **Guardrails block** is duplicated in the system prompt; we expose
  it in the JSON too so a future client-side preview can render the
  same list.

## Spending DNA

Monthly per-user report. `POST /api/ai/spending-dna` with
`{ month: 'YYYY-MM' }`:

1. Pull every EOD submission whose `submission_date` falls in the
   month.
2. Compute month deltas (start vs end net worth, average debt/cash,
   estimated savings rate).
3. Call the upstream model with a 3-paragraph template ("how you
   spent / your biggest leak / one high-impact change").
4. Upsert into `spending_dna_reports`, unique on
   `(user_id, month)`.

The mobile app polls `GET /api/ai/spending-dna/latest` to decide
whether to fire the local "Your Spending DNA is ready" notification —
that endpoint deliberately omits the report body to keep the poll
cheap.

## EOD insight

`POST /api/ai/eod-insight` with `{ eod_submission_id }`:

1. Re-fetch the submission *with* `user_id = userId` filter — even
   though the route is JWT-gated, we don't trust the body's id alone.
2. Build the user context.
3. Ask the model for one ≤30-word, forward-looking sentence.
4. Persist via `updateMany` with the same `(id, user_id)` filter, so
   a coincident race or replay can never overwrite another user's
   insight.

## Security & tenancy

- Every method takes `userId` from `request.user`, never from the
  request body. The body's `eod_submission_id` is used to *lookup*
  an EOD that must already belong to the calling user.
- `updateMany` rather than `update` on `ai_insight` is intentional
  belt-and-braces: even if a future bug ever returned a foreign EOD
  from `findFirst`, the `updateMany` filter would still scope the
  write.
- The model itself is given context only for the calling user.
  Coach context relayed to the model is restricted to `coach_id`
  and `coach_display_name`.

## Environment variables

| Key | Effect |
|-----|--------|
| `PERPLEXITY_API_KEY` | Required at boot — `src/main.ts:assertRequiredEnv` refuses to start without it. The variable name reflects the current upstream provider; rename if you swap providers. |

## Failure modes

- **Empty message** → 400 `EMPTY_MESSAGE`.
- **Rate limit** → 429 `RATE_LIMITED` with "Reset in N minutes" copy.
- **Upstream error** → 400 `AI_ERROR` ("temporarily unavailable").
  The original error is logged but not echoed (no upstream stack
  traces leak to the client).
- **EOD insight generation failure** → returns `{ insight: null }`
  rather than throwing, so the EOD submit caller can degrade
  gracefully.
- **Spending DNA on a month with zero EODs** → returns
  `{ error: 'No EOD data found for this month', month }` with HTTP
  200; the mobile UI renders an empty-state.

## Tests

The AI service is mostly an upstream proxy; covering the LLM call is
not useful. The pieces that matter — context shape, rate-limit math,
EOD insight scoping, Spending DNA upsert key — are exercised in
adjacent service specs (the user context shape is asserted in
`coach.service.spec.ts` indirectly via `clientSummary`, and the EOD
write path is in `eod.service.spec.ts`). A direct AI-service spec is
a near-term TODO; if you add one, mock the upstream client and assert
on the system-prompt + message array sent to it.

## Operations

- The system prompt (the `buildFinanceCoachSystemPrompt` function) is
  the prompt we ship to the model — it includes 15 few-shot dialogues
  and the safety rules. Edits to the prompt should be reviewed in code
  review the same way a copy change would be; tone matters.
- Rate limit reset is in-process — restarting the VM resets every
  user's counter to zero. Acceptable today; revisit when scaling out.
- `POST /api/ai/spending-dna` regenerates and overwrites. If you want
  to A/B prompt variants without trampling history, branch on a flag
  and write to a different `month` shape (e.g. `2026-01-experiment`).
- The upstream model is named `sonar` in the SDK config. Provider /
  model swaps happen in `ai.service.ts` — the env var, base URL, and
  model string move together.
