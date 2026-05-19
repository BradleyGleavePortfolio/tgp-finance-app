import {
  GatewayDraftRequestSchema,
  GatewayDraftResponseSchema,
  FinanceSafePromptContextSchema,
  ProvenanceTagSchema,
  FinanceContextEntrySchema,
  DRAFT_KINDS,
  AUTHORITY_BANDS,
  PROVENANCE_SOURCES,
} from '../src/ai-gateway/gateway-contracts';

const validProvenance = () => ({
  source: 'coach_entered' as const,
  band: 'authoritative' as const,
  occurred_at: '2026-04-15',
  correlation_id: 'corr-abc-123',
});

const validEntry = () => ({
  label: 'Net worth (signed off)',
  display: '$42,500.00',
  provenance: validProvenance(),
});

const validContext = () => ({
  user_id: '11111111-2222-3333-4444-555555555555',
  coach_id: '66666666-7777-8888-9999-000000000000',
  currency: 'USD',
  entries: [validEntry()],
  counters: {
    proof_authoritative_count: 3,
    proof_pending_count: 1,
    proof_non_authoritative_count: 0,
    eod_days_logged_30d: 22,
    habits_completed_7d: 18,
  },
});

const validRequest = () => ({
  draft_kind: 'eod_insight' as const,
  context: validContext(),
  idempotency_key: 'eod-2026-04-15-user-1111',
});

