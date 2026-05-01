// Wire contracts for the AI Gateway seam.
//
// These are the only shapes that cross the seam between the rest of the
// backend and a future LLM call. Both sides — the caller building a
// request, and the eventual transport that emits a draft — must agree on
// these schemas. The schemas are deliberately minimal so they can outlive
// any specific provider.
//
// Nothing in this file performs IO, calls a model, or touches the DB. The
// gateway client (gateway-client.ts) consumes these and is the only place
// that would reach an upstream.

import { z } from 'zod';

// Draft kinds the gateway is permitted to author. Mirrors the human-review
// surfaces the proof runtime exposes today; expanding this list is a
// deliberate doctrinal decision and requires a code change here, not just
// a config change.
export const DRAFT_KINDS = [
  'eod_insight',
  'spending_dna_paragraph',
  'coach_note_draft',
  'proof_summary_draft',
  'contradiction_flag_draft',
] as const;

export type DraftKind = (typeof DRAFT_KINDS)[number];

// Provenance source for any datum included in a prompt context. Aligned
// with the proof module's `ProofSource` enum so a future cross-walk can
// merge cleanly without rewriting the prompt builder.
export const PROVENANCE_SOURCES = [
  'user_upload',
  'app_derived',
  'coach_entered',
  'admin_entered',
  'external_link',
  'self_report', // user-attested, no document — separate from proof's ProofSource
] as const;

export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

// Authority bands that can be carried into a prompt context without
// disclosing internal proof IDs. The gateway never sees the row id of a
// proof artifact — only the bucket the row falls into. This keeps prompt
// material safe to log and re-use in shadow mode.
export const AUTHORITY_BANDS = [
  'authoritative', // coach_signed_off OR admin_reviewed
  'pending', // pending_review
  'non_authoritative', // coach_rejected, disputed, flagged_abuse, stale, superseded
] as const;

export type AuthorityBand = (typeof AUTHORITY_BANDS)[number];

// A single provenance-tagged datum. The gateway treats unknown shapes as
// fatal: anything that crosses the seam must be tagged with a source and
// band, or it does not enter the prompt.
export const ProvenanceTagSchema = z
  .object({
    source: z.enum(PROVENANCE_SOURCES),
    band: z.enum(AUTHORITY_BANDS),
    occurred_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'occurred_at must be YYYY-MM-DD'),
    // Stable opaque identifier — NOT a database id. Used so the gateway
    // can dedupe across consecutive turns and so audit logs can correlate
    // a draft back to the inputs without exposing internal pks.
    correlation_id: z.string().min(1).max(64),
  })
  .strict();

export type ProvenanceTag = z.infer<typeof ProvenanceTagSchema>;

// A finance-safe context entry: a number or short string with a
// human-readable label, tagged with provenance. No raw row dumps; no PII;
// money values are pre-formatted strings so the prompt cannot accidentally
// be parsed as a write directive.
export const FinanceContextEntrySchema = z
  .object({
    label: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9 _\-/().,:%$]+$/, 'label has unexpected characters'),
    // Pre-formatted display value. The gateway never receives Decimals or
    // raw numbers for money fields — the caller renders them. This makes
    // the prompt cache-friendly and lets the gateway log the exact text
    // that reached the model.
    display: z.string().min(1).max(240),
    provenance: ProvenanceTagSchema,
  })
  .strict();

export type FinanceContextEntry = z.infer<typeof FinanceContextEntrySchema>;

// The full prompt context envelope. Stays small on purpose — we cap entry
// counts to keep the prompt window predictable and to keep cache-key churn
// low. If a caller needs more, it should aggregate first.
export const FinanceSafePromptContextSchema = z
  .object({
    user_id: z.string().uuid(),
    coach_id: z.string().uuid().nullable(),
    // ISO 4217 currency string the entries are expressed in. Multi-currency
    // mixing is rejected at the boundary; a future multi-currency context
    // is a separate schema and a separate model call.
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'currency must be ISO 4217 (3 uppercase letters)'),
    entries: z.array(FinanceContextEntrySchema).max(64),
    // Coarse counters — no row dumps. Kept here, not in entries, so the
    // model sees adherence/coverage signal even when individual entries
    // are pruned for size.
    counters: z
      .object({
        proof_authoritative_count: z.number().int().nonnegative(),
        proof_pending_count: z.number().int().nonnegative(),
        proof_non_authoritative_count: z.number().int().nonnegative(),
        eod_days_logged_30d: z.number().int().min(0).max(31),
        habits_completed_7d: z.number().int().min(0).max(7 * 32),
      })
      .strict(),
  })
  .strict();

