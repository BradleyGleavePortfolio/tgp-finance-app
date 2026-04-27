import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * /health        — cheap liveness probe (Fly + load balancers hit this).
 * /health/deep   — pings the database with `SELECT 1` and returns a structured
 *                  status. Distinct from the cheap check so a flaky DB never
 *                  takes the whole app off the load balancer; ops tooling
 *                  (smoke checks, console "is the backend really up?") calls
 *                  the deep variant explicitly.
 *
 * Status values (mirrors the fitness backend pattern):
 *   ok       — all dependencies responding
 *   degraded — primary dependency (DB) is down; app process is still up
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
        checks: { database: { ok: true, latency_ms: 4, error: null } },
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

    return {
      status: dbOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          ok: dbOk,
          latency_ms: Date.now() - startedAt,
          error: dbError,
        },
      },
    };
  }
}
