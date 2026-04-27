import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

class TooManyRequestsException extends HttpException {
  constructor(response: any) {
    super(response, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export const AI_RATE_LIMIT = 20;
export const AI_RATE_WINDOW_MS = 60 * 60 * 1000;

// Retention window for the ledger sweep. Anything older than this is
// definitionally outside every counter we'd ever read, so it's safe to delete.
// Picked at 4x the rate window so a clock skew or lazy sweep can't accidentally
// erase rows the counter still wants to see.
const RETENTION_MS = AI_RATE_WINDOW_MS * 4;

// Sweep at most once per process per minute. Counting rows is cheap; deleting
// across an unbounded backlog under load is not. Best-effort, fire-and-forget.
const SWEEP_INTERVAL_MS = 60 * 1000;

export type AIEndpoint = 'chat' | 'eod_insight' | 'spending_dna';

/**
 * Database-backed sliding-window rate limiter for the AI endpoints.
 *
 * Why this exists: the previous implementation kept a per-user counter in a
 * `Map` inside the AIService process. That counter:
 *   - reset on every Fly.io VM restart (so a user could re-burst by waiting
 *     for a deploy),
 *   - did not share state across multiple VMs once the app horizontally
 *     scales (every VM had its own bucket → effective limit = N × 20/hr).
 *
 * The new design writes one row per chargeable AI call to `ai_request_logs`
 * and counts rows in the last hour for the calling user. Any web VM can read
 * and write the table without coordination, so the counter is correct under
 * horizontal scale-out.
 *
 * The accompanying `ai_request_logs_user_id_created_at_idx` index keeps the
 * counter query sub-ms; a best-effort retention sweep prunes rows older than
 * `RETENTION_MS` after each consume call, capped to once per minute per
 * process so we never thunder-herd a delete on a hot path.
 */
@Injectable()
export class AIRateLimitService {
  private readonly logger = new Logger(AIRateLimitService.name);
  private lastSweepAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Throws TooManyRequestsException if the user has used their hourly budget.
   * Otherwise records this call against the ledger and returns the remaining
   * quota for the current window.
   *
   * The check + insert are intentionally not wrapped in a transaction. Two
   * concurrent calls at the boundary may both pass the check and both insert,
   * leaving the user one over the limit on a single hour. That overage is
   * acceptable; a SERIALIZABLE transaction here would add latency to the hot
   * path on every AI call to defend a +/- 1 boundary, which is the wrong
   * trade-off for a coach chat product.
   */
  async consume(userId: string, endpoint: AIEndpoint): Promise<{ remaining: number }> {
    const since = new Date(Date.now() - AI_RATE_WINDOW_MS);

    const used = await this.prisma.aIRequestLog.count({
      where: {
        user_id: userId,
        created_at: { gt: since },
      },
    });

    if (used >= AI_RATE_LIMIT) {
      const oldestInWindow = await this.prisma.aIRequestLog.findFirst({
        where: { user_id: userId, created_at: { gt: since } },
        orderBy: { created_at: 'asc' },
        select: { created_at: true },
      });

      const resetAt = oldestInWindow
        ? new Date(oldestInWindow.created_at.getTime() + AI_RATE_WINDOW_MS)
        : new Date(Date.now() + AI_RATE_WINDOW_MS);
      const minutesLeft = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 60000));

      throw new TooManyRequestsException({
        error: `Rate limit exceeded. You can send ${AI_RATE_LIMIT} AI messages per hour. Reset in ${minutesLeft} minutes.`,
        code: 'RATE_LIMITED',
        limit: AI_RATE_LIMIT,
        window_seconds: Math.floor(AI_RATE_WINDOW_MS / 1000),
        reset_at: resetAt.toISOString(),
      });
    }

    await this.prisma.aIRequestLog.create({
      data: { user_id: userId, endpoint },
    });

    this.maybeSweep();

    return { remaining: AI_RATE_LIMIT - used - 1 };
  }

  /** Read-only quota lookup for diagnostics / future "X of 20 used" UI. */
  async snapshot(userId: string): Promise<{
    limit: number;
    used: number;
    remaining: number;
    window_seconds: number;
  }> {
    const since = new Date(Date.now() - AI_RATE_WINDOW_MS);
    const used = await this.prisma.aIRequestLog.count({
      where: { user_id: userId, created_at: { gt: since } },
    });
    return {
      limit: AI_RATE_LIMIT,
      used,
      remaining: Math.max(0, AI_RATE_LIMIT - used),
      window_seconds: Math.floor(AI_RATE_WINDOW_MS / 1000),
    };
  }

  private maybeSweep() {
    const now = Date.now();
    if (now - this.lastSweepAt < SWEEP_INTERVAL_MS) return;
    this.lastSweepAt = now;

    const cutoff = new Date(now - RETENTION_MS);
    this.prisma.aIRequestLog
      .deleteMany({ where: { created_at: { lt: cutoff } } })
      .catch((err) => this.logger.warn(`ai_request_logs sweep failed: ${err?.message ?? err}`));
  }
}
