import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EODService {
  private readonly logger = new Logger(EODService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitEOD(userId: string, dto: {
    submission_date: string;
    account_snapshots: Array<{ account_id: string; balance: number; notes?: string }>;
    notes?: string;
    mood?: number;
    habits_checked?: string[];
  }) {
    const dateObj = new Date(dto.submission_date);

    // Prevent duplicate submissions for same date
    const existing = await this.prisma.eODSubmission.findUnique({
      where: { user_id_submission_date: { user_id: userId, submission_date: dateObj } },
    });

    if (existing) {
      throw new ConflictException({
        error: 'EOD already submitted for this date',
        code: 'EOD_DUPLICATE',
      });
    }

    // Validate accounts belong to user
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

    // Compute totals from snapshots
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

    // Create EOD submission
    const submission = await this.prisma.eODSubmission.create({
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

    // Update account balances in DB and log them
    for (const snapshot of dto.account_snapshots) {
      await this.prisma.financialAccount.update({
        where: { id: snapshot.account_id },
        data: { balance: snapshot.balance, updated_at: new Date() },
      });

      await this.prisma.accountBalanceLog.create({
        data: {
          account_id: snapshot.account_id,
          balance: snapshot.balance,
          date: dateObj,
          source: 'eod_form',
        },
      });
    }

    // Update profile totals and streak
    const profile = await this.prisma.financialProfile.findUnique({ where: { user_id: userId } });
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

    await this.prisma.financialProfile.upsert({
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

    // Compute wealth velocity score
    const velocityScore = await this.computeWealthVelocityScore(userId, {
      streak_days,
      net_worth_computed,
      total_debt,
    });

    await this.prisma.financialProfile.update({
      where: { user_id: userId },
      data: { wealth_velocity_score: velocityScore },
    });

    return {
      submission,
      net_worth_computed,
      total_assets,
      total_debt,
      total_cash,
      streak_days,
      wealth_velocity_score: velocityScore,
    };
  }

  async computeWealthVelocityScore(userId: string, current: {
    streak_days: number;
    net_worth_computed: number;
    total_debt: number;
  }): Promise<number> {
    // Factor 1: Streak consistency (30%): streak / 30 days × 30
    const streakScore = Math.min((current.streak_days / 30) * 30, 30);

    // Factor 2: Debt payoff rate (25%): % of debt paid vs 90 days ago
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const oldEOD = await this.prisma.eODSubmission.findFirst({
      where: { user_id: userId, submitted_at: { gte: ninetyDaysAgo } },
      orderBy: { submitted_at: 'asc' },
    });

    let debtPayoffScore = 0;
    if (oldEOD && oldEOD.total_debt_computed > 0) {
      const pctPaid = Math.max(
        0,
        (oldEOD.total_debt_computed - current.total_debt) / oldEOD.total_debt_computed,
      );
      debtPayoffScore = Math.min(pctPaid * 100 * 0.25, 25);
    } else {
      debtPayoffScore = current.total_debt === 0 ? 25 : 0;
    }

    // Factor 3: Net worth momentum (25%): growth % vs 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldNetWorthEOD = await this.prisma.eODSubmission.findFirst({
      where: { user_id: userId, submitted_at: { gte: thirtyDaysAgo } },
      orderBy: { submitted_at: 'asc' },
    });

    let momentumScore = 0;
    if (oldNetWorthEOD) {
      const oldNW = oldNetWorthEOD.net_worth_computed;
      if (oldNW !== 0) {
        const growthPct = (current.net_worth_computed - oldNW) / Math.abs(oldNW);
        momentumScore = Math.min(Math.max(growthPct * 100, 0), 25);
      }
    }

    // Factor 4: Savings rate (20%): estimated from profile
    const profile = await this.prisma.financialProfile.findUnique({ where: { user_id: userId } });
    let savingsScore = 0;
    if (profile?.monthly_income_gross && profile?.total_cash) {
      const estimatedExpenses = (profile.monthly_income_gross || 0) * 0.6;
      const savingsRate = Math.max(
        0,
        (profile.monthly_income_gross - estimatedExpenses) / profile.monthly_income_gross,
      );
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
