// Sprint A audit fix coach #7 — coach_promotion_audits retention.
//
// Every coach-promote attempt — success OR fail — writes a row. The
// rate limit (5/min/IP) bounds the spam rate, but with no scheduled
// cleanup an attacker with persistence can fill the table over time.
//
// Retention policy (documented in RUNBOOK.md):
//   - `success` rows: kept INDEFINITELY (compliance / audit trail).
//   - `already_coach` rows: kept 1 YEAR (idempotent re-promotes).
//   - everything else (`invalid_token`, `invalid_role`,
//     `rate_limited`, etc.): kept 90 DAYS, then pruned.
//
// We run the prune nightly at 03:15 UTC to avoid the 02:00 UTC window
// when other tasks (Postgres autovacuum, push-scheduler ticks) tend
// to run. Idempotent — pruning the same window twice is a no-op.

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const NON_SUCCESS_OUTCOMES = [
  'invalid_token',
  'invalid_role',
  'rate_limited',
] as const;

const NON_SUCCESS_RETENTION_DAYS = 90;
const ALREADY_COACH_RETENTION_DAYS = 365;

@Injectable()
export class CoachPromotionAuditScheduler {
  private readonly logger = new Logger(CoachPromotionAuditScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nightly retention sweep. Manual invocation: call `prune()`
   * directly from a one-off script or admin route.
   */
  @Cron('15 3 * * *', { name: 'coach-promotion-audit-retention' })
  async tickRetention(): Promise<void> {
    try {
      const result = await this.prune();
      this.logger.log(
        `coach_promotion_audits retention sweep: pruned ${result.non_success_pruned} non-success + ${result.already_coach_pruned} already_coach rows`,
      );
    } catch (err) {
      this.logger.error(
        `coach_promotion_audits retention sweep failed: ${(err as Error).message}`,
      );
    }
  }

  async prune(now: Date = new Date()): Promise<{
    non_success_pruned: number;
    already_coach_pruned: number;
  }> {
    const nonSuccessFloor = new Date(
      now.getTime() - NON_SUCCESS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const alreadyCoachFloor = new Date(
      now.getTime() - ALREADY_COACH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const nonSuccessResult = await this.prisma.coachPromotionAudit.deleteMany({
      where: {
        outcome: { in: [...NON_SUCCESS_OUTCOMES] },
        created_at: { lt: nonSuccessFloor },
      },
    });

    const alreadyCoachResult = await this.prisma.coachPromotionAudit.deleteMany({
      where: {
        outcome: 'already_coach',
        created_at: { lt: alreadyCoachFloor },
      },
    });

    return {
      non_success_pruned: nonSuccessResult.count,
      already_coach_pruned: alreadyCoachResult.count,
    };
  }
}