describe('ProvenanceTagSchema', () => {
  it('accepts a fully-formed tag', () => {
    expect(ProvenanceTagSchema.parse(validProvenance())).toBeTruthy();
  });

  it('rejects an unknown source', () => {
    const r = ProvenanceTagSchema.safeParse({
      ...validProvenance(),
      source: 'fabricated',
    });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown authority band', () => {
    const r = ProvenanceTagSchema.safeParse({
      ...validProvenance(),
      band: 'gold_standard',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a non-ISO occurred_at', () => {
    const r = ProvenanceTagSchema.safeParse({
      ...validProvenance(),
      occurred_at: '2026/04/15',
    });
    expect(r.success).toBe(false);
  });

  it('rejects extra keys (strict)', () => {
    const r = ProvenanceTagSchema.safeParse({
      ...validProvenance(),
      sneak: 'in',
    });
    expect(r.success).toBe(false);
  });

  it('exposes a stable AUTHORITY_BANDS list', () => {
    expect([...AUTHORITY_BANDS].sort()).toEqual(
      ['authoritative', 'non_authoritative', 'pending'].sort(),
    );
  });

  it('exposes a stable PROVENANCE_SOURCES list (proof-aligned + self_report)', () => {
    expect(PROVENANCE_SOURCES).toContain('coach_entered');
    expect(PROVENANCE_SOURCES).toContain('self_report');
  });
});

describe('FinanceContextEntrySchema', () => {
  it('rejects entries with disallowed characters in label', () => {
    const r = FinanceContextEntrySchema.safeParse({
      ...validEntry(),
      label: 'net <script> worth',
    });
    expect(r.success).toBe(false);
  });

  it('rejects entries longer than the display cap', () => {
    const r = FinanceContextEntrySchema.safeParse({
      ...validEntry(),
      display: 'x'.repeat(241),
    });
    expect(r.success).toBe(false);
  });

  it('requires a provenance block (no untagged data crosses the seam)', () => {
    const r = FinanceContextEntrySchema.safeParse({
      label: 'orphan',
      display: '$1.00',
    });
    expect(r.success).toBe(false);
  });
});

describe('FinanceSafePromptContextSchema', () => {
  it('accepts a minimal valid context', () => {
    expect(FinanceSafePromptContextSchema.parse(validContext())).toBeTruthy();
  });

  it('rejects non-ISO currency', () => {
    const r = FinanceSafePromptContextSchema.safeParse({
      ...validContext(),
      currency: 'usd',
    });
    expect(r.success).toBe(false);
  });

  it('caps entries at 64', () => {
    const ctx = validContext();
    ctx.entries = Array.from({ length: 65 }, () => validEntry());
    const r = FinanceSafePromptContextSchema.safeParse(ctx);
    expect(r.success).toBe(false);
  });

  it('rejects negative counters', () => {
    const ctx = validContext();
    ctx.counters.proof_authoritative_count = -1;
    const r = FinanceSafePromptContextSchema.safeParse(ctx);
    expect(r.success).toBe(false);
  });

  it('rejects extra keys at the top level', () => {
    const r = FinanceSafePromptContextSchema.safeParse({
      ...validContext(),
      sneaky: true,
    });
    expect(r.success).toBe(false);
  });

  it('rejects raw numeric money in entries by construction', () => {
    // The schema only accepts `display: string`. A caller passing a number
    // for a money field is a type error in TS; at runtime Zod rejects.
    const r = FinanceContextEntrySchema.safeParse({
      ...validEntry(),
      display: 42500 as unknown as string,
    });
    expect(r.success).toBe(false);
  });
});

describe('GatewayDraftRequestSchema', () => {
  it('accepts a fully-formed request', () => {
    expect(GatewayDraftRequestSchema.parse(validRequest())).toBeTruthy();
  });

  it('rejects an unknown draft_kind', () => {
    const r = GatewayDraftRequestSchema.safeParse({
      ...validRequest(),
      draft_kind: 'free_form_chat',
    });
    expect(r.success).toBe(false);
  });

  it('exposes a stable DRAFT_KINDS list', () => {
    expect(DRAFT_KINDS).toContain('eod_insight');
    expect(DRAFT_KINDS).toContain('proof_summary_draft');
    expect(DRAFT_KINDS).not.toContain('free_form_chat');
  });

  it('rejects a non-url-safe idempotency key', () => {
    const r = GatewayDraftRequestSchema.safeParse({
      ...validRequest(),
      idempotency_key: 'has spaces and / slashes',
    });
    expect(r.success).toBe(false);
  });

  it('caps caller_note', () => {
    const r = GatewayDraftRequestSchema.safeParse({
      ...validRequest(),
      caller_note: 'x'.repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe('GatewayDraftResponseSchema', () => {
  const baseAudit = () => ({
    model_id: 'tgp-brain-v0',
    prompt_version: 'p-1',
    gateway_mode: 'shadow' as const,
    idempotency_key: 'k1',
    created_at: new Date().toISOString(),
    context_digest: 'a'.repeat(64),
  });

  it('accepts draft_generated with non-null text', () => {
    const r = GatewayDraftResponseSchema.parse({
      status: 'draft_generated',
      draft_text: 'Trend is up 1.2% over the last week.',
      reason: 'ok',
      audit: baseAudit(),
    });
    expect(r.status).toBe('draft_generated');
  });

  it('rejects draft_generated with null text', () => {
    const r = GatewayDraftResponseSchema.safeParse({
      status: 'draft_generated',
      draft_text: null,
      reason: 'ok',
      audit: baseAudit(),
    });
    expect(r.success).toBe(false);
  });

  it('rejects refused_guardrail with non-null text', () => {
    const r = GatewayDraftResponseSchema.safeParse({
      status: 'refused_guardrail',
      draft_text: 'Buy AAPL.',
      reason: 'individual security recommendation',
      audit: baseAudit(),
    });
    expect(r.success).toBe(false);
  });

  it('rejects unavailable with non-null text', () => {
    const r = GatewayDraftResponseSchema.safeParse({
      status: 'unavailable',
      draft_text: 'best-effort guess',
      reason: 'gateway disabled',
      audit: baseAudit(),
    });
    expect(r.success).toBe(false);
  });

  it('requires sha256-shaped context_digest in audit', () => {
    const r = GatewayDraftResponseSchema.safeParse({
      status: 'unavailable',
      draft_text: null,
      reason: 'no transport',
      audit: { ...baseAudit(), context_digest: 'short' },
    });
    expect(r.success).toBe(false);
  });
});
