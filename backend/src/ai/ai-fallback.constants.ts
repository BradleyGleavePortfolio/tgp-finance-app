// Static fallback strings used by AICircuitBreakerService when:
//   1) the breaker is OPEN, AND
//   2) the per-intent server cache has never seen this intent (cold start, or
//      first deploy after the cache table was created).
//
// These are the lowest-priority floor — exact-hash hits and "most-recent for
// this intent" both win over them. Voice rules mirror the system prompt in
// ai.service.ts: declarative, no hype, no emoji, end in a period. They are
// intentionally generic because they cannot use the user's numbers.

import type { AIIntent } from './ai-intent';

export const AI_FALLBACK_RESPONSES: Record<AIIntent, string> = {
  chat:
    'The finance assistant is briefly unavailable. Your data is unaffected. ' +
    'Please retry in a few minutes. The What-If, Spending DNA, and Net Worth ' +
    'screens continue to compute against your figures.',

  eod_insight:
    'End-of-day record saved.',

  spending_dna:
    'Spending DNA report is briefly unavailable. Your end-of-day records ' +
    'are saved and the report will regenerate on the next attempt.',
};

// Identifies a fallback response to consumers (controllers, mobile client,
// observability). Exposed as the `model` field on the breaker's response so
// the existing { reply, model } shape stays compatible.
export const AI_FALLBACK_MODEL = 'fallback';
