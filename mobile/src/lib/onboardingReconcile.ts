/**
 * Reconcile local onboarding state with the backend profile.
 *
 * Called once after the auth bootstrap completes. The quiz writes the
 * `quiz_answers` AsyncStorage payload before POSTing — if the POST failed
 * (flaky network on the celebration screen, server 5xx, anything), the
 * local copy is the only record. This module retries the POST when:
 *
 *   - the backend reports `onboarding_complete === false` (or no profile
 *     row at all), AND
 *   - we still have a parseable `quiz_answers` payload locally.
 *
 * Mirrors the fitness `finalizeLeanOnboarding` reconciler. Idempotent on
 * the backend side because `submitQuiz` upserts the profile row.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { onboardingApi } from '../services/api';
import type { SubmitQuizAnswers } from '../types/onboarding';

const QUIZ_ANSWERS_KEY = 'quiz_answers';

/** Allowed `risk_tolerance` strings on the wire. Defensive parser only. */
const RISK_VALUES: SubmitQuizAnswers['risk_tolerance'][] = [
  'Conservative',
  'Moderate',
  'Aggressive',
];

/** Allowed `investment_horizon` strings on the wire. */
const HORIZON_VALUES: SubmitQuizAnswers['investment_horizon'][] = [
  'Less than 1 year',
  '1-3 years',
  '3-5 years',
  '5+ years',
];

/** Allowed `income_range` strings on the wire. */
const INCOME_VALUES: SubmitQuizAnswers['income_range'][] = [
  'Under $50k',
  '$50k-$100k',
  '$100k-$200k',
  '$200k+',
];

/** Allowed `financial_goal` strings on the wire. */
const GOAL_VALUES: SubmitQuizAnswers['financial_goal'][] = [
  'debt payoff',
  'save more',
  'build wealth',
];

function isOneOf<T extends string>(value: unknown, allowed: T[]): value is T {
  return typeof value === 'string' && (allowed as string[]).includes(value);
}

/**
 * Parse the AsyncStorage blob back into a typed `SubmitQuizAnswers`.
 * Returns `null` when the blob is absent, malformed, or the legacy
 * `{ skipped: 'true' }` shape from before Stage-1 (those rows already
 * landed on the backend via a separate path; do not retry them).
 */
function parseStoredAnswers(raw: string | null): SubmitQuizAnswers | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  // Legacy skip blob — `{ skipped: 'true' }` (string). Stage-0. We can't
  // recover the user's actual answers from this; return null so we don't
  // post `SKIP_DEFAULTS` over their real choices.
  if (typeof obj.skipped === 'string') return null;

  if (
    !isOneOf(obj.risk_tolerance, RISK_VALUES) ||
    !isOneOf(obj.investment_horizon, HORIZON_VALUES) ||
    !isOneOf(obj.income_range, INCOME_VALUES) ||
    !isOneOf(obj.financial_goal, GOAL_VALUES)
  ) {
    return null;
  }

  const out: SubmitQuizAnswers = {
    risk_tolerance: obj.risk_tolerance,
    investment_horizon: obj.investment_horizon,
    income_range: obj.income_range,
    financial_goal: obj.financial_goal,
  };
  if (typeof obj.monthly_take_home === 'string') out.monthly_take_home = obj.monthly_take_home;
  if (typeof obj.monthly_dream_cost === 'string') out.monthly_dream_cost = obj.monthly_dream_cost;
  if (typeof obj.dream_description === 'string') out.dream_description = obj.dream_description;
  if (typeof obj.future_self_letter === 'string') out.future_self_letter = obj.future_self_letter;
  if (obj.bank_connected === 'yes' || obj.bank_connected === 'no') {
    out.bank_connected = obj.bank_connected;
  }
  if (obj.skipped === true) out.skipped = true;
  return out;
}

interface ReconcileInput {
  /** From `/api/onboarding/status` or `useAuthStore.profile?.onboarding_complete`. */
  backendOnboardingComplete: boolean;
}

interface ReconcileResult {
  /** True when we re-POSTed and should refresh user state. */
  resubmitted: boolean;
  /** Reason for skipping the resubmit. Useful for logs/telemetry. */
  reason?: 'backend_already_complete' | 'no_local_answers' | 'submit_failed';
}

/**
 * Pure-ish reconciler. Reads AsyncStorage, conditionally POSTs, and
 * returns a result describing what happened. Caller is responsible for
 * `refreshUser()` when `resubmitted === true`.
 */
export async function reconcileOnboarding(
  input: ReconcileInput,
): Promise<ReconcileResult> {
  if (input.backendOnboardingComplete) {
    return { resubmitted: false, reason: 'backend_already_complete' };
  }

  let storedRaw: string | null = null;
  try {
    storedRaw = await AsyncStorage.getItem(QUIZ_ANSWERS_KEY);
  } catch {
    return { resubmitted: false, reason: 'no_local_answers' };
  }

  const answers = parseStoredAnswers(storedRaw);
  if (!answers) {
    return { resubmitted: false, reason: 'no_local_answers' };
  }

  try {
    await onboardingApi.submitQuiz(answers);
    return { resubmitted: true };
  } catch {
    return { resubmitted: false, reason: 'submit_failed' };
  }
}
