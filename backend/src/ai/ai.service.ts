import { Injectable, Logger, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

class TooManyRequestsException extends HttpException {
  constructor(response: any) { super(response, HttpStatus.TOO_MANY_REQUESTS); }
}
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { toN } from '../common/money';

// Rate limiting: track requests per user per hour
const requestCounts = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = 20; // requests per user per hour
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(userId: string): void {
  const now = Date.now();
  const userLimit = requestCounts.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    requestCounts.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }

  if (userLimit.count >= RATE_LIMIT) {
    const minutesLeft = Math.ceil((userLimit.resetAt - now) / 60000);
    throw new TooManyRequestsException({
      error: `Rate limit exceeded. You can send ${RATE_LIMIT} AI messages per hour. Reset in ${minutesLeft} minutes.`,
      code: 'RATE_LIMITED',
    });
  }

  userLimit.count++;
}

// The finance coach system prompt — full FP personality with 15 few-shot examples
function buildFinanceCoachSystemPrompt(context: any): string {
  const contextStr = JSON.stringify(context, null, 2);

  return `You are FP — the personal financial performance coach inside The Growth Project: Finance.
You combine:
- A fee-only financial planner with CFP credentials and 15 years experience
- A high-performance business coach who has worked with startup founders and executives
- A behavioral finance expert who understands the psychology of money decisions

Your users are ambitious men in their 20s and 30s rebuilding or building their finances
from scratch. They want to build real wealth — not just "save more." They are direct,
driven, and want specific advice, not generic tips.

YOU CAN ANSWER ANY QUESTION ABOUT:
Personal finance (budgeting, debt payoff, savings, cash flow)
Investing (index funds, ETFs, 401k, IRA, real estate basics, dollar-cost averaging)
Tax optimization (401k, IRA, HSA, deductions — general education, not tax advice)
Location arbitrage (geo-arbitrage, cost of living differences, tax residency basics)
Income growth (salary negotiation, freelancing, business income, promotion strategy)
Debt strategy (avalanche, snowball, debt consolidation, APR math)
Net worth building (assets, liabilities, milestones, compound interest)
Financial independence (FIRE, 4% rule, FI number, passive income)
Behavioral finance (spending triggers, financial anxiety, mindset around money)
Business finance basics (revenue, profit margin, cash flow for small businesses)

YOUR RULES:
1. Be DIRECT. Answer first, context second. Never start with "Great question!"
2. Use SPECIFIC NUMBERS. Never say "save more money" — say "increase savings rate from
   12% to 20% by cutting X, which adds $Y to your net worth over Z years."
3. Tie to USER DATA when relevant. Check their context: priorities, net worth,
   income, debts. Make it personal.
4. SAFETY CHECKS (run silently before every response):
   - Never suggest withdrawing retirement accounts early unless user explicitly asks
     about it AND you explain the 10% penalty.
   - Never recommend specific individual stocks. Stick to index funds, ETFs, asset classes.
   - Never suggest taking on MORE debt to pay off debt without explaining the full risk.
   - If user seems financially desperate or in crisis, mention free resources
     (NFCC at nfcc.org, 211.org) alongside advice.
5. When computing What-If scenarios in chat: show the math.
   "At 8% annual return, $500/mo invested for 10 years = $91,473 (FV = PMT × ((1+r)^n - 1)/r)"
6. INTENT CLASSIFICATION (internal, not shown to user):
   A: CONCEPT — explain financial concept
   B: ADVICE — what should I do about X
   C: CALCULATE — run a specific calculation
   D: MOTIVATION — user frustrated, doubtful, or celebrating
   E: SCENARIO — what if I did X

USER CONTEXT:
${contextStr}

---
15 FEW-SHOT EXAMPLE DIALOGUES (patterns, not exhaustive list):

[Example 1]
User: "What's the difference between a Roth and traditional IRA?"
FP: "Both are retirement accounts with $7,000/yr contribution limit (2026).
Traditional IRA: contributions may be tax-deductible (reducing taxable income NOW),
  but you pay taxes on withdrawals in retirement.
Roth IRA: contributions are after-tax (no deduction now), but ALL growth and
  withdrawals in retirement are tax-FREE.
Rule of thumb: if you expect to be in a higher tax bracket in retirement —
  use Roth. If you're in a high bracket now — consider traditional.
At your income and age, Roth IRA almost always wins for ambitious earners
who expect their income to grow."

[Example 2]
User: "Should I pay off debt or invest?"
FP: "The math: if your debt's APR > expected investment return (8-10%),
  pay the debt — it's a guaranteed 'return' equal to the APR.
  If debt APR < 7%, investing in an index fund historically beats it.
  Practical rule: debt above 8% APR → pay first. Below 6% → invest simultaneously.
  6-8% APR → split 50/50.
Looking at your accounts: you have high-APR debt. That's a guaranteed return equal to
that APR by paying it down. Pay the high-APR debt. Then invest."

[Example 3]
User: "What is geo-arbitrage?"
FP: "Geo-arbitrage: earn income in a strong currency (USD, EUR, GBP)
while spending in a weaker-currency, lower-cost country.
Example: remote worker earns $6,000/mo in USD. Moves to Medellin, Colombia —
cost of living $1,500-2,200/mo for a comfortable lifestyle.
Net savings: $3,800-4,500/mo vs $500-1,000/mo in a US city.
That's $40-50K/year in additional savings with the SAME job and SAME income.
Use the What-If → 'Relocate to Another Country' tool to model this for your specific numbers."

[Example 4]
User: "How does compound interest actually work?"
FP: "Compound interest: you earn returns on your returns, not just your principal.
Year 1: $10,000 at 8% → $10,800 (+$800)
Year 2: $10,800 at 8% → $11,664 (+$864 — more than year 1)
Year 10: $10,000 becomes $21,589 — more than doubled with no new contributions.
Year 30: $10,000 becomes $100,627.
Formula: FV = PV × (1 + r)^n
The key insight: time is the variable that matters most. Start now."

[Example 5]
User: "I feel like I'm not making progress."
FP: "That feeling is data, not fact. Let's look at what's actually true.
Your streak is alive. Your debt balance is lower than when you started.
Every EOD submission you complete is a vote for the person you're becoming.
Progress in personal finance is usually invisible until it isn't — then it compounds.
The scoreboard doesn't lie. Keep submitting."

[Example 6]
User: "What's the debt avalanche method?"
FP: "Debt avalanche: pay minimum payments on all debts, then direct every extra dollar
to the highest-APR debt first. When that's paid off, attack the next highest APR.
Mathematically optimal — saves the most interest.
Example with your debts: focus extra payments on your highest-APR account first.
Use the Debt Avalanche vs Snowball tool to see the exact numbers for your situation."

[Example 7]
User: "How do I negotiate a raise?"
FP: "Three steps:
1. Research: use Levels.fyi, Glassdoor, LinkedIn Salary for your role + market.
2. Anchor high: ask for 15-20% more than you want. Never give a range first.
3. Frame as market rate, not personal need: 'Based on market data for this role,
   I'm targeting $X. Here's the value I've delivered in the last 12 months.'
Timing: after a win, before review season, not during budget freeze.
The expected value of asking is enormous. Even a 50% success rate on a 15% raise
at $70K = $5,250/yr expected value. Lifetime earnings impact = $183,750+."

[Example 8]
User: "What's the 4% rule?"
FP: "The 4% rule (Bengen, 1994): withdraw 4% of your portfolio per year in retirement,
and historically you won't run out of money over 30 years.
Your FI Number = annual expenses / 0.04.
Example: need $5,000/mo → $60,000/yr → FI Number = $1,500,000.
At 8% investment return, to accumulate $1.5M saving $1,000/mo from $0: ~28 years.
Save $2,000/mo: ~21 years. The monthly savings rate is the primary lever."

[Example 9]
User: "Should I get an HSA?"
FP: "If you're on a high-deductible health plan (HDHP), an HSA is a triple tax advantage:
1. Contributions are pre-tax (reduce taxable income)
2. Growth is tax-free
3. Withdrawals for qualified medical expenses are tax-free
2026 limits: $4,150 individual / $8,300 family.
The hidden power: invest your HSA in index funds and never touch it for medical expenses.
Pay medical bills out-of-pocket now. At 65, unused HSA funds become a second IRA."

[Example 10]
User: "I got a windfall — $10,000 inheritance. What do I do with it?"
FP: "Follow your priority waterfall:
1. If you have high-APR debt (>10%): pay it down first. Guaranteed return.
2. If no high-APR debt: build/top up emergency fund to 3 months.
3. If emergency fund is full: max IRA for the year ($7,000), put rest in index fund.
4. If all above done: invest in a taxable brokerage account (VTI, VXUS).
Resist the urge to spend it on anything lifestyle-related. This $10K invested at 8%
is $21,589 in 10 years and $100,627 in 30 years."

[Example 11]
User: "What's a good savings rate?"
FP: "Benchmarks:
- 10-15%: decent, you'll retire at ~65
- 20-25%: strong, retire around 55-60
- 40-50%: aggressive FI path, retire in your 40s
- 70%+: extreme FIRE, retire in your 30s
The math is simple: higher savings rate → fewer years working.
Every 1% increase in savings rate shaves months off your working life.
At your current income, going from 15% to 25% savings rate likely gets you
to your FI goal 5-7 years earlier."

[Example 12]
User: "What index funds should I buy?"
FP: "For most people: VTI (Vanguard Total US Market) + VXUS (International) covers everything.
Simple 3-fund: VTI (60%) + VXUS (30%) + BND (10% bonds if conservative).
In a 401k: pick the lowest expense-ratio S&P 500 or total market fund available.
In a Roth IRA: VTI/VOO at Vanguard, Fidelity, or Schwab (all offer commission-free ETFs).
Expense ratios matter: 0.03% vs 1.0% = $80K difference on $100K over 30 years.
Note: this is general education, not personalized investment advice. Consult a fee-only fiduciary for personalized guidance."

[Example 13]
User: "How much house can I afford?"
FP: "Rules of thumb:
- Purchase price: max 3-4x gross annual income (conservative: 2.5-3x)
- Monthly PITI payment: max 28% of gross monthly income
- Total debt payments (including mortgage): max 36% DTI
At $5,500/mo gross: max monthly payment = $1,540 (28%). At 7% rate + 20% down,
that supports roughly a $250K home purchase.
But buying a home when you have high-APR debt is usually the wrong order.
Priority waterfall: clear the high-APR debt first. Then save the down payment."

[Example 14]
User: "What's the best way to build credit?"
FP: "The mechanics:
1. Payment history (35% of score): pay every bill on time, every time. Automate minimums.
2. Credit utilization (30%): keep balances below 10% of limit. Pay in full monthly.
3. Length of history (15%): keep old accounts open even if unused.
4. Credit mix (10%): having a card + loan > just one type.
5. New inquiries (10%): don't apply for multiple cards in a short period.
Fast track: secured credit card → charge small amounts monthly → pay in full.
Score improvement: 60-90 days of on-time, low-utilization behavior shows results."

[Example 15]
User: "I'm thinking about buying Bitcoin. Thoughts?"
FP: "Understand the risk profile before any allocation:
Bitcoin is a high-volatility, speculative asset. 80% drawdowns are historically common.
Rule of thumb for speculation: allocate only what you can afford to lose 100%.
For most people building wealth: priority order is debt payoff → emergency fund → tax-advantaged investing → then speculation with any remaining surplus.
If you have high-APR debt or no emergency fund, crypto allocation doesn't make mathematical sense yet — the debt return is guaranteed, crypto isn't.
If your waterfall priorities are handled and you want crypto exposure: 1-5% max allocation. No individual altcoins unless you deeply understand the technology."
`;
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private perplexity: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.perplexity = new OpenAI({
      apiKey: this.config.get<string>('PERPLEXITY_API_KEY', 'YOUR_KEY_HERE'),
      baseURL: 'https://api.perplexity.ai',
    });
  }

  async chat(userId: string, message: string, conversationHistory: any[]) {
    // Rate limit check
    checkRateLimit(userId);

    // Safety check: validate message isn't empty
    if (!message || message.trim().length === 0) {
      throw new BadRequestException({ error: 'Message cannot be empty', code: 'EMPTY_MESSAGE' });
    }

    // Build user context
    const userContext = await this.buildUserContext(userId);

    const systemPrompt = buildFinanceCoachSystemPrompt(userContext);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    try {
      const response = await this.perplexity.chat.completions.create({
        model: 'sonar',
        messages: messages as any,
        temperature: 0.6, // Slightly lower for financial precision
        max_tokens: 600,
      });

      const reply = response.choices[0]?.message?.content || 'Unable to generate response.';
      return { reply, model: 'sonar' };
    } catch (error: any) {
      this.logger.error(`AI chat error: ${error.message}`);
      // Graceful degradation — return an error message rather than crashing
      throw new BadRequestException({
        error: 'AI service temporarily unavailable. Please try again.',
        code: 'AI_ERROR',
      });
    }
  }

  async buildUserContext(userId: string) {
    const [profile, accounts, recentEODs] = await Promise.all([
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
        take: 3,
      }),
    ]);

    if (!profile) return { profile: null, financials: null };

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
        name: (profile as any).user?.name || 'User',
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
        mood: e.mood,
      })),
    };
  }

  async generateEODInsight(userId: string, eodSubmissionId: string) {
    // SECURITY: scope by user_id so a user can't trigger AI generation on another user's
    // submission or overwrite their ai_insight field with attacker-controlled text.
    const submission = await this.prisma.eODSubmission.findFirst({
      where: { id: eodSubmissionId, user_id: userId },
    });

    if (!submission) return { insight: null };

    const userContext = await this.buildUserContext(userId);

    const prompt = `Based on this EOD submission data, generate ONE sentence of specific, actionable financial insight.
Net worth: $${toN(submission.net_worth_computed).toLocaleString()}
Total debt: $${toN(submission.total_debt_computed).toLocaleString()}
Total assets: $${toN(submission.total_assets_computed).toLocaleString()}
User mood: ${submission.mood || 'not recorded'}/5
User goal: ${userContext.profile?.primary_goal || 'get out of debt'}
Keep it under 30 words. Be direct, specific, and forward-looking.`;

    try {
      const response = await this.perplexity.chat.completions.create({
        model: 'sonar',
        messages: [
          { role: 'system', content: 'You are FP, a financial coach. Generate one short, specific insight sentence.' },
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
    } catch (error: any) {
      this.logger.error(`EOD insight error: ${error.message}`);
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

    const prompt = `You are FP, a financial coach. Generate a 3-paragraph Spending DNA Report for this user's ${month} data.
Format: Paragraph 1: "This is how you spent." Paragraph 2: "This is your biggest leak." Paragraph 3: "One high-impact change."
Keep each paragraph 2-3 sentences. Be direct and specific. Use the user's actual numbers.

User data for ${month}:
- Monthly income: $${monthlyIncome.toLocaleString()}
- Net worth change: ${netWorthChange >= 0 ? '+' : ''}$${Math.round(netWorthChange).toLocaleString()}
- Average total debt: $${Math.round(avgDebt).toLocaleString()}
- Average cash: $${Math.round(avgCash).toLocaleString()}
- Days tracked: ${submissions.length}
- Estimated savings rate: ~${avgSavingsRate}%
- Primary goal: ${profile?.primary_goal || 'debt payoff'}`;

    try {
      const response = await this.perplexity.chat.completions.create({
        model: 'sonar',
        messages: [
          { role: 'system', content: 'You are FP, a financial performance coach. Write direct, personal financial insights.' },
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
    } catch (error: any) {
      this.logger.error(`Spending DNA error: ${error.message}`);
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
