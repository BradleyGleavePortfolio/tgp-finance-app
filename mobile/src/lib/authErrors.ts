// Shared helper for translating raw auth/OAuth backend errors into user-safe
// copy. Supabase, NestJS, and Google OAuth all emit messages that are useful
// to a developer (`Invalid JWT`, `redirect_uri_mismatch`, `Provider not enabled`)
// and meaningless or alarming to a user. This module centralises that mapping
// so login.tsx, register.tsx, and authStore agree on the wording.
//
// Voice rules (mobile/DESIGN.md §5):
// - one short sentence, ending in a period
// - no jargon, no apology hedging, no exclamation marks
// - no "we're working on it" / "for now" / "please try again later"

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_unverified'
  | 'rate_limited'
  | 'oauth_cancelled'
  | 'oauth_unconfigured'
  | 'oauth_failed'
  | 'network'
  | 'server'
  | 'unknown';

const SAFE_COPY: Record<AuthErrorKind, string> = {
  invalid_credentials:
    'That email and password do not match an account.',
  email_unverified:
    'This email is not yet verified. Check your inbox for the link.',
  rate_limited:
    'Too many attempts. Wait a moment and try again.',
  oauth_cancelled:
    'Sign-in was cancelled.',
  oauth_unconfigured:
    'Google sign-in is not available on this build.',
  oauth_failed:
    'Google sign-in did not complete.',
  network:
    'No connection. Check your network and try again.',
  server:
    'The service is unavailable for a moment. Try again shortly.',
  unknown:
    'Sign-in did not complete.',
};

const RAW_PATTERNS: Array<[RegExp, AuthErrorKind]> = [
  [/invalid\s*login/i, 'invalid_credentials'],
  [/invalid.*credential/i, 'invalid_credentials'],
  [/wrong.*password/i, 'invalid_credentials'],
  [/incorrect.*password/i, 'invalid_credentials'],
  [/user.*not.*found/i, 'invalid_credentials'],
  [/email.*not.*confirmed/i, 'email_unverified'],
  [/email.*not.*verified/i, 'email_unverified'],
  [/email.*verification/i, 'email_unverified'],
  [/rate.*limit/i, 'rate_limited'],
  [/too\s*many/i, 'rate_limited'],
  [/cancel/i, 'oauth_cancelled'],
  [/dismiss/i, 'oauth_cancelled'],
  [/provider.*not.*enabled/i, 'oauth_unconfigured'],
  [/oauth.*not.*configured/i, 'oauth_unconfigured'],
  [/oauth.*disabled/i, 'oauth_unconfigured'],
  [/redirect_uri/i, 'oauth_unconfigured'],
  [/google\s*sign[- ]?in/i, 'oauth_failed'],
  [/oauth/i, 'oauth_failed'],
  [/network/i, 'network'],
  [/timeout/i, 'network'],
  [/timed?\s*out/i, 'network'],
  [/connection/i, 'network'],
  [/5\d\d/i, 'server'],
];

export function classifyAuthError(rawMessage: unknown): AuthErrorKind {
  if (!rawMessage) return 'unknown';
  const text = String(rawMessage);
  for (const [pattern, kind] of RAW_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return 'unknown';
}

export function safeAuthErrorMessage(rawMessage: unknown): string {
  return SAFE_COPY[classifyAuthError(rawMessage)];
}

export function extractAuthErrorRaw(error: any): string {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    ''
  );
}

export function safeAuthError(error: any): string {
  return safeAuthErrorMessage(extractAuthErrorRaw(error));
}
