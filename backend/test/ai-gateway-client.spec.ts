import {
  AIGatewayClient,
  digestContext,
  type GatewayTransport,
} from '../src/ai-gateway/gateway-client';
import {
  type GatewayDraftRequest,
} from '../src/ai-gateway/gateway-contracts';
import { type AIGatewayConfig } from '../src/ai-gateway/gateway-config';

const validRequest = (): GatewayDraftRequest => ({
  draft_kind: 'eod_insight',
  context: {
    user_id: '11111111-2222-3333-4444-555555555555',
    coach_id: null,
    currency: 'USD',
    entries: [
      {
        label: 'Net worth (signed off)',
        display: '$42,500.00',
        provenance: {
          source: 'coach_entered',
          band: 'authoritative',
          occurred_at: '2026-04-15',
          correlation_id: 'corr-abc',
        },
      },
    ],
    counters: {
      proof_authoritative_count: 1,
      proof_pending_count: 0,
      proof_non_authoritative_count: 0,
      eod_days_logged_30d: 22,
      habits_completed_7d: 18,
    },
  },
  idempotency_key: 'eod-2026-04-15-user-1111',
});

const enabled = (): AIGatewayConfig => ({
  enabled: true,
  mode: 'shadow',
  model_id: 'tgp-brain-v0',
  prompt_version: 'p-1',
  reason: 'ok',
  guardrails: {
    outputs_are_drafts: true,
    cannot_mutate_proof: true,
    cannot_mutate_money: true,
    cannot_sign_off: true,
    no_individual_securities: true,
    no_personalised_tax_advice: true,
  },
});

const disabled = (): AIGatewayConfig => ({
  enabled: false,
  mode: 'disabled',
  model_id: null,
  prompt_version: null,
  reason: 'gateway off',
  guardrails: enabled().guardrails,
});

describe('AIGatewayClient — fail-closed envelope', () => {
  it('returns unavailable when config is disabled, regardless of transport', async () => {
    const transport: GatewayTransport = {
      generate: async () => 'should not be called',
    };
    const client = new AIGatewayClient(transport, () => disabled());
    const out = await client.draft(validRequest());
    expect(out.status).toBe('unavailable');
    expect(out.draft_text).toBeNull();
    expect(out.reason).toMatch(/gateway disabled/);
    expect(out.audit.gateway_mode).toBe('disabled');
    expect(out.audit.idempotency_key).toBe(validRequest().idempotency_key);
  });

  it('returns unavailable when enabled but no transport is wired', async () => {
    const client = new AIGatewayClient(null, () => enabled());
    const out = await client.draft(validRequest());
    expect(out.status).toBe('unavailable');
    expect(out.reason).toMatch(/no transport wired/);
    expect(out.audit.model_id).toBe('tgp-brain-v0');
    expect(out.audit.prompt_version).toBe('p-1');
  });

  it('returns draft_generated when transport produces text', async () => {
    const transport: GatewayTransport = {
      generate: async () => 'Trend is up 1.2% over the last week.',
    };
    const client = new AIGatewayClient(transport, () => enabled());
    const out = await client.draft(validRequest());
    expect(out.status).toBe('draft_generated');
    expect(out.draft_text).toBe('Trend is up 1.2% over the last week.');
    expect(out.audit.context_digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns unavailable when the transport throws', async () => {
    const transport: GatewayTransport = {
      generate: async () => {
        throw new Error('upstream 503');
      },
    };
    const client = new AIGatewayClient(transport, () => enabled());
    const out = await client.draft(validRequest());
    expect(out.status).toBe('unavailable');
    expect(out.reason).toMatch(/transport error/);
  });

  it('returns unavailable when the transport returns empty/whitespace', async () => {
    const transport: GatewayTransport = {
      generate: async () => '   ',
    };
    const client = new AIGatewayClient(transport, () => enabled());
    const out = await client.draft(validRequest());
    expect(out.status).toBe('unavailable');
    expect(out.reason).toMatch(/empty draft/);
  });

  it('throws on invalid request input (programmer error, not envelope)', async () => {
    const client = new AIGatewayClient(null, () => enabled());
    const bad = { ...validRequest(), draft_kind: 'free_form_chat' as any };
    await expect(client.draft(bad)).rejects.toBeTruthy();
  });

  it('echoes idempotency_key into the audit envelope on every path', async () => {
    const cases: GatewayTransport[] = [
      { generate: async () => 'ok' },
      { generate: async () => '' },
      {
        generate: async () => {
          throw new Error('boom');
        },
      },
    ];
    for (const t of cases) {
      const client = new AIGatewayClient(t, () => enabled());
      const out = await client.draft(validRequest());
      expect(out.audit.idempotency_key).toBe(validRequest().idempotency_key);
    }
  });
});

describe('digestContext', () => {
  it('produces a 64-char sha256 hex string', () => {
    expect(digestContext(validRequest())).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is stable across identical contexts', () => {
    expect(digestContext(validRequest())).toBe(digestContext(validRequest()));
  });

  it('changes when context content changes', () => {
    const a = digestContext(validRequest());
    const r = validRequest();
    r.context.counters.eod_days_logged_30d = 23;
    const b = digestContext(r);
    expect(a).not.toBe(b);
  });

  it('does not depend on idempotency_key (only the context)', () => {
    const a = digestContext(validRequest());
    const r = validRequest();
    r.idempotency_key = 'something-else-but-same-context';
    const b = digestContext(r);
    expect(a).toBe(b);
  });
});
