import {
  AICircuitBreakerService,
  FAILURE_THRESHOLD,
  FAILURE_WINDOW_MS,
  OPEN_COOLDOWN_MS,
} from '../src/ai/ai-circuit-breaker.service';
import { AIResponseCacheService } from '../src/ai/ai-response-cache.service';
import { AI_FALLBACK_MODEL, AI_FALLBACK_RESPONSES } from '../src/ai/ai-fallback.constants';

// Lightweight prisma stub for the cache service. The cache logic itself has
// its own narrow tests below; the breaker tests stub it at the service level
// instead of going through prisma so they stay focused on the state machine.
function emptyPrismaMock() {
  return {
    aiResponseCache: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      upsert: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    },
  };
}

function buildBreaker(cacheOverride?: Partial<AIResponseCacheService>) {
  const cache = {
    hashContext: jest.fn(() => 'hash-default'),
    lookup: jest.fn(async () => null),
    store: jest.fn(async () => undefined),
    ...(cacheOverride ?? {}),
  } as unknown as AIResponseCacheService;
  const breaker = new AICircuitBreakerService(cache);
  return { breaker, cache };
}

const liveCall = (text = 'live reply') =>
  jest.fn(async () => ({ text, model: 'sonar-pro' }));
const failingCall = (msg = 'upstream 500') =>
  jest.fn(async () => {
    throw new Error(msg);
  });

