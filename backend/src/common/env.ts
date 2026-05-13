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

// Heuristics that flag a value as a leftover .env.example placeholder rather
// than a real secret. Ported from the fitness backend pattern. If any of
// these substrings shows up in a REQUIRED secret in production, the boot
// path aborts — a partially-filled deploy is worse than no deploy at all.
const PLACEHOLDER_NEEDLES = [
  'your-',
  'YOUR_',
  'change-me',
  'CHANGE_ME',
  'changeme',
  'CHANGEME',
  'placeholder',
  'PLACEHOLDER',
  'example.com',
  'todo',
  'TODO',
  'xxxxxxxx',
  'XXXXXXXX',
];

function looksLikePlaceholder(value: string): boolean {
  if (!value) return false;
  return PLACEHOLDER_NEEDLES.some((needle) => value.includes(needle));
}

export type EnvCheckResult = {
  ok: boolean;
  missing: string[];
  warnings: string[];
  placeholders: string[];
};

/**
 * Pure check — returns the result instead of throwing. Used by the standalone
 * script and unit tests so we can assert on the shape.
 */
export function checkRequiredEnv(env: NodeJS.ProcessEnv = process.env): EnvCheckResult {
  const missing = REQUIRED_ENV_VARS.filter((k) => !env[k]);
  const warnings: string[] = [];
  const placeholders: string[] = [];

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

  // Placeholder sweep over required env vars + the OPTIONAL-but-load-bearing
  // ones (CORS, federation, signup secret). A value that still contains
  // "your-supabase-url" or "CHANGE_ME" almost certainly came straight from
  // .env.example; in production we treat that as fatal.
  const sensitiveOptional = [
    'CORS_ORIGINS',
    'COACH_SIGNUP_SECRET',
    'COACH_ACCESS_CODE',
    'FEDERATION_SERVICE_TOKEN',
    'SUPABASE_ANON_KEY',
    'POSTHOG_KEY',
    'SENTRY_DSN',
  ];
  const allCheck = [...REQUIRED_ENV_VARS, ...sensitiveOptional];
  for (const key of allCheck) {
    const value = env[key];
    if (typeof value === 'string' && looksLikePlaceholder(value)) {
      placeholders.push(key);
    }
  }

  // In production a detected placeholder is fatal (escalated to a warning
  // tagged 'not permitted' so assertRequiredEnv throws). In dev we surface
  // it but don't block boot.
  if (env.NODE_ENV === 'production' && placeholders.length > 0) {
    warnings.push(
      `Placeholder values detected (not permitted in production): ${placeholders.join(', ')}`,
    );
  } else if (placeholders.length > 0) {
    warnings.push(
      `Placeholder values detected (dev mode — non-fatal): ${placeholders.join(', ')}`,
    );
  }

  return {
    ok: missing.length === 0 && warnings.every((w) => !w.includes('not permitted')),
    missing,
    warnings,
    placeholders,
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
