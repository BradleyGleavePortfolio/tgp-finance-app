// Sprint A audit fix CR-2 — pure helper extracted from
// mobile/app/auth/reset-password.tsx so unit tests can import it
// without dragging React Native / expo-router into the test runtime.
//
// Supabase's password-recovery email lands the user back on the app
// via `tgp-finance://auth/reset-password#access_token=...&
// refresh_token=...&type=recovery&...`. We need both tokens plus the
// `type=recovery` marker before we trust the URL.

export interface RecoveryTokens {
  access_token: string;
  refresh_token: string;
}

/**
 * Parse a Supabase recovery URL fragment.
 *
 * Returns `null` when the fragment is missing, the `type` param is not
 * `recovery`, or either token is missing. Pure; no side effects.
 */
export function parseRecoveryFragment(
  url: string | null | undefined,
): RecoveryTokens | null {
  if (!url) return null;
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  const fragment = url.slice(hashIndex + 1);
  const params = new URLSearchParams(fragment);
  const type = params.get('type');
  if (type !== 'recovery') return null;
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}
