import { Injectable, Logger } from '@nestjs/common';
import { AIResponseCacheService } from './ai-response-cache.service';
import { AI_FALLBACK_RESPONSES, AI_FALLBACK_MODEL } from './ai-fallback.constants';
import { AI_INTENTS, type AIIntent } from './ai-intent';

// Tunables. Exported so tests and admin observability can read the same
// numbers the runtime uses, and so we never end up with a magic number in
// one place and the documented value in another.
export const FAILURE_THRESHOLD = 5;
export const FAILURE_WINDOW_MS = 60 * 1000;
export const OPEN_COOLDOWN_MS = 5 * 60 * 1000;

export type BreakerState = 'closed' | 'open' | 'half_open';

export interface BreakerStatus {
  intent: AIIntent;
  state: BreakerState;
  failures_in_window: number;
  failure_threshold: number;
  failure_window_ms: number;
  open_cooldown_ms: number;
  opened_at: string | null;
  next_probe_at: string | null;
}

export interface BreakerExecuteResult {
  reply: string;
  model: string;
  // 'live' = upstream call succeeded; 'cache_exact' / 'cache_recent' = served
  // from cache while OPEN (or as a HALF_OPEN concurrent caller); 'fallback' =
  // breaker open and cache empty for this intent.
  source: 'live' | 'cache_exact' | 'cache_recent' | 'fallback';
}

interface IntentState {
  state: BreakerState;
  failureTimestamps: number[]; // ring of failure times (ms epoch) within window
  openedAt: number | null;     // when state transitioned to OPEN
  // Set true when a HALF_OPEN probe is in flight, so concurrent callers serve
  // from cache instead of slamming a struggling upstream with parallel probes.
  probeInFlight: boolean;
}

/**
 * AICircuitBreakerService — sliding-window failure breaker for the
 * Perplexity upstream, with cached and static fallbacks.
 *
 * State machine, per intent:
 *
 *   CLOSED ──(N failures in window)──► OPEN ──(cooldown elapsed)──► HALF_OPEN
 *      ▲                                                                │
 *      │                                                                │
 *      └──(probe success)─── HALF_OPEN ──(probe failure)──► OPEN ◄──────┘
 *
 * State is held per-intent (chat / eod_insight / spending_dna) so a flake on
 * one prompt path does not knock out the others. State is in-memory per VM,
 * which is the right trade-off for a fast-twitching breaker — Postgres
 * round-trips on every chat call to read shared state would dominate the
 * upstream latency we are trying to defend against. Acceptable consequence:
 * each Fly VM trips independently. Under traffic that's actually
 * fault-driven, every replica reaches threshold in seconds anyway, and per-
 * replica isolation means a single VM's bad network doesn't open the breaker
 * for healthy peers.
 *
 * Manual override: admins can force OPEN (drill / kill switch) or force
 * CLOSED (after a confirmed upstream recovery) via the admin endpoints
 * declared in admin-ai.controller.ts.
 *
 * The execute() method is the single public surface. Callers wrap their
 * upstream call in:
 *
 *   const { reply, model, source } = await breaker.execute(
 *     'chat',
 *     contextHash,
 *     () => perplexity.chat.completions.create(...),
 *   );
 *
 * On success, the response is asynchronously written to the cache. On
 * failure, the breaker counts it against the window and serves cache or
 * static fallback — the caller never sees the upstream error.
 */
@Injectable()
export class AICircuitBreakerService {
  private readonly logger = new Logger(AICircuitBreakerService.name);
  private readonly states = new Map<AIIntent, IntentState>();

  constructor(private readonly cache: AIResponseCacheService) {
    for (const intent of AI_INTENTS) {
      this.states.set(intent, this.freshState());
    }
  }

