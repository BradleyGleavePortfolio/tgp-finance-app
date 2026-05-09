// Sprint A audit fix CR-6 — finance-app -> fitness-app federation
// client. Used by the practice picker to symmetrically mirror the
// coach's choice into the fitness backend so a coach who picks
// 'both' on finance does not still see fitness's cross-pillar nav
// re-prompt them on next open.
//
// Architecture:
//   Both backends accept the same Supabase JWT (same JWKS). We
//   reuse the user's bearer from secureStorage and call the fitness
//   backend's PUT /api/coach/practice route directly. The
//   ?propagate=false query param tells the fitness side not to
//   federate back to finance, breaking the loop. This mirrors PR
//   #187's pattern from the fitness side, where fitness writes
//   locally and posts to finance with the federation guard.
//
// Failure modes:
//   - fitnessApiUrl not configured: returns { kind: 'skipped' }.
//   - HTTP 5xx / network error: returns { kind: 'degraded' }.
//   - HTTP 404 from the fitness side (coach has not registered
//     fitness yet): returns { kind: 'not_found' } and the picker
//     treats it the same way the fitness side treats the inverse —
//     a soft skip, no error to the coach.
//   - HTTP 200: returns { kind: 'ok' }.

import axios from 'axios';
import Constants from 'expo-constants';
import { secureStorage } from '../lib/secureStorage';

const STATIC_FITNESS_API_URL: string | undefined =
  Constants.expoConfig?.extra?.fitnessApiUrl;

const REQUEST_TIMEOUT_MS = 5000;

export type FitnessFederationOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'skipped'; reason: 'not_configured' }
  | { kind: 'degraded'; reason: string };

/**
 * Test-only override slot. Lets the unit test swap the resolved URL
 * without mocking expo-constants. Production calls go through the
 * static value from app.json -> Constants.expoConfig.extra.
 */
let TEST_OVERRIDE_URL: string | undefined | null = null;

export function __setFitnessApiUrlForTests(url: string | undefined): void {
  TEST_OVERRIDE_URL = url ?? undefined;
  TEST_OVERRIDE_SET = true;
}

let TEST_OVERRIDE_SET = false;

/** Resolved at call time so the test override is respected. */
export function __resolvedFitnessApiUrl(): string | undefined {
  return TEST_OVERRIDE_SET ? TEST_OVERRIDE_URL ?? undefined : STATIC_FITNESS_API_URL;
}

/**
 * Mirror the coach's practice-type selection to the fitness backend.
 * Returns a typed outcome rather than throwing — the caller decides
 * which outcomes are user-visible (degraded -> retry banner) vs
 * silent (skipped, not_found).
 */
export async function setFitnessCoachPractice(
  practiceType: 'fitness_only' | 'finance_only' | 'both',
): Promise<FitnessFederationOutcome> {
  const fitnessApiUrl = __resolvedFitnessApiUrl();
  if (!fitnessApiUrl) {
    return { kind: 'skipped', reason: 'not_configured' };
  }
  const token = await secureStorage.getItem('auth_token');
  if (!token) {
    return { kind: 'degraded', reason: 'no_auth_token' };
  }
  try {
    await axios.put(
      `${fitnessApiUrl}/api/coach/practice`,
      { practice_type: practiceType },
      {
        params: { propagate: 'false' },
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return { kind: 'ok' };
  } catch (err) {
    const status =
      (err as { response?: { status?: number } })?.response?.status ?? 0;
    if (status === 404) {
      // Fitness side has no User row for this email yet — soft skip.
      return { kind: 'not_found' };
    }
    if (status === 401 || status === 403) {
      return { kind: 'degraded', reason: 'auth_rejected' };
    }
    if (status >= 500 || status === 0) {
      return { kind: 'degraded', reason: status === 0 ? 'network_error' : 'server_error' };
    }
    return { kind: 'degraded', reason: `http_${status}` };
  }
}
