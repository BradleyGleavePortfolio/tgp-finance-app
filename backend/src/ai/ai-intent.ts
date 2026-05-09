// Single source of truth for the AI intent enum used across the rate limiter,
// the circuit breaker, the response cache, and the static fallbacks. Kept in
// its own tiny module so importing the type does not pull in heavy services.
//
// Mirrors AIRateLimitService.AIEndpoint by design — they are the same set of
// chargeable upstream calls. We don't share a single symbol because the rate
// limiter shipped first under the `AIEndpoint` name and renaming it would
// touch unrelated tests; AIIntent is the forward name for everything new.

export type AIIntent = 'chat' | 'eod_insight' | 'spending_dna';

export const AI_INTENTS: readonly AIIntent[] = ['chat', 'eod_insight', 'spending_dna'] as const;