  /**
   * Run an upstream call through the breaker. The caller is the Perplexity
   * call site in AIService.
   *
   * Behaviour by state:
   *   CLOSED    — call upstream. On success, cache async, return live.
   *               On failure, count it, possibly trip OPEN, serve cache or
   *               static fallback.
   *   OPEN      — bypass upstream entirely. Serve cache or fallback. After
   *               OPEN_COOLDOWN_MS has elapsed since open, transition to
   *               HALF_OPEN on the next call.
   *   HALF_OPEN — first caller probes upstream. Concurrent callers serve
   *               cache to avoid stampeding the gateway. Probe success →
   *               CLOSED. Probe failure → OPEN.
   */
  async execute<T>(
    intent: AIIntent,
    contextHash: string,
    upstreamCall: () => Promise<{ text: string; model: string; raw?: T }>,
  ): Promise<BreakerExecuteResult> {
    const intentState = this.states.get(intent)!;

    // Lazy transition from OPEN to HALF_OPEN if cooldown has elapsed. We do
    // this on the read path rather than via a timer so the first caller
    // after the cooldown gets to probe — no wasted cycles, no clock-drift
    // surprises during tests.
    this.maybeTransitionToHalfOpen(intent, intentState, Date.now());

    if (intentState.state === 'open') {
      return this.serveFallback(intent, contextHash);
    }

    if (intentState.state === 'half_open') {
      if (intentState.probeInFlight) {
        // Another caller is already probing. Don't dogpile the upstream.
        return this.serveFallback(intent, contextHash);
      }
      intentState.probeInFlight = true;
      try {
        const result = await upstreamCall();
        this.onSuccess(intent, intentState);
        this.cache
          .store(intent, contextHash, result.text, result.model)
          .catch((err) => this.logger.warn(`cache.store failed: ${err?.message ?? err}`));
        return { reply: result.text, model: result.model, source: 'live' };
      } catch (err) {
        this.onFailure(intent, intentState, err);
        return this.serveFallback(intent, contextHash);
      } finally {
        intentState.probeInFlight = false;
      }
    }

    // CLOSED — normal path.
    try {
      const result = await upstreamCall();
      // A single success in CLOSED state isn't a transition; just record it
      // by clearing any stale failures that have aged out.
      this.pruneFailures(intentState, Date.now());
      this.cache
        .store(intent, contextHash, result.text, result.model)
        .catch((err) => this.logger.warn(`cache.store failed: ${err?.message ?? err}`));
      return { reply: result.text, model: result.model, source: 'live' };
    } catch (err) {
      this.onFailure(intent, intentState, err);
      return this.serveFallback(intent, contextHash);
    }
  }

  /**
   * Per-intent state snapshot for /admin/ai/circuit-breaker and /health/deep.
   * Pure read — never mutates state, never triggers transitions.
   */
  status(intent: AIIntent): BreakerStatus {
    const s = this.states.get(intent)!;
    const now = Date.now();
    this.pruneFailures(s, now);
    return {
      intent,
      state: s.state,
      failures_in_window: s.failureTimestamps.length,
      failure_threshold: FAILURE_THRESHOLD,
      failure_window_ms: FAILURE_WINDOW_MS,
      open_cooldown_ms: OPEN_COOLDOWN_MS,
      opened_at: s.openedAt ? new Date(s.openedAt).toISOString() : null,
      next_probe_at:
        s.state === 'open' && s.openedAt
          ? new Date(s.openedAt + OPEN_COOLDOWN_MS).toISOString()
          : null,
    };
  }

  statusAll(): BreakerStatus[] {
    return AI_INTENTS.map((intent) => this.status(intent));
  }

  /** Worst state across all intents — used by /health/deep. */
  worstState(): BreakerState {
    const states = AI_INTENTS.map((i) => this.states.get(i)!.state);
    if (states.includes('open')) return 'open';
    if (states.includes('half_open')) return 'half_open';
    return 'closed';
  }

