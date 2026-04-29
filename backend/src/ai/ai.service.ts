import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { PrismaService } from '../prisma/prisma.service';
import { AIRateLimitService } from './ai-rate-limit.service';
import { toN } from '../common/money';

// Conversation history forwarded from the client. We pass it through to the
// upstream chat completion as-is after slicing to the last 10 turns.
export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface CoachContext {
  coach_id: string;
  coach_display_name: string;
}

// Quiet-luxury system prompt for the in-app coach.
//
// Voice rules mirror mobile/DESIGN.md §5: declarative, editorial, no hype,
// no emoji, no direct-response copy, no gendered or audience framing. The
// register is a private bank statement, not a coaching funnel. Replies are
// short, factual, and use the user's actual numbers.
// Context payload built by buildUserContext — passed verbatim to the prompt.
// Kept loose because the LLM consumes the JSON-stringified form rather than
// reading specific fields, but `unknown` would force every caller through
// extra narrowing for no benefit.
export type CoachPromptContext = Record<string, unknown>;

export function buildFinanceCoachSystemPrompt(context: CoachPromptContext): string {
  const contextStr = JSON.stringify(context, null, 2);

  return `You are the in-app finance assistant for The Growth Project: Finance.
Your remit is general personal-finance education, calculations the user can
verify, and quiet observations on the data they have entered. You are not a
fiduciary, you are not a marketer, and you do not coach behaviour.

VOICE
- Declarative. Statements of fact end in a period.
- No hype, no emoji, no exclamation marks, no "Great question", no "let's".
- No gendered or aspirational audience framing of any kind.
- No imperatives aimed at conversion or hype-style copy.
- Numbers over adjectives. "$1,240" beats "a meaningful amount".
- One short paragraph by default. Lists only when the answer is a list.
- If a feature in the app already covers the question (What-If, Spending DNA,
  Interest breakdown, Net Worth), name it once at the end of the answer.

TOPIC SCOPE
General personal finance, debt strategy, cash flow, savings rate, index-fund
investing, tax-advantaged accounts (401k, IRA, HSA), the 4% rule and FI
arithmetic, geo-arbitrage and cost-of-living, salary negotiation, compound
interest, behavioural finance. Decline politely on anything outside these
topics.

GUARDRAILS (silent — do not mention unless directly relevant)
- Do not recommend specific individual stocks or altcoins. Index funds and
  asset classes only.
- Do not suggest early withdrawal from retirement accounts unless the user
  asks about it directly, and only with the 10% penalty stated.
- Do not advise taking on additional debt to pay existing debt without
  stating the refinance / consolidation risk.
- Frame all advice as general education. For personalised guidance refer
  the user to a fee-only fiduciary.
- If the user describes financial distress, surface NFCC (nfcc.org) and
  211.org once at the end of the reply, without dramatising the situation.

CALCULATIONS
When a user asks for a number, show the formula and the result on one line.
Example: "At 8% annual return, $500/mo for 10 years = $91,473 (FV = PMT × ((1+r)^n − 1) / r)."
Use the user's actual figures from the context block when available.

USER CONTEXT (private — do not echo back verbatim)
${contextStr}

EXAMPLES (voice and length, not topic coverage)

[Example 1]
User: What is the difference between a Roth and a traditional IRA?
Reply: Traditional IRA contributions may be deductible now and are taxed at
withdrawal. Roth IRA contributions are after-tax and withdrawals in
retirement, including growth, are not. The 2026 contribution cap is $7,000
across both. The choice turns on whether your tax rate is higher today or
in retirement.

[Example 2]
User: Should I pay off debt or invest?
Reply: Compare the debt's APR to a long-run equity return of roughly 8%. Debt
above 8% APR pays down first; debt below 6% can run alongside investing;
the 6–8% band is a split. Your highest-APR account is the first lever. The
What-If tool models the trade-off against your actual balances.

[Example 3]
User: I feel like I am not making progress.
Reply: Your recorded net worth has moved in the direction of your goal across
the last week of check-ins. The figure that matters is the trend, not the
day. Continue the daily check-in.

[Example 4]
User: What is the 4% rule?
Reply: The 4% rule (Bengen, 1994) says a portfolio that withdraws 4% in the
first retirement year and adjusts for inflation thereafter has historically
lasted thirty years. Your FI number is annual expenses ÷ 0.04. The
projections screen extends this to your own savings rate.

[Example 5]
User: Should I buy Bitcoin?
Reply: Bitcoin is a high-volatility asset. Historic drawdowns above 70% are
common. A typical priority order is high-APR debt, an emergency fund, and
tax-advantaged retirement contributions before any speculative allocation,
and any speculative allocation is sized at money you can afford to lose in
full. This is general information, not personalised investment advice.
`;
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private perplexity: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly rateLimit: AIRateLimitService,
  ) {
    // main.ts asserts PERPLEXITY_API_KEY is present at boot. The empty-string
    // fallback here exists only so unit tests that construct the service
    // without a config don't blow up at import time.
    this.perplexity = new OpenAI({
      apiKey: this.config.get<string>('PERPLEXITY_API_KEY', ''),
      baseURL: 'https://api.perplexity.ai',
    });
  }

  async chat(userId: string, message: string, conversationHistory: ConversationTurn[]) {
    await this.rateLimit.consume(userId, 'chat');

    // Safety check: validate message isn't empty
    if (!message || message.trim().length === 0) {
      throw new BadRequestException({ error: 'Message cannot be empty', code: 'EMPTY_MESSAGE' });
    }

    // Build user context
    const userContext = await this.buildUserContext(userId);

    const systemPrompt = buildFinanceCoachSystemPrompt(userContext as CoachPromptContext);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    try {
      const response = await this.perplexity.chat.completions.create({
        model: 'sonar-pro',
        messages,
        temperature: 0.6, // Slightly lower for financial precision
        max_tokens: 600,
      });

      const reply = response.choices[0]?.message?.content || 'Unable to generate response.';
      return { reply, model: 'sonar-pro' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`AI chat error: ${msg}`);
      // Graceful degradation — return an error message rather than crashing
      throw new BadRequestException({
        error: 'AI service temporarily unavailable. Please try again.',
        code: 'AI_ERROR',
      });
    }
  }

  async buildUserContext(userId: string) {
    // Pull a wider context now that AI replies need to relay coach + behavior
    // signal back to the model. Everything still goes through the existing
    // FP system prompt, so the new fields are additive — guarded blocks the
    // prompt builder reads only when present.
    const [profile, accounts, recentEODs, recentHabits, userRow] = await Promise.all([
      this.prisma.financialProfile.findUnique({
        where: { user_id: userId },
        include: { user: { select: { name: true } } },
      }),
      this.prisma.financialAccount.findMany({
        where: { user_id: userId, is_active: true },
        orderBy: { balance: 'desc' },
      }),
      this.prisma.eODSubmission.findMany({
        where: { user_id: userId },
        orderBy: { submission_date: 'desc' },
        take: 7,
      }),
      this.prisma.habitLog.findMany({
        where: { user_id: userId },
        orderBy: { date: 'desc' },
        take: 14,
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          coach_id: true,
          // pull a minimal coach profile so the AI knows who the user is paired with
          // without leaking the coach's full row.
        },
      }),
    ]);

    // Resolve the coach (if any) in a separate, scoped query — only the
    // public-safe fields. We don't want to relay PII the AI doesn't need.
    let coachContext: CoachContext | null = null;
    if (userRow?.coach_id) {
      const coach = await this.prisma.user.findUnique({
        where: { id: userRow.coach_id },
        select: {
          id: true,
          name: true,
          coach_profile: { select: { display_name: true } },
        },
      });
      if (coach) {
        coachContext = {
          coach_id: coach.id,
          coach_display_name: coach.coach_profile?.display_name || coach.name,
        };
      }
    }

    if (!profile) {
      // Even without a profile we still want to relay role + coach so the AI
      // can react ("you haven't set up your profile yet"). Keep payload tiny.
      return {
        profile: null,
        financials: null,
        relationship: { role: userRow?.role ?? 'student', ...(coachContext ?? {}) },
        guardrails: this.buildGuardrails(),
      };
    }

    // Money fields are Prisma.Decimal after the round-2 migration; collapse to
    // Number with toN before arithmetic.
    const totalAssets = accounts.filter((a) => !a.is_debt).reduce((s, a) => s + toN(a.balance), 0);
    const totalDebt = accounts.filter((a) => a.is_debt).reduce((s, a) => s + toN(a.balance), 0);
    const totalCash = accounts
      .filter((a) => ['checking', 'savings'].includes(a.account_type) && !a.is_debt)
      .reduce((s, a) => s + toN(a.balance), 0);
    const monthlyMinPayments = accounts
      .filter((a) => a.is_debt && a.minimum_payment)
      .reduce((s, a) => s + toN(a.minimum_payment), 0);

    // Approximate take-home (22% effective tax rate)
    const takeHomeMonthly = toN(profile.monthly_income_gross) * 0.78;

    return {
      profile: {
        name: profile.user?.name || 'User',
        monthly_income_gross: profile.monthly_income_gross,
        take_home_monthly: Math.round(takeHomeMonthly),
        primary_goal: profile.primary_goal,
        dream_lifestyle_cost_mo: profile.dream_lifestyle_cost_mo,
        wealth_velocity_score: profile.wealth_velocity_score,
        streak_days: profile.streak_days,
        motivation_style: profile.motivation_style,
        city: profile.city,
        state: profile.state,
        country: profile.country,
        current_priority_index: profile.current_priority_index,
      },
      financials: {
        net_worth: Math.round(totalAssets - totalDebt),
        total_assets: Math.round(totalAssets),
        total_debt: Math.round(totalDebt),
        total_cash: Math.round(totalCash),
        monthly_debt_cost: Math.round(monthlyMinPayments),
      },
      top_debts: accounts
        .filter((a) => a.is_debt && toN(a.balance) > 0)
        .sort((a, b) => toN(b.balance) - toN(a.balance))
        .slice(0, 3)
        .map((a) => ({ name: a.name, balance: toN(a.balance), apr: a.apr_percent })),
      top_assets: accounts
        .filter((a) => !a.is_debt)
        .sort((a, b) => toN(b.balance) - toN(a.balance))
        .slice(0, 3)
        .map((a) => ({ name: a.name, balance: toN(a.balance), type: a.account_type })),
      recent_eod: recentEODs.map((e) => ({
        date: e.submission_date,
        net_worth: e.net_worth_computed,
        total_debt: e.total_debt_computed,
        total_assets: e.total_assets_computed,
        mood: e.mood,
      })),
      recent_habits: this.summarizeHabits(recentHabits),
      relationship: { role: userRow?.role ?? 'student', ...(coachContext ?? {}) },
      guardrails: this.buildGuardrails(),
    };
  }

  /**
   * Reduce raw habit logs to per-key counts over the window so the AI sees
   * adherence signal ("checked balances 12/14 days") rather than a dump of
   * rows. Keeps the prompt small and cache-friendly.
   */
  private summarizeHabits(rows: { habit_key: string; completed: boolean; date: Date }[]) {
    const totals = new Map<string, { completed: number; days: number }>();
    for (const row of rows) {
      const key = row.habit_key;
      const cur = totals.get(key) ?? { completed: 0, days: 0 };
      cur.days += 1;
      if (row.completed) cur.completed += 1;
      totals.set(key, cur);
    }
    return Array.from(totals.entries()).map(([habit_key, v]) => ({
      habit_key,
      completed: v.completed,
      days_logged: v.days,
    }));
  }

  /**
   * Static guardrails block surfaced to the model as part of the user
   * context. The system prompt already has its safety section; this is the
   * machine-readable mirror for downstream consumers (e.g. the mobile app
   * inspecting the context payload from /api/ai/context). Nothing here is PII.
   */
  private buildGuardrails() {
    return {
      no_individual_stocks: true,
      no_early_retirement_withdrawals: true,
      escalation_resources: ['nfcc.org', '211.org'],
    };
  }

  async generateEODInsight(userId: string, eodSubmissionId: string) {
    // SECURITY: scope by user_id so a user can't trigger AI generation on another user's
    // submission or overwrite their ai_insight field with attacker-controlled text.
    const submission = await this.prisma.eODSubmission.findFirst({
      where: { id: eodSubmissionId, user_id: userId },
    });

    if (!submission) return { insight: null };

    // EOD insight is a chargeable upstream call; count it against the same
    // hourly budget chat does so a single user can't cycle through 20 chats +
    // 20 EOD insight + 20 DNA reports in an hour.
    await this.rateLimit.consume(userId, 'eod_insight');

    const userContext = await this.buildUserContext(userId);

    const prompt = `Write one sentence of factual observation for this end-of-day record.
Net worth: $${toN(submission.net_worth_computed).toLocaleString()}
Total debt: $${toN(submission.total_debt_computed).toLocaleString()}
Total assets: $${toN(submission.total_assets_computed).toLocaleString()}
User mood: ${submission.mood || 'not recorded'}/5
User goal: ${userContext.profile?.primary_goal || 'reduce debt'}
Twenty words or fewer. Declarative. End in a period. No hype, no emoji, no exclamation marks.`;

    try {
      const response = await this.perplexity.chat.completions.create({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: 'You are the in-app finance assistant. One declarative sentence, no hype, no emoji, end in a period.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      const insight = response.choices[0]?.message?.content || null;

      // Update submission with AI insight — use updateMany with user_id filter so we can never
      // overwrite a different user's submission even if findFirst above somehow returned one.
      if (insight) {
        await this.prisma.eODSubmission.updateMany({
          where: { id: eodSubmissionId, user_id: userId },
          data: { ai_insight: insight },
        });
      }

      return { insight };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`EOD insight error: ${msg}`);
      return { insight: null };
    }
  }

  async generateSpendingDNA(userId: string, month: string) {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);

    const submissions = await this.prisma.eODSubmission.findMany({
      where: {
        user_id: userId,
        submission_date: { gte: startDate, lte: endDate },
      },
      orderBy: { submission_date: 'asc' },
    });

    if (submissions.length === 0) {
      return { error: 'No EOD data found for this month', month };
    }

    await this.rateLimit.consume(userId, 'spending_dna');

    const profile = await this.prisma.financialProfile.findUnique({ where: { user_id: userId } });

    const avgNetWorth =
      submissions.reduce((s, e) => s + toN(e.net_worth_computed), 0) / submissions.length;
    const startNetWorth = toN(submissions[0].net_worth_computed);
    const endNetWorth = toN(submissions[submissions.length - 1].net_worth_computed);
    const netWorthChange = endNetWorth - startNetWorth;

    const avgDebt =
      submissions.reduce((s, e) => s + toN(e.total_debt_computed), 0) / submissions.length;
    const avgCash =
      submissions.reduce((s, e) => s + toN(e.total_cash_computed), 0) / submissions.length;
    const monthlyIncome = toN(profile?.monthly_income_gross);
    const avgSavingsRate = monthlyIncome > 0 ? ((avgCash / monthlyIncome) * 100).toFixed(1) : '0';

    const prompt = `Write a three-paragraph Spending DNA report for ${month}. Paragraph one: how the month was spent in summary. Paragraph two: the largest single leak in the cash flow. Paragraph three: one specific change that would have the largest effect, stated as a number, not an exhortation.
Two or three sentences per paragraph. Declarative. No hype, no emoji, no exclamation marks. Use the figures below.

User data for ${month}:
- Monthly income: $${monthlyIncome.toLocaleString()}
- Net worth change: ${netWorthChange >= 0 ? '+' : ''}$${Math.round(netWorthChange).toLocaleString()}
- Average total debt: $${Math.round(avgDebt).toLocaleString()}
- Average cash: $${Math.round(avgCash).toLocaleString()}
- Days tracked: ${submissions.length}
- Estimated savings rate: ~${avgSavingsRate}%
- Primary goal: ${profile?.primary_goal || 'reduce debt'}`;

    try {
      const response = await this.perplexity.chat.completions.create({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: 'You are the in-app finance assistant. Write declarative, factual paragraphs. No hype, no emoji, no exclamation marks.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 400,
      });

      const report_text = response.choices[0]?.message?.content || 'Report unavailable.';

      // Save to DB
      const saved = await this.prisma.spendingDnaReport.upsert({
        where: { user_id_month: { user_id: userId, month } },
        update: { report_text },
        create: {
          user_id: userId,
          month,
          report_text,
          key_metrics: {
            days_tracked: submissions.length,
            net_worth_change: Math.round(netWorthChange),
            avg_savings_rate_pct: parseFloat(avgSavingsRate),
            avg_debt: Math.round(avgDebt),
          },
        },
      });

      return saved;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Spending DNA error: ${msg}`);
      throw new BadRequestException({ error: 'Could not generate spending DNA report', code: 'AI_ERROR' });
    }
  }

  // Returns metadata for the most recently generated Spending DNA report.
  // Used by the mobile client to fire the "Your Spending DNA is ready"
  // notification without downloading the full report text on every check.
  async getLatestSpendingDNA(userId: string): Promise<{ month: string | null; generated_at: string | null }> {
    const latest = await this.prisma.spendingDnaReport.findFirst({
      where: { user_id: userId },
      orderBy: { generated_at: 'desc' },
      select: { month: true, generated_at: true },
    });
    return {
      month: latest?.month ?? null,
      generated_at: latest?.generated_at?.toISOString() ?? null,
    };
  }
}
