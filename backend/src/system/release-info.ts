/**
 * Build-time / runtime metadata exposed by GET /system/release-info.
 *
 * Wired up so the mobile app, the coach console, and on-call humans can
 * answer "what's actually running right now?" without shelling into Fly.
 * The values are read from env at boot — Fly injects FLY_REGION,
 * FLY_MACHINE_ID, FLY_APP_NAME, and we set RELEASE_SHA / RELEASE_NAME from
 * the release pipeline (or fall back to git-described build-time values).
 *
 * Nothing here is a secret. The endpoint is intentionally @Public so the
 * mobile splash and the console can poll it before login.
 */

export type ReleaseInfo = {
  app: string;
  version: string;
  release_sha: string | null;
  release_name: string | null;
  region: string | null;
  machine_id: string | null;
  node_version: string;
  environment: string;
  started_at: string;
};

const STARTED_AT = new Date().toISOString();

export function buildReleaseInfo(env: NodeJS.ProcessEnv = process.env): ReleaseInfo {
  return {
    app: env.FLY_APP_NAME || 'tgp-finance-api',
    version: env.npm_package_version || '1.0.0',
    release_sha: env.RELEASE_SHA || env.FLY_RELEASE_VERSION || null,
    release_name: env.RELEASE_NAME || null,
    region: env.FLY_REGION || null,
    machine_id: env.FLY_MACHINE_ID || null,
    node_version: process.version,
    environment: env.NODE_ENV || 'development',
    started_at: STARTED_AT,
  };
}
