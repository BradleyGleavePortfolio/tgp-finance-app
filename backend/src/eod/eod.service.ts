import { Injectable, BadRequestException, ConflictException, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toN } from '../common/money';
import { MilestonesService, MILESTONES } from '../milestones/milestones.service';
import { PrioritiesService, PRIORITY_WATERFALL } from '../priorities/priorities.service';
import { PushSenderService } from '../push/push-sender.service';

// Subset of Prisma's interactive-transaction client (everything we need).
type Tx = Prisma.TransactionClient;

@Injectable()
export class EODService {
  private readonly logger = new Logger(EODService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly milestonesService?: MilestonesService,
    @Optional() private readonly prioritiesService?: PrioritiesService,
    @Optional() private readonly pushSender?: PushSenderService,
  ) {}

  async submitEOD(userId: string, dto: {
    submission_date: string;
    account_snapshots: Array<{ account_id: string; balance: number; notes?: string }>;
    notes?: string;
    mood?: number;
    habits_checked?: string[];
  }) {
    const dateObj = new Date(dto.submission_date);

    // Validate accounts belong to user BEFORE opening the transaction — no
    // point holding a db connection if the DTO is bad.
    const accountIds = dto.account_snapshots.map((s) => s.account_id);
    const accounts = await this.prisma.financialAccount.findMany({
      where: { id: { in: accountIds }, user_id: userId, is_active: true },
    });

    if (accounts.length !== accountIds.length) {
      throw new BadRequestException({
        error: 'One or more accounts not found or inactive',
        code: 'INVALID_ACCOUNTS',
      });
    }

    // Compute totals from snapshots.
    let total_assets = 0;
    let total_debt = 0;
    let total_cash = 0;

    for (const snapshot of dto.account_snapshots) {
      const account = accounts.find((a) => a.id === snapshot.account_id);
      if (!account) continue;

      if (account.is_debt) {
        total_debt += snapshot.balance;
      } else {
        total_assets += snapshot.balance;
        if (['checking', 'savings'].includes(account.account_type)) {
          total_cash += snapshot.balance;
        }
      }
    }

    const net_worth_computed = total_assets - total_debt;

    // Wrap all writes in a single interactive transaction so a failure halfway
    // through (duplicate unique key, broken account ref, etc.) rolls back the
    // whole submission rather than leaving mismatched state across tables.
    // Audit item H12.
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Duplicate check must happen INSIDE the transaction so the read sees
        // the same snapshot as the create below — prevents a race between two
        // concurrent submissions for the same user+date.
        const existing = await tx.eODSubmission.findUnique({
          where: { user_id_submission_date: { user_id: userId, submission_date: dateObj } },
        });

        if (existing) {
          throw new ConflictException({
            error: 'EOD already submitted for this date',
            code: 'EOD_DUPLICATE',
          });
        }

        const submission = await tx.eODSubmission.create({
          data: {
            user_id: userId,
            submission_date: dateObj,
            account_snapshots: dto.account_snapshots as any,
            net_worth_computed,
            total_debt_computed: total_debt,
            total_assets_computed: total_assets,
            total_cash_computed: total_cash,
            notes: dto.notes,
            mood: dto.mood,
            habits_checked: dto.habits_checked as any,
          },
        });

        // Update account balances + write balance logs.
        for (const snapshot of dto.account_snapshots) {
          await tx.financialAccount.update({
            where: { id: snapshot.account_id },
            data: { balance: snapshot.balance, updated_at: new Date() },
          });

          await tx.accountBalanceLog.create({
            data: {
              account_id: snapshot.account_id,
              balance: snapshot.balance,
              date: dateObj,
              source: 'eod_form',
            },
          });
        }

        // Update profile totals + streak.
        const profile = await tx.financialProfile.findUnique({ where: { user_id: userId } });
        let streak_days = 1;

        if (profile?.last_eod_date) {
          const lastDate = new Date(profile.last_eod_date);
          const today = dateObj;
          const diffMs = today.getTime() - lastDate.getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            streak_days = (profile.streak_days || 0) + 1;
          } else if (diffDays === 0) {
            streak_days = profile.streak_days || 1; // Same day (shouldn't happen due to duplicate check)
          }
        }