describe('AICircuitBreakerService', () => {
  describe('state machine', () => {
    it('starts CLOSED for every intent', () => {
      const { breaker } = buildBreaker();
      const all = breaker.statusAll();
      expect(all).toHaveLength(3);
      for (const s of all) expect(s.state).toBe('closed');
      expect(breaker.worstState()).toBe('closed');
    });

    it('CLOSED state passes calls through and caches the response', async () => {
      const { breaker, cache } = buildBreaker();
      const call = liveCall('hello');
      const result = await breaker.execute('chat', 'hash-1', call);

      expect(result).toEqual({ reply: 'hello', model: 'sonar-pro', source: 'live' });
      expect(call).toHaveBeenCalledTimes(1);
      expect(breaker.status('chat').state).toBe('closed');

      // store is called fire-and-forget; allow the microtask to run.
      await new Promise((r) => setImmediate(r));
      expect(cache.store).toHaveBeenCalledWith('chat', 'hash-1', 'hello', 'sonar-pro');
    });

    it(`trips OPEN after exactly ${FAILURE_THRESHOLD} failures inside the rolling window`, async () => {
      const { breaker } = buildBreaker();

      // FAILURE_THRESHOLD - 1 failures: still CLOSED.
      for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
        await breaker.execute('chat', `h${i}`, failingCall());
      }
      expect(breaker.status('chat').state).toBe('closed');
      expect(breaker.status('chat').failures_in_window).toBe(FAILURE_THRESHOLD - 1);

      // The Nth failure trips OPEN.
      await breaker.execute('chat', 'h-last', failingCall());
      const opened = breaker.status('chat');
      expect(opened.state).toBe('open');
      expect(opened.opened_at).toBeTruthy();
      expect(opened.next_probe_at).toBeTruthy();
    });

    it('OPEN state bypasses upstream entirely', async () => {
      const { breaker } = buildBreaker();
      breaker.forceOpen('chat');

      const call = liveCall();
      const result = await breaker.execute('chat', 'hash', call);
      expect(call).not.toHaveBeenCalled();
      expect(result.source).toBe('fallback');
      expect(result.reply).toBe(AI_FALLBACK_RESPONSES.chat);
      expect(result.model).toBe(AI_FALLBACK_MODEL);
    });

    it('OPEN state serves cache.exact when the input was seen before', async () => {
      const { breaker } = buildBreaker({
        lookup: jest.fn(async () => ({
          response_text: 'cached body',
          model: 'sonar-pro',
          source: 'exact' as const,
        })),
      });
      breaker.forceOpen('chat');

      const result = await breaker.execute('chat', 'hash-known', failingCall());
      expect(result).toEqual({
        reply: 'cached body',
        model: 'sonar-pro',
        source: 'cache_exact',
      });
    });

    it('OPEN state falls back to most-recent cache row when context_hash is unseen', async () => {
      const { breaker } = buildBreaker({
        lookup: jest.fn(async () => ({
          response_text: 'recent body',
          model: 'sonar-pro',
          source: 'recent' as const,
        })),
      });
      breaker.forceOpen('chat');

      const result = await breaker.execute('chat', 'hash-novel', failingCall());
      expect(result).toEqual({
        reply: 'recent body',
        model: 'sonar-pro',
        source: 'cache_recent',
      });
    });

    it('OPEN \u2192 HALF_OPEN after the cooldown elapses, then probe success closes the breaker', async () => {
      jest.useFakeTimers();
      try {
        const { breaker } = buildBreaker();
        breaker.forceOpen('chat');
        expect(breaker.status('chat').state).toBe('open');

        // Advance just past the cooldown.
        jest.setSystemTime(Date.now() + OPEN_COOLDOWN_MS + 1);

        const call = liveCall('probe ok');
        const result = await breaker.execute('chat', 'hash', call);

        expect(call).toHaveBeenCalledTimes(1); // probe ran
        expect(result.source).toBe('live');
        expect(breaker.status('chat').state).toBe('closed');
        expect(breaker.status('chat').failures_in_window).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('HALF_OPEN probe failure snaps back to OPEN with a fresh cooldown', async () => {
      jest.useFakeTimers();
      try {
        const { breaker } = buildBreaker();
        breaker.forceOpen('chat');
        const firstOpen = breaker.status('chat').opened_at;

        jest.setSystemTime(Date.now() + OPEN_COOLDOWN_MS + 1);

        const result = await breaker.execute('chat', 'hash', failingCall('still down'));
        expect(result.source).toBe('fallback');
        const reopened = breaker.status('chat');
        expect(reopened.state).toBe('open');
        // opened_at advanced \u2014 cooldown restarted from this failure.
        expect(reopened.opened_at).not.toBe(firstOpen);
      } finally {
        jest.useRealTimers();
      }
    });

    it('HALF_OPEN serves cache for concurrent callers while the probe is in flight', async () => {
      jest.useFakeTimers();
      try {
        const cacheLookup = jest.fn(async () => ({
          response_text: 'cached',
          model: 'sonar-pro',
          source: 'recent' as const,
        }));
        const { breaker } = buildBreaker({ lookup: cacheLookup });

        breaker.forceOpen('chat');
        jest.setSystemTime(Date.now() + OPEN_COOLDOWN_MS + 1);

        // First caller probes; gate it on a deferred promise so the second
        // caller arrives while the probe is in-flight.
        let releaseProbe!: (v: { text: string; model: string }) => void;
        const probeCall = jest.fn(
          () =>
            new Promise<{ text: string; model: string }>((res) => {
              releaseProbe = res;
            }),
        );

        const probeP = breaker.execute('chat', 'hash', probeCall);
        // Yield once so execute() flips probeInFlight before the second caller.
        await Promise.resolve();

        const concurrentCall = liveCall('should-not-run');
        const concurrent = await breaker.execute('chat', 'hash', concurrentCall);

        expect(concurrentCall).not.toHaveBeenCalled();
        expect(concurrent.source).toBe('cache_recent');

        // Now finish the probe.
        releaseProbe({ text: 'probe ok', model: 'sonar-pro' });
        const probeResult = await probeP;
        expect(probeResult.source).toBe('live');
        expect(breaker.status('chat').state).toBe('closed');
      } finally {
        jest.useRealTimers();
      }
    });

    it('failures older than the rolling window do not count toward the threshold', async () => {
      jest.useFakeTimers();
      try {
        const { breaker } = buildBreaker();

        // FAILURE_THRESHOLD - 1 stale failures, then advance past the window.
        for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
          await breaker.execute('chat', `h${i}`, failingCall());
        }
        jest.setSystemTime(Date.now() + FAILURE_WINDOW_MS + 1000);

        // One more failure \u2014 stale ones are gone, so we're back to 1/N, not N/N.
        await breaker.execute('chat', 'h-fresh', failingCall());
        const status = breaker.status('chat');
        expect(status.state).toBe('closed');
        expect(status.failures_in_window).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('per-intent isolation: chat tripping OPEN does not affect eod_insight', async () => {
      const { breaker } = buildBreaker();
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        await breaker.execute('chat', `h${i}`, failingCall());
      }
      expect(breaker.status('chat').state).toBe('open');
      expect(breaker.status('eod_insight').state).toBe('closed');
      expect(breaker.status('spending_dna').state).toBe('closed');
      expect(breaker.worstState()).toBe('open');

      // eod_insight still passes calls through.
      const call = liveCall('insight body');
      const result = await breaker.execute('eod_insight', 'hx', call);
      expect(call).toHaveBeenCalledTimes(1);
      expect(result.source).toBe('live');
    });
  });

  describe('manual overrides', () => {
    it('forceOpen trips an already-CLOSED breaker without organic failures', async () => {
      const { breaker } = buildBreaker();
      const before = breaker.status('chat');
      expect(before.state).toBe('closed');

      const after = breaker.forceOpen('chat');
      expect(after.state).toBe('open');
      expect(after.opened_at).toBeTruthy();

      const call = liveCall();
      const result = await breaker.execute('chat', 'hash', call);
      expect(call).not.toHaveBeenCalled();
      expect(result.source).toBe('fallback');
    });

    it('forceClose clears the failure window and skips the HALF_OPEN probe', async () => {
      const { breaker } = buildBreaker();
      breaker.forceOpen('chat');
      const closed = breaker.forceClose('chat');
      expect(closed.state).toBe('closed');
      expect(closed.failures_in_window).toBe(0);
      expect(closed.opened_at).toBeNull();

      const call = liveCall('after recovery');
      const result = await breaker.execute('chat', 'hash', call);
      expect(call).toHaveBeenCalledTimes(1);
      expect(result.source).toBe('live');
    });

    it('forceOpen on an already-open breaker re-arms the cooldown timer', () => {
      jest.useFakeTimers();
      try {
        const { breaker } = buildBreaker();
        const t0 = breaker.forceOpen('chat').opened_at!;

        jest.setSystemTime(Date.now() + 30_000);
        const t1 = breaker.forceOpen('chat').opened_at!;

        expect(new Date(t1).getTime()).toBeGreaterThan(new Date(t0).getTime());
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('observability', () => {
    it('status() reports the same threshold and window the runtime uses', () => {
      const { breaker } = buildBreaker();
      const s = breaker.status('chat');
      expect(s.failure_threshold).toBe(FAILURE_THRESHOLD);
      expect(s.failure_window_ms).toBe(FAILURE_WINDOW_MS);
      expect(s.open_cooldown_ms).toBe(OPEN_COOLDOWN_MS);
    });

    it('worstState reflects the most-degraded intent', () => {
      const { breaker } = buildBreaker();
      expect(breaker.worstState()).toBe('closed');
      breaker.forceOpen('eod_insight');
      expect(breaker.worstState()).toBe('open');
      breaker.forceClose('eod_insight');
      expect(breaker.worstState()).toBe('closed');
    });
  });
});

describe('AIResponseCacheService', () => {
  it('hashContext is deterministic regardless of object key order', () => {
    const cache = new AIResponseCacheService(emptyPrismaMock() as any);
    const a = cache.hashContext({ b: 2, a: 1, c: { y: 9, x: 8 } });
    const b = cache.hashContext({ a: 1, c: { x: 8, y: 9 }, b: 2 });
    expect(a).toBe(b);
  });

  it('lookup returns the exact match in preference to the most-recent row', async () => {
    const prisma = emptyPrismaMock() as any;
    prisma.aiResponseCache.findUnique = jest.fn(async () => ({
      id: 'exact-id',
      response_text: 'exact body',
      model: 'sonar-pro',
    }));
    prisma.aiResponseCache.findFirst = jest.fn(async () => ({
      id: 'recent-id',
      response_text: 'recent body',
      model: 'sonar-pro',
    }));
    const cache = new AIResponseCacheService(prisma);

    const hit = await cache.lookup('chat', 'hash-known');
    expect(hit?.source).toBe('exact');
    expect(hit?.response_text).toBe('exact body');
    expect(prisma.aiResponseCache.findFirst).not.toHaveBeenCalled();
  });

  it('lookup falls back to the most-recent row for the intent on a context_hash miss', async () => {
    const prisma = emptyPrismaMock() as any;
    prisma.aiResponseCache.findUnique = jest.fn(async () => null);
    prisma.aiResponseCache.findFirst = jest.fn(async () => ({
      id: 'recent-id',
      response_text: 'recent body',
      model: 'sonar-pro',
    }));
    const cache = new AIResponseCacheService(prisma);

    const hit = await cache.lookup('chat', 'hash-novel');
    expect(hit?.source).toBe('recent');
    expect(hit?.response_text).toBe('recent body');
  });

  it('lookup returns null when the cache is cold for the intent', async () => {
    const prisma = emptyPrismaMock();
    const cache = new AIResponseCacheService(prisma as any);
    const hit = await cache.lookup('chat', 'hash');
    expect(hit).toBeNull();
  });

  it('store swallows prisma errors so it can be safely fire-and-forget', async () => {
    const prisma = emptyPrismaMock() as any;
    prisma.aiResponseCache.upsert = jest.fn(async () => {
      throw new Error('database is down');
    });
    const cache = new AIResponseCacheService(prisma);

    // Should resolve, not reject.
    await expect(cache.store('chat', 'hash', 'body', 'sonar-pro')).resolves.toBeUndefined();
  });
});
