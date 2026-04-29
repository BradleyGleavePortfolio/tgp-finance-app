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
    account_snapshots: Array<{ account_id: string; balance: Prisma.Decimal | number; notes?: string }>;
    notes?: string;
    mood?: number;
    habits_checked?: string[];
  }) {
    const dateObj = new Date(dto.submission_date);

    // Promote every snapshot balance to Decimal up front so balances + totals
    // never round-trip through Number. The Zod DTO already produces Decimal,
    // but tests sometimes pass plain numbers and we accept that for backward
    // compatibility.
    const snapshots = dto.account_snapshots.map((s) => ({
      ...s,
      balance:
        s.balance instanceof Prisma.Decimal
          ? s.balance
          : new Prisma.Decimal(s.balance),
    }));

    // Validate accounts belong to user BEFORE opening the transaction — no
    // point holding a db connection if the DTO is bad.
    const accountIds = snapshots.map((s) => s.account_id);
    const accounts = await this.prisma.financialAccount.findMany({
      where: { id: { in: accountIds }, user_id: userId, is_active: true },
    });

    if (accounts.length !== accountIds.length) {
      throw new BadRequestException({
        error: 'One or more accounts not found or inactive',
        code: 'INVALID_ACCOUNTS',
      });
    }

    // Compute totals from snapshots — Decimal math, not Number, so the
    // persisted net-worth column never drifts.
    let totalAssetsDec = new Prisma.Decimal(0);
    let totalDebtDec = new Prisma.Decimal(0);
    let totalCashDec = new Prisma.Decimal(0);

    for (const snapshot of snapshots) {
      const account = accounts.find((a) => a.id === snapshot.account_id);
      if (!account) continue;

      if (account.is_debt) {
        totalDebtDec = totalDebtDec.plus(snapshot.balance);
      } else {
        totalAssetsDec = totalAssetsDec.plus(snapshot.balance);
        if (['checking', 'savings'].includes(account.account_type)) {
          totalCashDec = totalCashDec.plus(snapshot.balance);
        }
      }
    }

    const netWorthDec = totalAssetsDec.minus(totalDebtDec);
    // Numbers retained for downstream consumers (push messages, velocity
    // score, response envelope). The persisted columns receive the Decimal
    // versions so DB precision is preserved.
    const total_assets = toN(totalAssetsDec);
    const total_debt = toN(totalDebtDec);
    const total_cash = toN(totalCashDec);
    const net_worth_computed = toN(netWorthDec);

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
            // Persist snapshots with their Decimal balances stringified so
            // the JSON column round-trips losslessly (no IEEE-754 drift).
            account_snapshots: snapshots.map((s) => ({
              account_id: s.account_id,
              balance: s.balance.toFixed(2),
              ...(s.notes !== undefined ? { notes: s.notes } : {}),
            })) as unknown as Prisma.InputJsonValue,
            net_worth_computed: netWorthDec,
            total_debt_computed: totalDebtDec,
            total_assets_computed: totalAssetsDec,
            total_cash_computed: totalCashDec,
            notes: dto.notes,
            mood: dto.mood,
            habits_checked: dto.habits_checked as unknown as Prisma.InputJsonValue,
          },
        });

        // Update account balances + write balance logs.
        for (const snapshot of snapshots) {
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

        // Update profile totals.
        await tx.financialProfile.upsert({
          where: { user_id: userId },
          update: {
            net_worth_snapshot: netWorthDec,
            total_debt: totalDebtDec,
            total_assets: totalAssetsDec,
            total_cash: totalCashDec,
            last_eod_date: dateObj,
            updated_at: new Date(),
          },
          create: {
            user_id: userId,
            net_worth_snapshot: netWorthDec,
            total_debt: totalDebtDec,
            total_assets: totalAssetsDec,
            total_cash: totalCashDec,
            last_eod_date: dateObj,
          },
        });

        // Compute velocity score from inside the same transaction so its reads
        // see the totals we just wrote.
        const velocityScore = await this.computeWealthVelocityScore(tx, userId, {
          net_worth_computed,
          total_debt,
        });

        await tx.financialProfile.update({
          where: { user_id: userId },
          data: { wealth_velocity_score: velocityScore },
        });

        return {
          submission,
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
                  title: 'Milestone reached.',
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
            const r = priority.check(profile, accounts);
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
      net_worth_computed: number;
      total_debt: number;
    },
  ): Promise<number> {
    // Doctrine: streak removed. Score now sums to 100 across debt
    // payoff (35%), net-worth momentum (35%), and savings rate (30%).

    // Factor 1: Debt payoff rate (35%): % of debt paid vs 90 days ago
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
      debtPayoffScore = Math.min(pctPaid * 100 * 0.35, 35);
    } else {
      debtPayoffScore = current.total_debt === 0 ? 35 : 0;
    }

    // Factor 2: Net worth momentum (35%): growth % vs 30 days ago
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
        momentumScore = Math.min(Math.max(growthPct * 100, 0), 35);
      }
    }

    // Factor 3: Savings rate (30%): estimated from profile
    const profile = await tx.financialProfile.findUnique({ where: { user_id: userId } });
    let savingsScore = 0;
    const monthlyIncome = toN(profile?.monthly_income_gross);
    const totalCash = toN(profile?.total_cash);
    if (monthlyIncome > 0 && totalCash > 0) {
      const estimatedExpenses = monthlyIncome * 0.6;
      const savingsRate = Math.max(0, (monthlyIncome - estimatedExpenses) / monthlyIncome);
      savingsScore = Math.min(savingsRate * 100 * 0.3, 30);
    }

    const total = debtPayoffScore + momentumScore + savingsScore;
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

  async getEODHistoryByLimit(userId: string, limit: number = 10) {
    return this.prisma.eODSubmission.findMany({
      where: { user_id: userId },
      orderBy: { submission_date: 'desc' },
      take: Math.min(limit, 50),
    });
  }

  async updateEOD(
    id: string,
    userId: string,
    dto: {
      submission_date: string;
      account_snapshots: Array<{ account_id: string; balance: Prisma.Decimal | number; notes?: string }>;
      notes?: string;
      mood?: number;
      habits_checked?: string[];
    },
  ) {
    // Find the entry and verify ownership.
    const entry = await this.prisma.eODSubmission.findUnique({ where: { id } });
    if (!entry || entry.user_id !== userId) {
      throw new BadRequestException({ error: 'EOD entry not found', code: 'NOT_FOUND' });
    }

    // Only allow edits within the last 7 days.
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (new Date(entry.submission_date) < sevenDaysAgo) {
      throw new BadRequestException({
        error: 'EOD entries can only be edited within 7 days of submission',
        code: 'EDIT_WINDOW_EXPIRED',
      });
    }

    // Coerce snapshots to Decimal up front so the recompute uses precise math.
    const snapshots = dto.account_snapshots.map((s) => ({
      ...s,
      balance:
        s.balance instanceof Prisma.Decimal
          ? s.balance
          : new Prisma.Decimal(s.balance),
    }));

    // Recompute totals from new snapshots.
    const accountIds = snapshots.map((s) => s.account_id);
    const accounts = await this.prisma.financialAccount.findMany({
      where: { id: { in: accountIds }, user_id: userId, is_active: true },
    });

    if (accounts.length !== accountIds.length) {
      throw new BadRequestException({
        error: 'One or more accounts not found or inactive',
        code: 'INVALID_ACCOUNTS',
      });
    }

    let totalAssetsDec = new Prisma.Decimal(0);
    let totalDebtDec = new Prisma.Decimal(0);
    let totalCashDec = new Prisma.Decimal(0);
    for (const snapshot of snapshots) {
      const account = accounts.find((a) => a.id === snapshot.account_id);
      if (!account) continue;
      if (account.is_debt) {
        totalDebtDec = totalDebtDec.plus(snapshot.balance);
      } else {
        totalAssetsDec = totalAssetsDec.plus(snapshot.balance);
        if (['checking', 'savings'].includes(account.account_type)) {
          totalCashDec = totalCashDec.plus(snapshot.balance);
        }
      }
    }
    const netWorthDec = totalAssetsDec.minus(totalDebtDec);

    const updated = await this.prisma.eODSubmission.update({
      where: { id },
      data: {
        account_snapshots: snapshots.map((s) => ({
          account_id: s.account_id,
          balance: s.balance.toFixed(2),
          ...(s.notes !== undefined ? { notes: s.notes } : {}),
        })) as unknown as Prisma.InputJsonValue,
        net_worth_computed: netWorthDec,
        total_debt_computed: totalDebtDec,
        total_assets_computed: totalAssetsDec,
        total_cash_computed: totalCashDec,
        notes: dto.notes,
        mood: dto.mood,
        habits_checked: dto.habits_checked as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      submission: updated,
      net_worth_computed: toN(netWorthDec),
      total_assets: toN(totalAssetsDec),
      total_debt: toN(totalDebtDec),
      total_cash: toN(totalCashDec),
    };
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
