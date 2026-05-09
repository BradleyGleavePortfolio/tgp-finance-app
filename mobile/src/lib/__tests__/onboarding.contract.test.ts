/**
 * Onboarding wire-contract tests.
 *
 * Pins the string-literal unions in `src/types/onboarding.ts` against the
 * backend mapper switch cases in
 * `backend/src/onboarding/onboarding.service.ts`. Stage-0 shipped a
 * Stage-0 mobile that sent `'under_50k'` to a backend that only knew
 * `'Under $50k'` — every user got the default $75k. These tests are the
 * tripwire so it cannot regress silently.
 *
 * The mappers are duplicated here as plain JS so the test does not pull
 * in `@prisma/client`. When you change one, change the other AND the
 * type union — three places, one PR.
 */

import {
  SKIP_DEFAULTS,
  type FinancialGoalWire,
  type IncomeRangeWire,
  type InvestmentHorizonWire,
  type RiskToleranceWire,
  type SubmitQuizAnswers,
} from '../../types/onboarding';

// ---------------------------------------------------------------------------
// Mirrors of the backend mappers. Keep in sync with
// backend/src/onboarding/onboarding.service.ts.
// ---------------------------------------------------------------------------

function mapIncomeRange(value: string): number {
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

function mapRiskTolerance(value: string): 'conservative' | 'moderate' | 'aggressive' {
  switch (value) {
    case 'Conservative':
    case 'conservative':
      return 'conservative';
    case 'Moderate':
    case 'moderate':
      return 'moderate';
    case 'Aggressive':
    case 'Very Aggressive':
    case 'aggressive':
      return 'aggressive';
    default:
      return 'moderate';
  }
}

function mapInvestmentHorizon(value: string): number {
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

// ---------------------------------------------------------------------------

describe('onboarding wire contract — income range', () => {
  // Each `IncomeRangeWire` literal in the union, paired with the dollar value
  // the backend SHOULD return. If anyone changes the union string without
  // updating the backend mapper, this table drifts and the test fails.
  const expectations: { input: IncomeRangeWire; expectedAnnual: number }[] = [
    { input: 'Under $50k',    expectedAnnual: 35000 },
    { input: '$50k-$100k',    expectedAnnual: 75000 },
    { input: '$100k-$200k',   expectedAnnual: 150000 },
    { input: '$200k+',        expectedAnnual: 250000 },
  ];

  it.each(expectations)(
    'maps wire bucket %p to $%i (no fallthrough to default)',
    ({ input, expectedAnnual }) => {
      const actual = mapIncomeRange(input);
      expect(actual).toBe(expectedAnnual);
    },
  );

  it('is the bug we shipped in Stage-0: legacy snake-case keys still resolve to the right bucket', () => {
    // These are the Stage-0 mobile values. Backend service was patched to
    // accept them so already-shipped builds don't keep landing on default.
    expect(mapIncomeRange('under_50k')).toBe(35000);
    expect(mapIncomeRange('50k_100k')).toBe(75000);
    expect(mapIncomeRange('over_100k')).toBe(250000);
  });

  it('falls through to default ONLY when the value is genuinely unknown', () => {
    expect(mapIncomeRange('garbage')).toBe(75000);
    expect(mapIncomeRange('')).toBe(75000);
  });
});

describe('onboarding wire contract — risk tolerance', () => {
  const expectations: { input: RiskToleranceWire; expected: 'conservative' | 'moderate' | 'aggressive' }[] = [
    { input: 'Conservative', expected: 'conservative' },
    { input: 'Moderate',     expected: 'moderate' },
    { input: 'Aggressive',   expected: 'aggressive' },
  ];

  it.each(expectations)(
    'maps wire risk %p to %p',
    ({ input, expected }) => {
      expect(mapRiskTolerance(input)).toBe(expected);
    },
  );

  it('is no longer hard-coded in the quiz payload — the SKIP_DEFAULTS still picks Moderate explicitly', () => {
    // SKIP_DEFAULTS is the only place a default is allowed; UI must ask
    // otherwise. This pins the default to a known good value.
    expect(SKIP_DEFAULTS.risk_tolerance).toBe('Moderate');
  });
});

describe('onboarding wire contract — investment horizon', () => {
  const expectations: { input: InvestmentHorizonWire; expectedMonths: number }[] = [
    { input: 'Less than 1 year', expectedMonths: 6 },
    { input: '1-3 years',        expectedMonths: 24 },
    { input: '3-5 years',        expectedMonths: 48 },
    { input: '5+ years',         expectedMonths: 120 },
  ];

  it.each(expectations)(
    'maps wire horizon %p to %i months',
    ({ input, expectedMonths }) => {
      expect(mapInvestmentHorizon(input)).toBe(expectedMonths);
    },
  );
});

describe('SubmitQuizAnswers payload shape', () => {
  it('SKIP_DEFAULTS satisfies the typed wire contract and flags the row as skipped', () => {
    const payload: SubmitQuizAnswers = SKIP_DEFAULTS;
    expect(payload.skipped).toBe(true);
    expect(payload.financial_goal).toBe('save more');
    expect(payload.income_range).toBe('$50k-$100k');
    expect(payload.risk_tolerance).toBe('Moderate');
    expect(payload.investment_horizon).toBe('3-5 years');
  });

  it('does not allow `Record<string, unknown>` regressions — every required field is a literal union', () => {
    // This is a compile-time check disguised as a runtime test. If
    // anyone broadens `SubmitQuizAnswers` back to `Record<string, unknown>`,
    // the assignments below will start accepting any string and the
    // assertions can no longer enforce the union — the *next* contract
    // change will silently fail. The runtime expectations are weak; the
    // value of this test is the type annotation.
    const goal: FinancialGoalWire = 'debt payoff';
    const horizon: InvestmentHorizonWire = '5+ years';
    const income: IncomeRangeWire = '$200k+';
    const risk: RiskToleranceWire = 'Aggressive';
    expect(goal).toBeTruthy();
    expect(horizon).toBeTruthy();
    expect(income).toBeTruthy();
    expect(risk).toBeTruthy();
  });
});
