// Stage-1 fix tripwires for onboarding mappers + payload persistence.
//
// Stage-0 shipped a service whose `mapIncomeRange` switch was keyed on
// display strings ('Under $50k') while the mobile quiz sent snake_case
// keys ('under_50k'). Every quiz fell through to the default 75 000 → all
// projections used the same income for every user. These tests pin the
// post-fix mapper behaviour so that bug cannot return.
//
// We don't import `@prisma/client` here (the runtime is not loaded in the
// test env); we construct a mock client whose `financialProfile.upsert`
// captures whatever shape the service tries to write. Decimal arithmetic
// is verified through `Prisma.Decimal` returned by the test client mock.

import { Prisma } from '@prisma/client';
import { OnboardingService } from '../src/onboarding/onboarding.service';

function makePrisma() {
  const upsert = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn().mockResolvedValue(null);
  return {
    upsert,
    findUnique,
    prisma: {
      financialProfile: { upsert, findUnique },
    } as any,
  };
}

describe('OnboardingService.submitQuiz — Stage-1 contract', () => {
  it('maps the new wire bucket strings (e.g. "$50k-$100k") to a non-default annual income', async () => {
    const { prisma, upsert } = makePrisma();
    const svc = new OnboardingService(prisma);

    await svc.submitQuiz('user-1', {
      risk_tolerance: 'Moderate',
      investment_horizon: '3-5 years',
      financial_goal: 'save more',
      income_range: '$100k-$200k',
    });

    const args = upsert.mock.calls[0][0];
    // Backend persists Decimal — toString avoids precision-equality games.
    expect(String(args.create.annual_income_gross)).toBe('150000');
    // Monthly = 150 000 / 12 = 12 500 → rounded to 2dp.
    expect(String(args.create.monthly_income_gross)).toBe('12500');
  });

  it('still accepts Stage-0 legacy snake_case keys so already-shipped mobile builds resolve correctly', async () => {
    const { prisma, upsert } = makePrisma();
    const svc = new OnboardingService(prisma);

    await svc.submitQuiz('legacy-user', {
      risk_tolerance: 'Moderate',
      investment_horizon: '3-5 years',
      financial_goal: 'debt payoff',
      income_range: 'over_100k',
    });

    const args = upsert.mock.calls[0][0];
    expect(String(args.create.annual_income_gross)).toBe('250000');
  });

  it('prefers monthly_take_home when present and grosses up by 0.75', async () => {
    const { prisma, upsert } = makePrisma();
    const svc = new OnboardingService(prisma);

    // 7 500 take-home → 10 000 gross monthly → 120 000 annual.
    await svc.submitQuiz('user-2', {
      risk_tolerance: 'Aggressive',
      investment_horizon: '5+ years',
      financial_goal: 'build wealth',
      income_range: '$50k-$100k',
      monthly_take_home: new Prisma.Decimal('7500.00'),
    });

    const args = upsert.mock.calls[0][0];
    expect(String(args.create.monthly_income_gross)).toBe('10000');
    expect(String(args.create.annual_income_gross)).toBe('120000');
  });

  it('normalises primary_goal to lowercase so identityTitle.includes("debt") substring matching works', async () => {
    const { prisma, upsert } = makePrisma();
    const svc = new OnboardingService(prisma);

    await svc.submitQuiz('user-3', {
      risk_tolerance: 'Moderate',
      investment_horizon: '3-5 years',
      financial_goal: '  Debt Payoff ',
      income_range: '$50k-$100k',
    });

    const args = upsert.mock.calls[0][0];
    expect(args.create.primary_goal).toBe('debt payoff');
  });

  it('marks onboarding_complete on the upserted row', async () => {
    const { prisma, upsert } = makePrisma();
    const svc = new OnboardingService(prisma);

    await svc.submitQuiz('user-4', {
      risk_tolerance: 'Conservative',
      investment_horizon: '1-3 years',
      financial_goal: 'save more',
      income_range: 'Under $50k',
    });

    const args = upsert.mock.calls[0][0];
    expect(args.create.onboarding_complete).toBe(true);
    expect(args.update.onboarding_complete).toBe(true);
  });
});
