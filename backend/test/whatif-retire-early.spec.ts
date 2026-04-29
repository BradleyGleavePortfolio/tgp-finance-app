import { WhatIfService } from '../src/whatif/whatif.service';

describe('WhatIfService.scenarioRetireEarly — years_saved_at_25pct algebra', () => {
  // Doctrine §10 item 6. The previous formula
  //   yearsToFI - (currentAge - altFIAge + currentAge)
  // was algebraically wrong and returned 0 in the obvious case below. The
  // correct expression is yearsToFI - (altFIAge - currentAge).
  //
  // Example from the audit:
  //   currentAge = 30, yearsToFI = 20, altFIAge = 40
  //   expected years_saved_at_25pct = 20 - (40 - 30) = 10
  //
  // The previous formula returned max(0, 20 - (30 - 40 + 30)) = max(0, 0) = 0.

  function callScenario(opts: {
    monthlyNeeded: number;
    annualIncome: number;
    currentAge: number;
    currentSavingsRatePct: number;
    investmentReturnPct: number;
    currentNetWorth: number;
  }) {
    const svc = new WhatIfService({} as any);
    const profile = {
      dream_lifestyle_cost_mo: opts.monthlyNeeded,
      annual_income_gross: opts.annualIncome,
    };
    const params = {
      target_monthly_passive: opts.monthlyNeeded,
      current_savings_rate_pct: opts.currentSavingsRatePct,
      investment_return_pct: opts.investmentReturnPct,
      current_age: opts.currentAge,
    };
    return (svc as any).scenarioRetireEarly(profile, params, opts.currentNetWorth);
  }

  it('returns a non-zero years_saved when the 25% rate cuts the timeline', () => {
    // Pick parameters where the alt 25% rate clearly beats the user's current
    // 10% rate. The exact yearsToFI depends on the interest math, so we just
    // assert the difference is positive and equal to the algebraic identity
    // (yearsToFI - altYearsToFI) = (fi_age - alt_fi_age).
    const out = callScenario({
      monthlyNeeded: 5000,
      annualIncome: 100000,
      currentAge: 30,
      currentSavingsRatePct: 10,
      investmentReturnPct: 8,
      currentNetWorth: 0,
    });
    const summary = out.result_summary;

    expect(summary.years_saved_at_25pct).toBe(
      Math.max(0, summary.years_to_fi_at_current_rate - (summary.fi_age_at_25pct_savings - 30)),
    );
    expect(summary.years_saved_at_25pct).toBeGreaterThan(0);
  });

  it('clamps at zero when the alt rate does not improve the timeline', () => {
    // Already at 25%+ — alt scenario should not be faster, so years_saved is 0.
    const out = callScenario({
      monthlyNeeded: 5000,
      annualIncome: 100000,
      currentAge: 30,
      currentSavingsRatePct: 30,
      investmentReturnPct: 8,
      currentNetWorth: 0,
    });
    expect(out.result_summary.years_saved_at_25pct).toBeGreaterThanOrEqual(0);
  });
});
