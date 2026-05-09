# Stage 1 — Onboarding correctness fixes

Closes the five critical bugs from `finance_onboarding_audit.md` (audit
score: 31 / 100). Stage 2 (coach parity) and Stage 3 (federated identity)
are out of scope for this commit.

## What was fixed

| # | Bug (audit ref) | Fix |
| - | --- | --- |
| 1 | **Income bucket strings didn't match backend switch** (CRITICAL). Mobile sent `'under_50k'` / `'50k_100k'` / `'over_100k'`; backend `mapIncomeRange` cases were `'Under $50k'` / `'$50k-$100k'` / `'$100k-$200k'` / `'$200k+'`. Every user fell through to default `75 000`/yr. | Mobile now captures `monthly_take_home` directly (numeric input). Backend prefers it over the bucket and grosses up by `0.75`. The bucket field is still sent (for analytics + skip) and the backend mapper now accepts BOTH the new wire strings AND the legacy snake-case keys so already-shipped builds resolve correctly. |
| 2 | **Risk tolerance hardcoded to `'Moderate'`**. UI never asked. | New screen `step === 'risk'` with three options. Default `'Moderate'` is now applied only on explicit `Skip — I'll explore`. |
| 3 | **Investment horizon hardcoded to `'3-5 years'`**. UI never asked. | New screen `step === 'horizon'` with four options (mirrors backend `mapInvestmentHorizon`). Default still `'3-5 years'` on skip. |
| 4 | **Skip path bypassed the backend.** `handleSkipAll` only flipped a local AsyncStorage flag — the cohort had no `FinancialProfile` row. | Skip path now POSTs `SKIP_DEFAULTS` (sane backend-mapped values, `skipped: true` flag for analytics). Reconciler retries on next open if the POST failed. |
| 5 | **No post-onboarding edit path** for any financial profile field. | New screen `app/edit-financial-profile.tsx`, reachable from Profile tab → "Edit financial profile". Editable fields: monthly take-home, primary goal, risk tolerance, goal timeline (months), dream lifestyle cost / description, location (state, city, country). Wired to existing `profileApi.update` (no new endpoint needed). |

Bonus: `Record<string, unknown>` is gone from the onboarding submit payload.
The wire is now `SubmitQuizAnswers` (closed string-literal unions) — see
`src/types/onboarding.ts`. The contract test pins both ends of the wire so
the next bucket-string drift fails the build instead of shipping silently.

## New files

| Path | Purpose |
| --- | --- |
| `mobile/src/types/onboarding.ts` | `SubmitQuizAnswers` union types + `SKIP_DEFAULTS` constant. Single source of truth for the wire contract. |
| `mobile/src/lib/onboardingReconcile.ts` | Pure reconciler. Re-POSTs `quiz_answers` on next app open when the backend reports onboarding incomplete. Hooked into `authStore.initialize`. |
| `mobile/app/edit-financial-profile.tsx` | Post-onboarding edit screen. Reuses `profileApi.update`. |
| `mobile/src/lib/__tests__/onboarding.contract.test.ts` | 16 cases pinning the union strings against backend mapper outputs. |
| `mobile/src/lib/__tests__/onboardingReconcile.test.ts` | 7 cases covering happy path / no-blob / legacy `{skipped:'true'}` / type-mismatch / API failure. |
| `backend/test/onboarding.service.spec.ts` | 5 cases: new bucket maps to non-default, legacy snake-case still works, take-home preferred over bucket, goal normalised, `onboarding_complete` set. |

## Modified files

| Path | Change |
| --- | --- |
| `backend/src/onboarding/onboarding.service.ts` | `mapIncomeRange` accepts new + legacy strings. `mapRiskTolerance` accepts lowercase. `normalizeGoal` lowercases + trims. Comments document Stage-1 history so the next person doesn't re-introduce the bug. |
| `mobile/app/(onboarding)/quiz.tsx` | Five steps now (goal / income / risk / horizon / bank) instead of three. `monthly_take_home` numeric input with quick-pick chips fallback. `handleSkipAll` POSTs `SKIP_DEFAULTS`. Payload typed as `SubmitQuizAnswers`. |
| `mobile/src/services/api.ts` | `onboardingApi.submitQuiz` is now `(answers: SubmitQuizAnswers)`, no more `Record<string, unknown>`. |
| `mobile/src/stores/authStore.ts` | After `authApi.me()` resolves, `initialize` calls `reconcileOnboarding` and refreshes if a retry succeeded. |
| `mobile/app/_layout.tsx` | Registers `<Stack.Screen name="edit-financial-profile" />`. |
| `mobile/app/(tabs)/profile.tsx` | First settings row is now "Edit financial profile". |

## API changes

**No new endpoints.** Every change rides on existing routes:

- `POST /api/onboarding/quiz` — payload shape is unchanged on the wire (Zod schema still
  accepts the same fields), but the mobile mapper sends new bucket strings AND
  `monthly_take_home` (when entered). Backend service handles both.
