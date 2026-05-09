import { HealthController } from '../src/health/health.controller';
import { AICircuitBreakerService } from '../src/ai/ai-circuit-breaker.service';
import { AIResponseCacheService } from '../src/ai/ai-response-cache.service';

function makePrisma(queryRawImpl: () => Promise<unknown>) {
  return { $queryRaw: jest.fn(queryRawImpl) } as any;
}

// Real breaker over a stub cache — keeps the health probe path honest by
// using the same observability calls the production runtime makes.
function makeBreaker() {
  const cache = {
    hashContext: jest.fn(() => 'h'),
    lookup: jest.fn(async () => null),
    store: jest.fn(async () => undefined),
  } as unknown as AIResponseCacheService;
  return new AICircuitBreakerService(cache);
}

describe('HealthController', () => {
  describe('GET /health', () => {
    it('returns ok + ISO timestamp without touching the DB', () => {
      const prisma = makePrisma(async () => {
        throw new Error('db should not be called from /health');
      });
      const ctrl = new HealthController(prisma, makeBreaker());
      const out = ctrl.check();
      expect(out.status).toBe('ok');
      expect(() => new Date(out.timestamp).toISOString()).not.toThrow();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/deep', () => {
    it('returns ok and a non-negative DB latency on success', async () => {
      const prisma = makePrisma(async () => [{ '?column?': 1 }]);
      const ctrl = new HealthController(prisma, makeBreaker());
      const out = await ctrl.deep();
      expect(out.status).toBe('ok');
      expect(out.checks.database.ok).toBe(true);
      expect(out.checks.database.error).toBeNull();
      expect(out.checks.database.latency_ms).toBeGreaterThanOrEqual(0);
      expect(out.checks.ai_gateway.state).toBe('closed');
      expect(out.checks.ai_gateway.ok).toBe(true);
    });

    it('returns degraded when the DB query throws — never propagates', async () => {
      const prisma = makePrisma(async () => {
        throw new Error('connection refused — really long upstream message that we should truncate before returning to clients to avoid leaking driver internals across the wire');
      });
      const ctrl = new HealthController(prisma, makeBreaker());
      const out = await ctrl.deep();
      expect(out.status).toBe('degraded');
      expect(out.checks.database.ok).toBe(false);
      expect(out.checks.database.error).toContain('connection refused');
      // Truncated to <= 200 chars to avoid leaking stack-trace-like material.
      expect(out.checks.database.error!.length).toBeLessThanOrEqual(200);
    });

    it('returns degraded when the AI breaker is OPEN even if the DB is up', async () => {
      const prisma = makePrisma(async () => [{ '?column?': 1 }]);
      const breaker = makeBreaker();
      breaker.forceOpen('chat');
      const ctrl = new HealthController(prisma, breaker);
      const out = await ctrl.deep();
      expect(out.status).toBe('degraded');
      expect(out.checks.database.ok).toBe(true);
      expect(out.checks.ai_gateway.state).toBe('open');
      expect(out.checks.ai_gateway.ok).toBe(false);
      const chat = out.checks.ai_gateway.intents.find((i: any) => i.intent === 'chat');
      expect(chat?.state).toBe('open');
    });
  });
});
