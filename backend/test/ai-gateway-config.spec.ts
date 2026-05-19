import {
  resolveGatewayConfig,
  PINNED_GUARDRAILS,
  AI_GATEWAY_MODES,
} from '../src/ai-gateway/gateway-config';

const baseEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  AI_GATEWAY_MODE: 'shadow',
  AI_GATEWAY_MODEL_ID: 'tgp-brain-v0',
  AI_GATEWAY_PROMPT_VERSION: 'proof-coach-2026-05-01',
  ...overrides,
});

describe('resolveGatewayConfig — fail-closed', () => {
  it('disables when AI_GATEWAY_MODE is unset', () => {
    const cfg = resolveGatewayConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.mode).toBe('disabled');
    expect(cfg.reason).toMatch(/unset or unrecognised/);
  });

  it('disables when AI_GATEWAY_MODE has an unknown value', () => {
    const cfg = resolveGatewayConfig({ AI_GATEWAY_MODE: 'turbo' });
    expect(cfg.enabled).toBe(false);
    expect(cfg.reason).toMatch(/unrecognised/);
  });

  it('explicitly disables when AI_GATEWAY_MODE=disabled', () => {
    const cfg = resolveGatewayConfig({ AI_GATEWAY_MODE: 'disabled' });
    expect(cfg.enabled).toBe(false);
    expect(cfg.mode).toBe('disabled');
  });

  it('disables shadow mode when MODEL_ID is missing', () => {
    const cfg = resolveGatewayConfig({
      AI_GATEWAY_MODE: 'shadow',
      AI_GATEWAY_PROMPT_VERSION: 'v1',
    });
    expect(cfg.enabled).toBe(false);
    expect(cfg.reason).toMatch(/MODEL_ID required/);
  });

  it('disables shadow mode when PROMPT_VERSION is missing', () => {
    const cfg = resolveGatewayConfig({
      AI_GATEWAY_MODE: 'shadow',
      AI_GATEWAY_MODEL_ID: 'foo',
    });
    expect(cfg.enabled).toBe(false);
    expect(cfg.reason).toMatch(/PROMPT_VERSION required/);
  });

  it('treats whitespace-only model id as missing', () => {
    const cfg = resolveGatewayConfig({
      AI_GATEWAY_MODE: 'shadow',
      AI_GATEWAY_MODEL_ID: '   ',
      AI_GATEWAY_PROMPT_VERSION: 'v1',
    });
    expect(cfg.enabled).toBe(false);
  });

  it('disables live mode in production without upstream key', () => {
    const cfg = resolveGatewayConfig(
      baseEnv({
        AI_GATEWAY_MODE: 'live',
        NODE_ENV: 'production',
      }),
    );
    expect(cfg.enabled).toBe(false);
    expect(cfg.reason).toMatch(/PERPLEXITY_API_KEY/);
  });

  it('enables live mode in production with upstream key present', () => {
    const cfg = resolveGatewayConfig(
      baseEnv({
        AI_GATEWAY_MODE: 'live',
        NODE_ENV: 'production',
        PERPLEXITY_API_KEY: 'k',
      }),
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.mode).toBe('live');
    expect(cfg.model_id).toBe('tgp-brain-v0');
    expect(cfg.prompt_version).toBe('proof-coach-2026-05-01');
  });

  it('enables live mode outside production without upstream key (dev override)', () => {
    const cfg = resolveGatewayConfig(
      baseEnv({ AI_GATEWAY_MODE: 'live', NODE_ENV: 'development' }),
    );
    expect(cfg.enabled).toBe(true);
  });

  it('enables shadow mode without upstream key in any environment', () => {
    const cfg = resolveGatewayConfig(baseEnv({ NODE_ENV: 'production' }));
    expect(cfg.enabled).toBe(true);
    expect(cfg.mode).toBe('shadow');
  });

  it('emits frozen pinned guardrails on every resolution', () => {
    const cfg = resolveGatewayConfig({});
    expect(cfg.guardrails).toEqual(PINNED_GUARDRAILS);
    expect(() => {
      // @ts-expect-error — frozen object
      cfg.guardrails.cannot_mutate_money = false;
    }).toThrow();
  });

  it('exposes the full mode allow-list', () => {
    expect([...AI_GATEWAY_MODES].sort()).toEqual(
      ['disabled', 'live', 'shadow'].sort(),
    );
  });

  it('returns a frozen config object', () => {
    const cfg = resolveGatewayConfig(baseEnv());
    expect(() => {
      // @ts-expect-error — frozen object
      cfg.enabled = false;
    }).toThrow();
  });
});