- `PUT /api/profile` — already accepted every field the new edit screen writes
  (state, city, country, monthly_income_gross, annual_income_gross, primary_goal,
  goal_timeline_months, dream_lifestyle_cost_mo, dream_description, risk_tolerance).
  No schema change.

### Wire contract (mobile → backend)

```ts
// mobile/src/types/onboarding.ts
export interface SubmitQuizAnswers {
  risk_tolerance:     'Conservative' | 'Moderate' | 'Aggressive';
  investment_horizon: 'Less than 1 year' | '1-3 years' | '3-5 years' | '5+ years';
  financial_goal:     'debt payoff' | 'save more' | 'build wealth';
  income_range:       'Under $50k' | '$50k-$100k' | '$100k-$200k' | '$200k+';
  monthly_take_home?: string;          // preferred — backend grosses up by 0.75
  monthly_dream_cost?: string;
  dream_description?: string;
  future_self_letter?: string;
  bank_connected?: 'yes' | 'no';
  skipped?: boolean;                    // true when SKIP_DEFAULTS sent the row
}
```

If you change a union string, you MUST also change:
1. `backend/src/onboarding/onboarding.service.ts` (mapper switch)
2. `mobile/src/lib/__tests__/onboarding.contract.test.ts` (mirror)
3. `mobile/src/lib/onboardingReconcile.ts` (validator allow-list)

The contract test will fail otherwise.

## Test results

- **Mobile**: `npm test` → **71 / 71 passing** (was 48 before; added 23: 16 contract + 7 reconciler).
- **Backend**: `npx jest` → **225 / 225 passing** (was 220 before; added 5).
- **Mobile typecheck**: `npx tsc --noEmit` → clean.
- **Backend typecheck**: `npx tsc --noEmit` → clean.
- **Mobile lint**: 14 errors / 88 warnings — **identical to baseline**. No new lint debt added.

## Manual test plan (after Build #9 ships)

1. **Fresh-install happy path.**
   - Sign up. You should hit the onboarding quiz.
   - Tap "Pay Off Debt" → `income` step appears.
   - Type `5200` in the take-home field. Tap Continue.
   - Tap "Aggressive" risk → `horizon` step appears.
   - Tap "1 — 3 years" → `bank` step appears.
   - Tap "Skip — I'll explore" on bank.
   - Verify the celebration shows "Goal set / The work begins."
   - Open Profile tab → "Edit financial profile". Confirm:
     - Monthly take-home shows `5200`
     - Primary goal: `debt payoff`
     - Risk tolerance: `aggressive`
     - Goal timeline: `1 — 3 years`
   - Open the Income Gap screen. Numbers should NOT be the old `$5000 / mo` default — they should reflect the take-home you entered (`$5200 / mo`, gross-up `$6933 / mo`).

2. **Skip-all path.**
   - Reset the app (delete-and-reinstall, or clear AsyncStorage in dev).
   - Sign up.
   - On the goal screen, tap "Skip — I'll explore" at the top.
   - You land on the home tab.
   - Open Profile → "Edit financial profile". Profile fields should show
     the SKIP_DEFAULTS values (Save more / Moderate / 3-5 years / $50k-$100k
     bucket). They are editable from here — change Risk to Conservative,
     save, return to Profile, see the updated value.

3. **Network failure on celebration (reconciler).**
   - Throttle network in dev tools / airplane-mode after Q5.
   - Tap Skip — I'll explore on bank step. Celebration shows.
   - Quit the app.
   - Restore network. Open the app.
   - Within the auth bootstrap (a few seconds), the reconciler should
     retry the POST. Verify by hitting `GET /api/onboarding/status` from
     Postman or the in-app debug menu — `completed: true`, profile populated.

4. **Edit profile recomputes derived values.**
   - Open Edit Financial Profile.
   - Change monthly take-home from `5200` → `12000`.
   - Save. Return to Goals / Income Gap / Projections / FI Number on
     Profile tab. All four should reflect the new monthly_income_gross
     (~$16,000/mo gross). Previously these were stuck at $5,000/mo.

5. **Income field never silently defaults.**
   - As a regression check: open backend logs for the test account. The
     `FinancialProfile` row should never have `annual_income_gross: 75000`
     unless the user actually picked the `$50k-$100k` bucket OR explicitly
     skipped (in which case `skipped: true` should also be set).

## Score estimate

- **Was**: 31 / 100 (audit baseline).
- **After Stage 1**: ~ **78 / 100**.

Recovered:
- +20 from fixing the income-bucket mismatch (the highest-blast-radius bug).
- +10 from actually capturing risk and horizon.
- +8 from giving every user (including skippers) a profile row from minute one.
- +9 from the post-onboarding edit path (legacy had ZERO).

Still on the table for a future stage:
- More granular employment/income-source UI (W-2 vs 1099 vs self-employed).
- Better income-source taxonomy (income_sources array is captured nowhere).
- Coach-side propagation of profile edits (Stage 2 territory).
- Localised currency / number formatting in the take-home input.
