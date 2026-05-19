# AI Gateway (seam)

Forward seam for the future TGP Brain. Defines the contracts, fail-closed
config, and a stub client so the rest of the backend can build against the
shape that an LLM call will eventually take, without any LLM call shipping
in this PR.

This is **not** the existing `ai/` module (which proxies the in-app coach
chat to Perplexity). Both will coexist:

- `ai/` — live coach-chat proxy. User-facing, rate-limited, today.
- `ai-gateway/` — provider-neutral seam for proof-aware drafts (EOD
  insight, Spending DNA, coach notes, proof summaries, contradiction
  flags). Stubbed transport in this PR; wiring deferred to a separate PR
  that lands the backend gateway.

## Files

- `gateway-config.ts` — env-driven config resolver. Fail-closed: any
  uncertainty resolves to `enabled = false`. Pinned guardrails are part of
  the resolved config so they cannot be widened by a model swap.
- `gateway-contracts.ts` — Zod schemas for request, response, audit
  metadata, and the finance-safe prompt context (`FinanceSafePromptContext`).
  Caps entry counts, requires pre-formatted display strings (no raw
  Decimals), and tags every datum with provenance + authority band.
- `proof-provenance-export.ts` — read-only DTO any caller can produce
  (without importing the proof module's Prisma types) to flow proof
  authority into a prompt context. Carries opaque `correlation_id` only,
  never internal proof row ids. `bandForStatus` mirrors proof's
  `AUTHORITATIVE_STATUSES` so coach summaries and gateway prompts agree.
- `gateway-client.ts` — `AIGatewayClient` with a `GatewayTransport`
  seam. Default transport is `null` → gateway returns `unavailable`. The
  client never throws on guardrail/config failures; it always emits an
  envelope with audit metadata.
- `index.ts` — public barrel.

## Doctrine

- **Fail-closed config.** Missing `AI_GATEWAY_MODE`, missing model id,
  missing prompt version, or `mode=live` in production without an
  upstream key all collapse to `enabled = false`. Tests cover each path.
- **AI outputs are drafts.** The gateway cannot mutate proof state, money
  fields, or signoff. The only path from a draft to authority is through
  `ProofService.signoff` — a human action recorded in the proof audit
  log. The pinned guardrails in `gateway-config.ts` make this
  machine-checkable.
- **No financial advice.** Prompt versioning is required for shadow/live
  mode so prescriptive-advice regressions can be bisected to a specific
  prompt revision. The proof module's `persistDraft` regex remains the
  enforcement point on the output side.
- **Provenance is mandatory.** Every datum in a `FinanceSafePromptContext`
  carries a `source` and an `band`. Untagged data does not enter a
  prompt — Zod rejects it at the boundary.
- **No raw money in prompts.** Money values are pre-formatted strings in
  the gateway request. The gateway logs the exact text that reached the
  model (via `digestContext`); it never receives Decimals.
- **No internal ids cross the seam.** Proof artifact ids are hashed to
  opaque `correlation_id` values via `correlationIdFor`. Audit logs use
  `idempotency_key` and `context_digest` to correlate across drafts.

## Status

| Surface | State |
|---------|-------|
| Config resolver + pinned guardrails | live, tested |
| Request / response / audit Zod contracts | live, tested |
| Proof provenance export shape + cross-walk | live, tested |
| `AIGatewayClient` envelope behaviour | live, tested |
| `GatewayTransport` implementation | not in this PR — `null` default → `unavailable` envelope |
| Wiring into existing `ai/` module | not in this PR |
| Wiring into proof's `ProofAIService.persistDraft` | not in this PR (proof PR #112 still scaffolds drafts itself) |

## Environment

| Key | Effect |
|-----|--------|
| `AI_GATEWAY_MODE` | `disabled` (default), `shadow`, or `live`. Anything else → disabled. |
| `AI_GATEWAY_MODEL_ID` | Required for `shadow`/`live`. Free-form id; logged in audit. |
| `AI_GATEWAY_PROMPT_VERSION` | Required for `shadow`/`live`. Pins the prompt revision in the audit log so prescriptive-advice regressions can be bisected. |
| `AI_GATEWAY_CORRELATION_SALT` | Salt for `correlationIdFor`. Not read by `gateway-config.ts`; callers pass it explicitly to keep the function pure. Rotating the salt resets the audit correlation namespace. |

`PERPLEXITY_API_KEY` is checked for **presence only** when `mode=live`
and `NODE_ENV=production`. The gateway never reads the key value; the
existing `ai/` module owns the upstream SDK.

## What remains blocked on the backend gateway

- A concrete `GatewayTransport` implementation (HTTP client to the future
  Brain endpoint, or wired into the existing Perplexity SDK if the
  product decides to reuse the chat upstream).
- Sentry / rate-limit instrumentation around the transport.
- Wiring `ProofAIService.persistDraft` (PR #112) to call
  `AIGatewayClient.draft` instead of accepting precomputed text.
- Wiring the `ai/` module's `eod-insight` and `spending-dna` paths to
  produce drafts via the gateway so prompt-versioning and provenance
  audit roll up consistently.

## Tests

- `test/ai-gateway-config.spec.ts` — fail-closed coverage on every env path.
- `test/ai-gateway-contracts.spec.ts` — schema validation, refuse-without-text invariant, provenance enforcement.
- `test/ai-gateway-client.spec.ts` — envelope behaviour with no transport, with a stub transport, with a throwing transport, idempotency-key echo, audit digest stability.
- `test/proof-provenance-export.spec.ts` — band cross-walk, correlation id stability, count helpers.
