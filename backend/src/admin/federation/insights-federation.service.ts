import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FinanceInsightsSummary,
  FinanceInsightsWeek,
} from './insights-federation.types';

/**
 * InsightsFederationService — read-only weekly finance series for the
 * fitness backend's Holistic Insights v1 (Sprint B-3).
 *
 * Posture mirrors AdminFederationService: never throws on missing data
 * (NotFoundException for unknown email is the one exception, mapped to
 * 404 by the controller and consumed as `{ kind: 'not_found' }` by the
 * backend client). No mutations. No PII in logs.
 */

interface CacheEntry {
  payload: FinanceInsightsSummary;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 365;
const DEBT_TO_INCOME_CEILING = 5;
const SAVINGS_RATE_FLOOR = 0;
const SAVINGS_RATE_CEILING = 100;

@Injectable()
export class InsightsFederationService {
  private readonly logger = new Logger(InsightsFederationService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async getFinanceSummary(
    email: string,
    windowDays: number,
  ): Promise<FinanceInsightsSummary> {
    const clampedWindow = Math.min(
      Math.max(windowDays, MIN_WINDOW_DAYS),
      MAX_WINDOW_DAYS,
    );
    const cacheKey = `${email.toLowerCase()}|${clampedWindow}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }

    // Identity: email match is the federation join key. Case-insensitive
    // by storing comparisons on the indexed column verbatim — Prisma's
    // findFirst with `mode: 'insensitive'` matches the admin federation
    // service's behaviour.
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found by email');
    }

    const profile = await this.prisma.financialProfile.findUnique({
      where: { user_id: user.id },
      select: { monthly_income_gross: true },
    });
    const monthlyIncome = this.decimalToNumber(
      profile?.monthly_income_gross ?? null,
    );

    const since = new Date(Date.now() - clampedWindow * 24 * 60 * 60 * 1000);
    const eods = await this.prisma.eODSubmission.findMany({
      where: { user_id: user.id, submission_date: { gte: since } },
      orderBy: { submission_date: 'asc' },
      select: {
        submission_date: true,
        total_cash_computed: true,
        total_debt_computed: true,
      },
    });

    const summary: FinanceInsightsSummary = {
      weeks: this.buildWeeklySeries(eods, monthlyIncome),
      generated_at: new Date().toISOString(),
    };

    this.cache.set(cacheKey, {
      payload: summary,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return summary;
  }

  // Visible for tests.
  buildWeeklySeries(
    eods: Array<{
      submission_date: Date;
      total_cash_computed: Prisma.Decimal;
      total_debt_computed: Prisma.Decimal;
    }>,
    monthlyIncome: number | null,
  ): FinanceInsightsWeek[] {
    if (eods.length === 0) return [];

    // Aggregate by ISO week. For each week, keep the LAST EOD (the one
    // closest to end-of-week). This is the snapshot the metrics are
    // computed against.
    const lastByWeek = new Map<
      string,
      { date: Date; cash: number; debt: number }
    >();
    for (const eod of eods) {
      const key = isoWeekKey(eod.submission_date);
      const cash = this.decimalToNumber(eod.total_cash_computed) ?? 0;
      const debt = this.decimalToNumber(eod.total_debt_computed) ?? 0;
      const existing = lastByWeek.get(key);
      if (!existing || eod.submission_date > existing.date) {
        lastByWeek.set(key, { date: eod.submission_date, cash, debt });
      }
    }
    const ordered = Array.from(lastByWeek.entries())
      .map(([weekKey, snapshot]) => ({ weekKey, ...snapshot }))
      .sort((a, b) => (a.weekKey < b.weekKey ? -1 : 1));

    // Week-share of monthly income: monthly / (weeks per month ~= 4.345).
    // When monthlyIncome is null we cannot compute savings_rate_pct or
    // debt_to_income, so we emit them as 0 and let the backend's
    // correlation engine treat them as zero-variance series (it will
    // drop them).
    const weeklyIncomeShare =
      monthlyIncome !== null && monthlyIncome > 0
        ? monthlyIncome / 4.345
        : null;
    const weeklySpendDivisor = 1000; // kUSD

    const out: FinanceInsightsWeek[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const cur = ordered[i];
      const prev = i > 0 ? ordered[i - 1] : null;
      const cashDelta = prev ? cur.cash - prev.cash : 0;

      const savingsRatePct = this.computeSavingsRate(
        cashDelta,
        weeklyIncomeShare,
      );
      const spendingKusd = this.computeSpending(
        cashDelta,
        weeklyIncomeShare,
        weeklySpendDivisor,
      );
      const debtToIncome = this.computeDebtToIncome(cur.debt, monthlyIncome);

      out.push({
        weekKey: cur.weekKey,
        savings_rate_pct: round2(savingsRatePct),
        spending_kusd: round3(spendingKusd),
        debt_to_income: round3(debtToIncome),
      });
    }
    return out;
  }

  private computeSavingsRate(
    cashDelta: number,
    weeklyIncomeShare: number | null,
  ): number {
    if (weeklyIncomeShare === null || weeklyIncomeShare === 0) return 0;
    const raw = (cashDelta / weeklyIncomeShare) * 100;
    return Math.min(SAVINGS_RATE_CEILING, Math.max(SAVINGS_RATE_FLOOR, raw));
  }

  private computeSpending(
    cashDelta: number,
    weeklyIncomeShare: number | null,
    divisor: number,
  ): number {
    if (cashDelta >= 0) return 0;
    const outflow = -cashDelta + (weeklyIncomeShare ?? 0);
    return outflow / divisor;
  }

  private computeDebtToIncome(
    debt: number,
    monthlyIncome: number | null,
  ): number {
    if (monthlyIncome === null || monthlyIncome === 0) return 0;
    const ratio = debt / monthlyIncome;
    return Math.min(DEBT_TO_INCOME_CEILING, Math.max(0, ratio));
  }

  private decimalToNumber(d: Prisma.Decimal | null): number | null {
    if (d === null || d === undefined) return null;
    const parsed = Number(d.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
}

// ISO 8601 week key. MUST match
// growth-project-backend/src/common/correlation/pearson.ts::isoWeekKey.
export function isoWeekKey(input: Date): string {
  const d = new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Re-exported for clarity in tests; not part of the public envelope.
export const __test_helpers__ = { isoWeekKey };
export const __constants__ = { CACHE_TTL_MS, WEEK_MS };
