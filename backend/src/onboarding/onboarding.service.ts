import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RiskTolerance } from '@prisma/client';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async submitQuiz(userId: string, answers: Record<string, string>) {
    const riskTolerance = this.mapRiskTolerance(answers.risk_tolerance);
    const goalTimelineMonths = this.mapInvestmentHorizon(answers.investment_horizon);
    const annualIncomeGross = this.mapIncomeRange(answers.income_range);

    // Use exact income if provided, otherwise fall back to range estimate
    const exactTakeHome = answers.monthly_take_home ? parseFloat(answers.monthly_take_home) : null;
    const monthlyIncomeGross = exactTakeHome
      ? Math.round(exactTakeHome / 0.75)
      : Math.round(annualIncomeGross / 12);
    const annualFinal = exactTakeHome
      ? monthlyIncomeGross * 12
      : annualIncomeGross;

    const dreamFields = {
      dream_lifestyle_cost_mo: answers.monthly_dream_cost ? parseFloat(answers.monthly_dream_cost) : undefined,
      dream_description: answers.dream_description || undefined,
      future_self_letter: answers.future_self_letter || undefined,
    };

    await this.prisma.financialProfile.upsert({
      where: { user_id: userId },
      update: {
        risk_tolerance: riskTolerance,
        primary_goal: answers.financial_goal,
        annual_income_gross: annualFinal,
        monthly_income_gross: monthlyIncomeGross,
        goal_timeline_months: goalTimelineMonths,
        onboarding_complete: true,
        updated_at: new Date(),
        ...dreamFields,
      },
      create: {
        user_id: userId,
        risk_tolerance: riskTolerance,
        primary_goal: answers.financial_goal,
        annual_income_gross: annualFinal,
        monthly_income_gross: monthlyIncomeGross,
        goal_timeline_months: goalTimelineMonths,
        onboarding_complete: true,
        ...dreamFields,
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
    switch (value) {
      case 'Conservative':
        return RiskTolerance.conservative;
      case 'Moderate':
        return RiskTolerance.moderate;
      case 'Aggressive':
      case 'Very Aggressive':
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
    switch (value) {
      case 'Under $50k':
        return 35000;
      case '$50k-$100k':
        return 75000;
      case '$100k-$200k':
        return 150000;
      case '$200k+':
        return 250000;
      default:
        return 75000;
    }
  }
}
