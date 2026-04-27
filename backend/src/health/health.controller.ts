import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
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
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('deep')
  // Always return 200 — the JSON body carries the real status. Fly's HTTP
  // checks would otherwise mark the machine unhealthy on a transient DB
  // blip and yank it out of rotation, which is worse than serving a
  // degraded response while the DB recovers.
  @HttpCode(HttpStatus.OK)
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
