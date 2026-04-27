import { assertRequiredEnv, checkRequiredEnv, REQUIRED_ENV_VARS } from '../src/common/env';

const baseEnv = (): NodeJS.ProcessEnv => {
  const e: any = {};
  for (const k of REQUIRED_ENV_VARS) e[k] = `dummy_${k}`;
  return e;
};

describe('checkRequiredEnv', () => {
  it('returns ok when every required var is set', () => {
    const r = checkRequiredEnv(baseEnv());
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('reports every missing required var, not just the first', () => {
    const env = baseEnv();
    delete env.DATABASE_URL;
    delete env.JWT_SECRET;
    const r = checkRequiredEnv(env);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(['DATABASE_URL', 'JWT_SECRET']));
  });

  it('flags the dev backdoor as a fatal warning under NODE_ENV=production', () => {
    const env = baseEnv();
    env.NODE_ENV = 'production';
    env.ENABLE_DEV_BACKDOOR = 'true';
    const r = checkRequiredEnv(env);
    expect(r.warnings.some((w) => w.includes('not permitted'))).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('warns (non-fatal) when CORS_ORIGINS is unset in production', () => {
    const env = baseEnv();
    env.NODE_ENV = 'production';
    const r = checkRequiredEnv(env);
    expect(r.warnings.some((w) => w.includes('CORS_ORIGINS'))).toBe(true);
    expect(r.ok).toBe(true);
  });
});

describe('assertRequiredEnv', () => {
  it('does not throw on a complete env', () => {
    expect(() => assertRequiredEnv(baseEnv())).not.toThrow();
  });

  it('throws with the legacy "Missing required env vars: ..." prefix on missing vars', () => {
    const env = baseEnv();
    delete env.SUPABASE_URL;
    expect(() => assertRequiredEnv(env)).toThrow(/Missing required env vars: SUPABASE_URL/);
  });

  it('throws on the production dev-backdoor combination', () => {
    const env = baseEnv();
    env.NODE_ENV = 'production';
    env.ENABLE_DEV_BACKDOOR = 'true';
    expect(() => assertRequiredEnv(env)).toThrow(/not permitted/);
  });
});
