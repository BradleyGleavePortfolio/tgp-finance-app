/**
 * Centralised env validation. main.ts and the standalone `npm run check:env`
 * script both call into this so console-integration tooling can verify a
 * deployment's secrets without booting the whole Nest app.
 *
 * Keep the required list in sync with what main.ts used to assert inline.
 */

export const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'PERPLEXITY_API_KEY',
] as const;

export type EnvCheckResult = {
  ok: boolean;
  missing: string[];
  warnings: string[];
};

/**
 * Pure check — returns the result instead of throwing. Used by the standalone
 * script and unit tests so we can assert on the shape.
 */
export function checkRequiredEnv(env: NodeJS.ProcessEnv = process.env): EnvCheckResult {
  const missing = REQUIRED_ENV_VARS.filter((k) => !env[k]);
  const warnings: string[] = [];

  // Belt-and-suspenders: never let the dev backdoor escape into production.
  if (env.NODE_ENV === 'production' && env.ENABLE_DEV_BACKDOOR === 'true') {
    warnings.push(
      'ENABLE_DEV_BACKDOOR=true is not permitted when NODE_ENV=production',
    );
  }

  // Soft warnings — non-fatal but worth surfacing in the console output.
  if (env.NODE_ENV === 'production' && !env.CORS_ORIGINS) {
    warnings.push(
      'CORS_ORIGINS unset in production — falling back to localhost-only allowlist',
    );
  }

  return {
    ok: missing.length === 0 && warnings.every((w) => !w.includes('not permitted')),
    missing,
    warnings,
  };
}

/**
 * Throwing variant used at boot. Preserves the exact error shape main.ts
 * already produced so log scrapers don't break.
 */
export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  const result = checkRequiredEnv(env);
  if (result.missing.length) {
    throw new Error(`Missing required env vars: ${result.missing.join(', ')}`);
  }
  const fatal = result.warnings.find((w) => w.includes('not permitted'));
  if (fatal) {
    throw new Error(fatal);
  }
}
