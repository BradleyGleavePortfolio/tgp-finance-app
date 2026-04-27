import { buildReleaseInfo } from '../src/system/release-info';

describe('buildReleaseInfo', () => {
  it('uses Fly-injected env when present', () => {
    const info = buildReleaseInfo({
      FLY_APP_NAME: 'tgp-finance-api',
      FLY_REGION: 'sjc',
      FLY_MACHINE_ID: 'machine-123',
      FLY_RELEASE_VERSION: 'v42',
      NODE_ENV: 'production',
    } as any);

    expect(info.app).toBe('tgp-finance-api');
    expect(info.region).toBe('sjc');
    expect(info.machine_id).toBe('machine-123');
    expect(info.environment).toBe('production');
    expect(info.release_sha).toBe('v42');
    expect(info.node_version).toBe(process.version);
    expect(typeof info.started_at).toBe('string');
    expect(() => new Date(info.started_at).toISOString()).not.toThrow();
  });

  it('prefers explicit RELEASE_SHA over the Fly fallback', () => {
    const info = buildReleaseInfo({
      RELEASE_SHA: 'deadbeef',
      FLY_RELEASE_VERSION: 'v42',
    } as any);
    expect(info.release_sha).toBe('deadbeef');
  });

  it('defaults missing fields to safe values', () => {
    const info = buildReleaseInfo({} as any);
    expect(info.app).toBe('tgp-finance-api');
    expect(info.region).toBeNull();
    expect(info.machine_id).toBeNull();
    expect(info.release_sha).toBeNull();
    expect(info.release_name).toBeNull();
    expect(info.environment).toBe('development');
    expect(typeof info.version).toBe('string');
  });

  it('never returns a secret-shaped value', () => {
    const info = buildReleaseInfo({
      DATABASE_URL: 'postgres://user:pw@host/db',
      JWT_SECRET: 's3cr3t',
      SUPABASE_SERVICE_ROLE_KEY: 'srk',
    } as any);
    const flat = JSON.stringify(info);
    expect(flat).not.toMatch(/postgres:\/\//);
    expect(flat).not.toMatch(/s3cr3t/);
    expect(flat).not.toMatch(/srk/);
  });
});