export type FinanceSafePromptContext = z.infer<
  typeof FinanceSafePromptContextSchema
>;

// Inbound gateway request. The gateway never accepts a free-form prompt;
// the caller picks a draft_kind and supplies a context. The system prompt
// is selected server-side from the prompt_version pinned on the gateway
// config, never from this body.
export const GatewayDraftRequestSchema = z
  .object({
    draft_kind: z.enum(DRAFT_KINDS),
    context: FinanceSafePromptContextSchema,
    // Idempotency key. Two requests with the same key return the same
    // draft (or the same refusal) without re-billing the upstream call.
    idempotency_key: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9_\-:.]+$/, 'idempotency_key must be url-safe'),
    // Optional caller note for the audit log. Never sent to the model.
    caller_note: z.string().max(500).optional(),
  })
  .strict();

export type GatewayDraftRequest = z.infer<typeof GatewayDraftRequestSchema>;

// Outbound draft response. The gateway always returns an envelope, even
// when the gateway is disabled — the caller branches on `status`.
//
// Status `unavailable` is used both for the disabled-gateway case and for
// transient upstream failures; the `reason` distinguishes them. Callers
// must treat `unavailable` as a non-fatal degradation (e.g. EOD insight
// returns null) — never as authority.
export const DraftResponseStatus = z.enum([
  'draft_generated',
  'refused_guardrail',
  'unavailable',
]);
export type DraftResponseStatusT = z.infer<typeof DraftResponseStatus>;

// Mirrored against AI_GATEWAY_MODES in gateway-config.ts. Restated here
// to avoid a config↔contracts import cycle if the config later gains its
// own Zod surface.
const AI_GATEWAY_MODES_TUPLE = ['disabled', 'shadow', 'live'] as const;

// Audit metadata emitted alongside every draft. Field names align with
// the proof audit log shape: a future merge can write rows directly from
// this envelope without a translator.
export const DraftAuditMetaSchema = z
  .object({
    model_id: z.string().nullable(),
    prompt_version: z.string().nullable(),
    gateway_mode: z.enum(AI_GATEWAY_MODES_TUPLE),
    idempotency_key: z.string(),
    created_at: z.string().datetime(),
    // Hash of the context payload, NOT the payload itself. Lets the audit
    // log prove a draft was produced from a specific context without
    // storing PII or money values redundantly.
    context_digest: z
      .string()
      .regex(/^[a-f0-9]{64}$/, 'context_digest must be sha256 hex'),
  })
  .strict();

export type DraftAuditMeta = z.infer<typeof DraftAuditMetaSchema>;

export const GatewayDraftResponseSchema = z
  .object({
    status: DraftResponseStatus,
    // Plain text. The proof module's persistDraft is responsible for
    // running the prescriptive-advice regex on this string — the gateway
    // does not duplicate that check, but it MUST refuse to return text
    // when status != 'draft_generated'.
    draft_text: z.string().nullable(),
    reason: z.string().min(1).max(500),
    audit: DraftAuditMetaSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.status === 'draft_generated' && !data.draft_text) {
      ctx.addIssue({
        path: ['draft_text'],
        code: z.ZodIssueCode.custom,
        message: 'draft_text required when status=draft_generated',
      });
    }
    if (data.status !== 'draft_generated' && data.draft_text != null) {
      ctx.addIssue({
        path: ['draft_text'],
        code: z.ZodIssueCode.custom,
        message: `draft_text must be null when status=${data.status}`,
      });
    }
  });

export type GatewayDraftResponse = z.infer<typeof GatewayDraftResponseSchema>;
