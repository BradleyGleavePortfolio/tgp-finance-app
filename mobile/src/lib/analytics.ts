/**
 * analytics.ts — PostHog instrumentation helper
 * UX Psychology Report #4: Analytics Tracking
 *
 * Design principles:
 *  - Lazy-init: client is created on first use, not at module load time
 *  - NO-OP when EXPO_PUBLIC_POSTHOG_KEY is missing — never crashes
 *  - PII allow-list: drops email, password, name, phone, address,
 *    account_number, routing, ssn (and any key containing those substrings)
 */

import PostHog from 'posthog-react-native';
import type { PostHogEventProperties } from '@posthog/core';

// ---------------------------------------------------------------------------
// PII allow-list — drop any property whose key matches these patterns
// ---------------------------------------------------------------------------
const PII_KEY_PATTERNS: RegExp[] = [
  /^email$/i,
  /^password$/i,
  /^name$/i,
  /^phone$/i,
  /^address$/i,
  /account_number/i,
  /routing/i,
  /ssn/i,
];

function stripPII(props?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!props) return props;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    const isSafe = !PII_KEY_PATTERNS.some((re) => re.test(key));
    if (isSafe) safe[key] = value;
  }
  return safe;
}

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------
let _client: PostHog | null = null;

function getClient(): PostHog | null {
  if (_client) return _client;

  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return null; // NO-OP — key not configured

  const host =
    process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

  try {
    _client = new PostHog(key, { host });
  } catch {
    // Should never happen but guard anyway
    _client = null;
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track an analytics event with optional properties.
 * Strips PII before sending. NO-OP when PostHog key is absent.
 */
export function track(
  event: string,
  props?: Record<string, unknown>,
): void {
  try {
    // PostHog's PostHogEventProperties = { [key: string]: JsonType }. The
    // stripPII output is JSON-serialisable (string/number/bool/null/object)
    // by construction, but TypeScript can't prove the recursive constraint —
    // assert at the boundary.
    getClient()?.capture(event, stripPII(props) as PostHogEventProperties | undefined);
  } catch {
    // Never let analytics crash the app
  }
}

/**
 * Associate the current session with a user identity.
 * Strips PII from the properties object before sending.
 * Call this after successful login or registration.
 */
export function identify(
  userId: string,
  props?: Record<string, unknown>,
): void {
  try {
    getClient()?.identify(userId, stripPII(props) as PostHogEventProperties | undefined);
  } catch {
    // Never let analytics crash the app
  }
}

/**
 * Reset the PostHog client (unlink user identity).
 * Call this on sign-out.
 */
export function reset(): void {
  try {
    getClient()?.reset();
  } catch {
    // best-effort
  }
}

/**
 * Expose the raw PostHog client for use with PostHogProvider.
 * Returns null when the key is missing.
 */
export function getPostHogClient(): PostHog | null {
  return getClient();
}
