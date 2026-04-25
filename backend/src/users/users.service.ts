// Users service — identity data for UX Psychology Report #3
// "Identity Reinforcement / Inner Circle"
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the user's founding rank (1-based position by createdAt ASC),
   * total user count, and founding-member status (rank ≤ 1000).
   *
   * Implementation: count how many users were created strictly before this
   * user, then add 1.  This is O(1) per query and avoids a full table sort.
   */
  async getFoundingNumber(userId: string): Promise<{
    rank: number;
    total: number;
    isFoundingMember: boolean;
  }> {
    // Resolve the caller's own createdAt
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { created_at: true },
    });

    // Graceful fallback — should never happen for an auth-guarded route
    if (!me) {
      return { rank: 0, total: 0, isFoundingMember: false };
    }

    // Count users created BEFORE me (strictly earlier timestamp)
    const [earlier, total] = await Promise.all([
      this.prisma.user.count({
        where: { created_at: { lt: me.created_at } },
      }),
      this.prisma.user.count(),
    ]);

    const rank = earlier + 1;
    return {
      rank,
      total,
      isFoundingMember: rank <= 1000,
    };
  }

  /**
   * Returns community activity stats for the "inner circle" widget.
   *
   * activeThisWeekCount: distinct users who had any of the following in the
   * last 7 days:
   *   - an EOD submission (eod_submissions.submitted_at)
   *   - a habit log entry (habit_logs.logged_at)
   *   - an account balance log update (account_balance_logs.logged_at)
   *
   * totalMembers: total registered users.
   */
  async getCircleStats(_userId: string): Promise<{
    activeThisWeekCount: number;
    totalMembers: number;
  }> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [eodActive, habitActive, balanceActive, totalMembers] =
      await Promise.all([
        // EOD submissions in the last 7 days
        this.prisma.eODSubmission.findMany({
          where: { submitted_at: { gte: sevenDaysAgo } },
          select: { user_id: true },
          distinct: ['user_id'],
        }),

        // Habit logs in the last 7 days
        this.prisma.habitLog.findMany({
          where: { logged_at: { gte: sevenDaysAgo } },
          select: { user_id: true },
          distinct: ['user_id'],
        }),

        // Account balance log updates in the last 7 days
        this.prisma.accountBalanceLog.findMany({
          where: { logged_at: { gte: sevenDaysAgo } },
          select: { account: { select: { user_id: true } } },
        }),

        this.prisma.user.count(),
      ]);

    // Deduplicate across all three activity sources
    const activeUserIds = new Set<string>([
      ...eodActive.map((e) => e.user_id),
      ...habitActive.map((h) => h.user_id),
      ...balanceActive.map((b) => b.account.user_id),
    ]);

    return {
      activeThisWeekCount: activeUserIds.size,
      totalMembers,
    };
  }
}
