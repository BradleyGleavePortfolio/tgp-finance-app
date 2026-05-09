import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AICircuitBreakerService } from '../ai/ai-circuit-breaker.service';

/**
 * /health        — cheap liveness probe (Fly + load balancers hit this).
 * /health/deep   — pings the database with `SELECT 1` and returns a structured
 *                  status. Distinct from the cheap check so a flaky DB never
 *                  takes the whole app off the load balancer; ops tooling
 *                  (smoke checks, console "is the backend really up?") calls
 *                  the deep variant explicitly.
 *
 * Status values (mirrors the fitness backend pattern):
 *   ok       — all dependencies responding, AI gateway breaker CLOSED
 *   degraded — either the DB is down or the AI gateway breaker is OPEN /
 *              HALF_OPEN. The process is still up and core money paths
 *              (EOD save, networth compute, balance updates) are unaffected
 *              by an AI outage — hence degraded, not unhealthy.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiBreaker: AICircuitBreakerService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe', description: 'Cheap public liveness check used by Fly.io.' })
  @ApiOkResponse({ schema: { example: { status: 'ok', timestamp: '2026-04-27T19:08:00.000Z' } } })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('deep')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deep health probe',
    description:
      'Pings the database with `SELECT 1`. Always returns 200; the body carries `status: ok | degraded` so a flaky DB never yanks the VM out of rotation.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-04-27T19:08:00.000Z',
        checks: {
          database: { ok: true, latency_ms: 4, error: null },
          ai_gateway: { state: 'closed', intents: [] },
        },
      },
    },
  })
  async deep() {
    const startedAt = Date.now();
    let dbOk = false;
    let dbError: string | null = null;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      dbError = (err as Error).message?.slice(0, 200) ?? 'unknown';
    }

    const aiState = this.aiBreaker.worstState();
    const aiOk = aiState === 'closed';
    const status = dbOk && aiOk ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          ok: dbOk,
          latency_ms: Date.now() - startedAt,
          error: dbError,
        },
        ai_gateway: {
          state: aiState,
          ok: aiOk,
          intents: this.aiBreaker.statusAll().map((s) => ({
            intent: s.intent,
            state: s.state,
            failures_in_window: s.failures_in_window,
            next_probe_at: s.next_probe_at,
          })),
        },
      },
    };
  }
}