        await tx.financialProfile.upsert({
          where: { user_id: userId },
          update: {
            net_worth_snapshot: net_worth_computed,
            total_debt,
            total_assets,
            total_cash,
            last_eod_date: dateObj,
            streak_days,
            updated_at: new Date(),
          },
          create: {
            user_id: userId,
            net_worth_snapshot: net_worth_computed,
            total_debt,
            total_assets,
            total_cash,
            last_eod_date: dateObj,
            streak_days: 1,
          },
        });

        // Compute velocity score from inside the same transaction so its reads
        // see the totals we just wrote.
        const velocityScore = await this.computeWealthVelocityScore(tx, userId, {
          streak_days,
          net_worth_computed,
          total_debt,
        });

        await tx.financialProfile.update({
          where: { user_id: userId },
          data: { wealth_velocity_score: velocityScore },
        });

        return {
          submission,
          streak_days,
          wealth_velocity_score: velocityScore,
        };
      });

      // Post-submission enrichment (additive, non-breaking):
      // - newly_unlocked_milestones: keys + titles of milestones that just unlocked
      // - current_priority: index + title of the user's active priority based on
      //   latest balances. Lets the mobile client fire local notifications for
      //   milestones and priority level-ups without any backend scheduler.
      // Errors here MUST NOT roll back the EOD submission: the write already
      // committed. Log & degrade to the base response.
      let newly_unlocked_milestones: Array<{ key: string; title: string }> = [];
      let current_priority: { index: number; title: string } | null = null;

      try {
        if (this.milestonesService) {
          const keys = await this.milestonesService.checkAndUnlockMilestones(userId);
          newly_unlocked_milestones = keys.map((key) => {
            const def = MILESTONES.find((m) => m.key === key);
            return { key, title: def?.title ?? key };
          });

          // Fire a push for each milestone. PushSender dedupes via PushLog on
          // the milestone_key in `data`, so even a retried EOD submit won't
          // double-notify.
          if (this.pushSender) {
            for (const m of newly_unlocked_milestones) {
              await this.pushSender
                .send(userId, 'net_worth_milestone', {
                  title: '🏆 Milestone unlocked',
                  body: m.title,
                  data: { milestone_key: m.key, screen: 'Milestones' },
                })
                .catch((e) =>
                  this.logger.warn(`milestone push failed: ${(e as Error).message}`),
                );
            }
          }
        }
      } catch (e) {
        this.logger.warn(`milestone check failed after EOD for ${userId}: ${(e as Error).message}`);
      }

      try {
        // Capture the pre-EOD priority index so we can detect a level-up
        // crossing triggered by this submission.
        const preProfile = await this.prisma.financialProfile.findUnique({
          where: { user_id: userId },
          select: { current_priority_index: true },
        });
        const prevIndex = preProfile?.current_priority_index ?? 0;

        if (this.prioritiesService) {
          const computed = await this.prioritiesService.getCurrentPriority(userId);
          current_priority = {
            index: computed.current_index,
            title: computed.current.title,
          };

          if (computed.current_index > prevIndex) {
            // Level-up: persist the new index so future EODs don't re-fire,
            // and fire a push (PushSender dedupes on `priority_index` too).
            await this.prisma.financialProfile.update({
              where: { user_id: userId },
              data: { current_priority_index: computed.current_index },
            });
            if (this.pushSender) {
              await this.pushSender
                .send(userId, 'priority_levelup', {
                  title: '⬆️ New priority unlocked',
                  body: computed.current.title,
                  data: {
                    priority_index: computed.current_index,
                    screen: 'Priorities',
                  },
                })
                .catch((e) =>
                  this.logger.warn(`levelup push failed: ${(e as Error).message}`),
                );
            }
          }
        } else {
          // Fallback: compute directly so the mobile client still gets the name.
          const profile = await this.prisma.financialProfile.findUnique({ where: { user_id: userId } });
          const accounts = await this.prisma.financialAccount.findMany({ where: { user_id: userId, is_active: true } });
          for (const priority of PRIORITY_WATERFALL) {
            const r = priority.check(profile as any, accounts as any);
            if (!r.complete) {
              current_priority = { index: priority.index, title: priority.title };
              break;
            }
          }
          if (!current_priority) {
            const last = PRIORITY_WATERFALL[PRIORITY_WATERFALL.length - 1];
            current_priority = { index: last.index, title: last.title };
          }
        }
      } catch (e) {
        this.logger.warn(`priority compute failed after EOD for ${userId}: ${(e as Error).message}`);
      }

      return {
        submission: result.submission,
        net_worth_computed,
        total_assets,
        total_debt,
        total_cash,
        streak_days: result.streak_days,
        wealth_velocity_score: result.wealth_velocity_score,
        newly_unlocked_milestones,
        current_priority,
      };
    } catch (err) {
      // Catch a race where two concurrent submits hit the unique constraint;
      // Prisma surfaces this as P2002 outside the explicit findUnique branch.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          error: 'EOD already submitted for this date',
          code: 'EOD_DUPLICATE',
        });
      }
      throw err;
    }
  }

  async computeWealthVelocityScore(
    tx: Tx | PrismaService,
    userId: string,
    current: {
      streak_days: number;
      net_worth_computed: number;
      total_debt: number;
    },
  ): Promise<number> {
    // Factor 1: Streak consistency (30%): streak / 30 days × 30
    const streakScore = Math.min((current.streak_days / 30) * 30, 30);

    // Factor 2: Debt payoff rate (25%): % of debt paid vs 90 days ago
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const oldEOD = await tx.eODSubmission.findFirst({
      where: { user_id: userId, submitted_at: { gte: ninetyDaysAgo } },
      orderBy: { submitted_at: 'asc' },
    });

    let debtPayoffScore = 0;
    const oldTotalDebt = toN(oldEOD?.total_debt_computed);
    if (oldEOD && oldTotalDebt > 0) {
      const pctPaid = Math.max(0, (oldTotalDebt - current.total_debt) / oldTotalDebt);
      debtPayoffScore = Math.min(pctPaid * 100 * 0.25, 25);
    } else {
      debtPayoffScore = current.total_debt === 0 ? 25 : 0;
    }

    // Factor 3: Net worth momentum (25%): growth % vs 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldNetWorthEOD = await tx.eODSubmission.findFirst({
      where: { user_id: userId, submitted_at: { gte: thirtyDaysAgo } },
      orderBy: { submitted_at: 'asc' },
    });

    let momentumScore = 0;
    if (oldNetWorthEOD) {
      const oldNW = toN(oldNetWorthEOD.net_worth_computed);
      if (oldNW !== 0) {
        const growthPct = (current.net_worth_computed - oldNW) / Math.abs(oldNW);
        momentumScore = Math.min(Math.max(growthPct * 100, 0), 25);
      }
    }

    // Factor 4: Savings rate (20%): estimated from profile
    const profile = await tx.financialProfile.findUnique({ where: { user_id: userId } });
    let savingsScore = 0;
    const monthlyIncome = toN(profile?.monthly_income_gross);
    const totalCash = toN(profile?.total_cash);
    if (monthlyIncome > 0 && totalCash > 0) {
      const estimatedExpenses = monthlyIncome * 0.6;
      const savingsRate = Math.max(0, (monthlyIncome - estimatedExpenses) / monthlyIncome);
      savingsScore = Math.min(savingsRate * 100 * 0.2, 20);
    }

    const total = streakScore + debtPayoffScore + momentumScore + savingsScore;
    return Math.min(Math.round(total), 100);
  }

  async getEODHistory(userId: string, days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.eODSubmission.findMany({
      where: { user_id: userId, submitted_at: { gte: since } },
      orderBy: { submission_date: 'desc' },
    });
  }

  async getTodayEOD(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.eODSubmission.findFirst({
      where: {
        user_id: userId,
        submission_date: { gte: today, lt: tomorrow },
      },
    });
  }
}