  /**
   * Force the breaker OPEN for an intent. Used by ops drills and as a kill
   * switch when we know the upstream is bad before five organic failures
   * have accumulated. The cooldown window starts NOW — a manually-tripped
   * breaker recovers via the same HALF_OPEN probe path as an organic trip.
   */
  forceOpen(intent: AIIntent): BreakerStatus {
    const s = this.states.get(intent)!;
    s.state = 'open';
    s.openedAt = Date.now();
    s.probeInFlight = false;
    this.logger.warn(`circuit breaker manually FORCED OPEN for intent=${intent}`);
    return this.status(intent);
  }

  /**
   * Force the breaker CLOSED for an intent. Clears the failure window and
   * cancels any cooldown. Used after a confirmed upstream recovery to skip
   * the HALF_OPEN probe.
   */
  forceClose(intent: AIIntent): BreakerStatus {
    const s = this.states.get(intent)!;
    s.state = 'closed';
    s.failureTimestamps = [];
    s.openedAt = null;
    s.probeInFlight = false;
    this.logger.warn(`circuit breaker manually FORCED CLOSED for intent=${intent}`);
    return this.status(intent);
  }

  // ------------------------------------------------------------------
  // Internal — state transitions
  // ------------------------------------------------------------------

  private freshState(): IntentState {
    return {
      state: 'closed',
      failureTimestamps: [],
      openedAt: null,
      probeInFlight: false,
    };
  }

  private pruneFailures(s: IntentState, now: number): void {
    const cutoff = now - FAILURE_WINDOW_MS;
    // Failure timestamps are appended in order, so once we find a fresh one
    // we're done. This keeps prune O(k) where k is the count of stale
    // entries, not O(n).
    let i = 0;
    while (i < s.failureTimestamps.length && s.failureTimestamps[i] <= cutoff) i++;
    if (i > 0) s.failureTimestamps.splice(0, i);
  }

  private onSuccess(intent: AIIntent, s: IntentState): void {
    if (s.state === 'half_open') {
      this.logger.log(`circuit breaker CLOSED (probe succeeded) for intent=${intent}`);
    }
    s.state = 'closed';
    s.failureTimestamps = [];
    s.openedAt = null;
  }

  private onFailure(intent: AIIntent, s: IntentState, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    const now = Date.now();

    if (s.state === 'half_open') {
      // Probe failed → snap straight back to OPEN, restart the cooldown.
      s.state = 'open';
      s.openedAt = now;
      s.failureTimestamps = [now];
      this.logger.warn(
        `circuit breaker HALF_OPEN probe failed for intent=${intent} \u2014 reopening: ${msg}`,
      );
      return;
    }

    // CLOSED → record the failure, possibly trip.
    s.failureTimestamps.push(now);
    this.pruneFailures(s, now);

    if (s.failureTimestamps.length >= FAILURE_THRESHOLD) {
      s.state = 'open';
      s.openedAt = now;
      this.logger.warn(
        `circuit breaker OPEN for intent=${intent} after ${s.failureTimestamps.length} ` +
          `failures in ${FAILURE_WINDOW_MS}ms: ${msg}`,
      );
    } else {
      this.logger.warn(
        `AI upstream failure ${s.failureTimestamps.length}/${FAILURE_THRESHOLD} for intent=${intent}: ${msg}`,
      );
    }
  }

  private maybeTransitionToHalfOpen(intent: AIIntent, s: IntentState, now: number): void {
    if (s.state !== 'open' || s.openedAt === null) return;
    if (now - s.openedAt < OPEN_COOLDOWN_MS) return;
    s.state = 'half_open';
    s.probeInFlight = false;
    this.logger.log(`circuit breaker HALF_OPEN for intent=${intent} \u2014 next call probes upstream`);
  }

  private async serveFallback(intent: AIIntent, contextHash: string): Promise<BreakerExecuteResult> {
    const cached = await this.cache.lookup(intent, contextHash);
    if (cached) {
      return {
        reply: cached.response_text,
        model: cached.model,
        source: cached.source === 'exact' ? 'cache_exact' : 'cache_recent',
      };
    }
    return {
      reply: AI_FALLBACK_RESPONSES[intent],
      model: AI_FALLBACK_MODEL,
      source: 'fallback',
    };
  }
}
