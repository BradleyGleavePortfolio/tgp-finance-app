// EOD daily check-in state management
import { create } from 'zustand';
import { eodApi } from '../services/api';
import type { EODSubmission, AccountSnapshot, HabitEntry } from '../types';

interface EODStore {
  submissions: EODSubmission[];
  todaySubmission: EODSubmission | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  submitSuccess: boolean;
  latestInsight: string | null;

  fetchHistory: (days?: number) => Promise<void>;
  fetchToday: () => Promise<void>;
  submitEOD: (data: {
    account_snapshots: AccountSnapshot[];
    mood?: number;
    notes?: string;
    habits?: HabitEntry[];
  }) => Promise<EODSubmission>;
  clearSuccess: () => void;
  clearError: () => void;
}

export const useEODStore = create<EODStore>((set, get) => ({
  submissions: [],
  todaySubmission: null,
  isLoading: false,
  isSubmitting: false,
  error: null,
  submitSuccess: false,
  latestInsight: null,

  fetchHistory: async (days = 30) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await eodApi.getHistory(days);
      set({ submissions: data.submissions || data, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load EOD history';
      set({ isLoading: false, error: message });
    }
  },

  fetchToday: async () => {
    try {
      const { data } = await eodApi.getToday();
      set({ todaySubmission: data.submission || data });
    } catch {
      set({ todaySubmission: null });
    }
  },

  submitEOD: async (submissionData) => {
    set({ isSubmitting: true, error: null });
    try {
      const { data } = await eodApi.submit(submissionData);
      const submission: EODSubmission = data.submission || data;

      set((state) => ({
        submissions: [submission, ...state.submissions],
        todaySubmission: submission,
        isSubmitting: false,
        submitSuccess: true,
        latestInsight: submission.ai_insight || null,
      }));

      return submission;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit EOD';
      set({ isSubmitting: false, error: message });
      throw err;
    }
  },

  clearSuccess: () => set({ submitSuccess: false }),
  clearError: () => set({ error: null }),
}));
