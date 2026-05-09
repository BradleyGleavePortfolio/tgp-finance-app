/**
 * Reconciler tests — Stage-1.
 *
 * The reconciler retries a quiz POST on next app open when the device
 * has stored answers but the backend still reports onboarding incomplete.
 * The Stage-0 skip path bypassed `submitQuiz` entirely; the reconciler
 * is the safety net that catches both that legacy state AND any new
 * network-failure on the celebration screen.
 */

const mockStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStore[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete mockStore[key];
      return Promise.resolve();
    }),
  },
}));

const mockSubmitQuiz = jest.fn();
jest.mock('../../services/api', () => ({
  onboardingApi: {
    submitQuiz: (...args: unknown[]) => mockSubmitQuiz(...args),
    getStatus: jest.fn(),
  },
}));

import { reconcileOnboarding } from '../onboardingReconcile';
import type { SubmitQuizAnswers } from '../../types/onboarding';

const VALID_ANSWERS: SubmitQuizAnswers = {
  financial_goal: 'debt payoff',
  income_range: '$50k-$100k',
  risk_tolerance: 'Moderate',
  investment_horizon: '3-5 years',
};

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockSubmitQuiz.mockReset();
});

describe('reconcileOnboarding', () => {
  it('returns early when backend says onboarding is already complete', async () => {
    mockStore.quiz_answers = JSON.stringify(VALID_ANSWERS);
    const result = await reconcileOnboarding({ backendOnboardingComplete: true });
    expect(result.resubmitted).toBe(false);
    expect(result.reason).toBe('backend_already_complete');
    expect(mockSubmitQuiz).not.toHaveBeenCalled();
  });

  it('retries the POST when backend is incomplete and local answers are valid', async () => {
    mockStore.quiz_answers = JSON.stringify(VALID_ANSWERS);
    mockSubmitQuiz.mockResolvedValueOnce({ data: { success: true } });

    const result = await reconcileOnboarding({ backendOnboardingComplete: false });

    expect(result.resubmitted).toBe(true);
    expect(mockSubmitQuiz).toHaveBeenCalledTimes(1);
    expect(mockSubmitQuiz).toHaveBeenCalledWith(VALID_ANSWERS);
  });

  it('re-POSTs SKIP_DEFAULTS when the user originally skipped (skipped:true flag)', async () => {
    const skippedAnswers: SubmitQuizAnswers = { ...VALID_ANSWERS, skipped: true };
    mockStore.quiz_answers = JSON.stringify(skippedAnswers);
    mockSubmitQuiz.mockResolvedValueOnce({ data: { success: true } });

    const result = await reconcileOnboarding({ backendOnboardingComplete: false });

    expect(result.resubmitted).toBe(true);
    // The full skipped payload should be forwarded so the backend can
    // tag the row appropriately for analytics / re-prompt logic.
    expect(mockSubmitQuiz.mock.calls[0][0]).toMatchObject({ skipped: true });
  });

  it('returns no_local_answers when the storage blob is missing', async () => {
    const result = await reconcileOnboarding({ backendOnboardingComplete: false });
    expect(result.resubmitted).toBe(false);
    expect(result.reason).toBe('no_local_answers');
    expect(mockSubmitQuiz).not.toHaveBeenCalled();
  });

  it('returns no_local_answers when the legacy `{skipped: "true"}` blob is present (refuses to reconstruct unknown answers)', async () => {
    // Pre-Stage-1 mobile wrote the literal string 'true' into `skipped`.
    // We can't recover the user's actual answers from this — refuse to
    // POST defaults over what might be an existing real profile row.
    mockStore.quiz_answers = JSON.stringify({ skipped: 'true' });
    const result = await reconcileOnboarding({ backendOnboardingComplete: false });
    expect(result.resubmitted).toBe(false);
    expect(result.reason).toBe('no_local_answers');
    expect(mockSubmitQuiz).not.toHaveBeenCalled();
  });

  it('returns no_local_answers when stored values are not valid wire strings', async () => {
    mockStore.quiz_answers = JSON.stringify({
      financial_goal: 'something_random',
      income_range: 'under_50k',  // legacy snake-case — backend accepts it
                                  // but the reconciler keeps the wire union
                                  // strict so we don't accidentally re-send
                                  // legacy data after a corrupted upgrade.
      risk_tolerance: 'Moderate',
      investment_horizon: '3-5 years',
    });
    const result = await reconcileOnboarding({ backendOnboardingComplete: false });
    expect(result.resubmitted).toBe(false);
    expect(result.reason).toBe('no_local_answers');
  });

  it('returns submit_failed when the API throws', async () => {
    mockStore.quiz_answers = JSON.stringify(VALID_ANSWERS);
    mockSubmitQuiz.mockRejectedValueOnce(new Error('network'));

    const result = await reconcileOnboarding({ backendOnboardingComplete: false });

    expect(result.resubmitted).toBe(false);
    expect(result.reason).toBe('submit_failed');
  });
});
