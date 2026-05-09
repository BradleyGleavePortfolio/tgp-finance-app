import { Injectable } from '@nestjs/common';
import { Prisma, RiskTolerance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Shape produced by SubmitQuizSchema in common/validators/schemas.ts.
// Money fields arrive as Prisma.Decimal (already coerced + validated by the
// MoneyAmount Zod schema), so this service never touches raw user strings.
type QuizAnswers = {
  risk_tolerance: string;
  investment_horizon: string;
  financial_goal: string;
  income_range: string;
  monthly_take_home?: Prisma.Decimal | null;
  monthly_dream_cost?: Prisma.Decimal | null;
  future_self_letter?: string;
  dream_description?: string;
};

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist the quiz payload onto the user's FinancialProfile row.
   *
   * Stage-1 fix history: the original implementation hard-coded a switch
   * on display strings (`'Under $50k'`) that never matched the snake-case
   * keys mobile actually sent (`'under_50k'`). Every user's annual income
   * landed on the `default → 75 000` branch. The mappers below now accept
   * BOTH the original display strings AND the snake-case keys so legacy
   * mobile builds still work, AND prefer `monthly_take_home` when the new
   * mobile sends it (the gross-up branch — take_home / 0.75 → gross).
   */
  async submitQuiz(userId: string, answers: QuizAnswers) {
    const riskTolerance = this.mapRiskTolerance(answers.risk_tolerance);
    const goalTimelineMonths = this.mapInvestmentHorizon(answers.investment_horizon);
    const annualIncomeGross = this.mapIncomeRange(answers.income_range);

    // Derive monthly/annual income from take-home (Decimal) when present;
    // otherwise fall back to the income-range bucket. All math runs on
    // Decimal — no IEEE-754 drift on $1,234.56-style amounts.
    let monthlyIncomeGross: Prisma.Decimal;
    let annualFinal: Prisma.Decimal;
    if (answers.monthly_take_home && !answers.monthly_take_home.isZero()) {
      // Gross-up assumes ~25% effective tax rate (take-home / 0.75).
      monthlyIncomeGross = answers.monthly_take_home
        .dividedBy(new Prisma.Decimal('0.75'))
        .toDecimalPlaces(2);
      annualFinal = monthlyIncomeGross.times(12);
    } else {
      monthlyIncomeGross = new Prisma.Decimal(annualIncomeGross)
        .dividedBy(12)
        .toDecimalPlaces(2);
      annualFinal = new Prisma.Decimal(annualIncomeGross);
    }

    const dreamCost = answers.monthly_dream_cost ?? undefined;

    await this.prisma.financialProfile.upsert({
      where: { user_id: userId },
      update: {
        risk_tolerance: riskTolerance,
        primary_goal: this.normalizeGoal(answers.financial_goal),
        annual_income_gross: annualFinal,
        monthly_income_gross: monthlyIncomeGross,
        goal_timeline_months: goalTimelineMonths,
        dream_lifestyle_cost_mo: dreamCost,
        dream_description: answers.dream_description || undefined,
        future_self_letter: answers.future_self_letter || undefined,
        onboarding_complete: true,
        updated_at: new Date(),
      },
      create: {
        user_id: userId,
        risk_tolerance: riskTolerance,
        primary_goal: this.normalizeGoal(answers.financial_goal),
        annual_income_gross: annualFinal,
        monthly_income_gross: monthlyIncomeGross,
        goal_timeline_months: goalTimelineMonths,
        dream_lifestyle_cost_mo: dreamCost,
        dream_description: answers.dream_description || undefined,
        future_self_letter: answers.future_self_letter || undefined,
        onboarding_complete: true,
      },
    });

    return { success: true, message: 'Quiz completed' };
  }

  async getStatus(userId: string) {
    const profile = await this.prisma.financialProfile.findUnique({
      where: { user_id: userId },
    });

    return {
      completed: profile?.onboarding_complete ?? false,
      profile: profile ?? null,
    };
  }

  private mapRiskTolerance(value: string): RiskTolerance {
    // Accept title-case (current mobile contract) and lowercase (Prisma
    // enum spelling) so a future mobile change to send the canonical
    // lowercase value does not silently flip everyone to default.
    switch (value) {
      case 'Conservative':
      case 'conservative':
        return RiskTolerance.conservative;
      case 'Moderate':
      case 'moderate':
        return RiskTolerance.moderate;
      case 'Aggressive':
      case 'Very Aggressive':
      case 'aggressive':
        return RiskTolerance.aggressive;
      default:
        return RiskTolerance.moderate;
    }
  }

  private mapInvestmentHorizon(value: string): number {
    switch (value) {
      case 'Less than 1 year':
        return 6;
      case '1-3 years':
        return 24;
      case '3-5 years':
        return 48;
      case '5+ years':
        return 120;
      default:
        return 24;
    }
  }

  private mapIncomeRange(value: string): number {
    // Stage-1 fix: accept both the original display strings AND the
    // snake-case keys legacy mobile builds sent. Any future bucket label
    // must land here AND in `mobile/src/types/onboarding.ts` —
    // `onboarding.contract.test.ts` pins both ends.
    switch (value) {
      case 'Under $50k':
      case 'under_50k':
        return 35000;
      case '$50k-$100k':
      case '$50k - $100k':
      case '50k_100k':
        return 75000;
      case '$100k-$200k':
      case '$100k - $200k':
      case '100k_200k':
        return 150000;
      case '$200k+':
      case 'over_100k':
      case 'over_200k':
        return 250000;
      default:
        return 75000;
    }
  }

  /**
   * Normalize the persisted goal string. The mobile quiz emits lowercase
   * phrases (`'debt payoff'`, `'save more'`, `'build wealth'`); identity-
   * title resolution and the goal-deadline milestone do substring matches
   * (`includes('debt')`, `includes('sav')`), so lowercase is intentional.
   * Trim defensively in case a custom string slips through Zod.
   */
  private normalizeGoal(value: string): string {
    return (value ?? '').trim().toLowerCase();
  }
}
