import { create } from 'zustand';
import { eodApi } from '../services/api';

interface EodSubmission {
  id: string;
  submission_date: string;
  mood: number;
  account_snapshots: { account_id: string; balance: number }[];
  habits_checked: string[];
  notes?: string;
  createdAt: string;
}

interface EodState {
  todaySubmission: EodSubmission | null;
  history: EodSubmission[];
  isLoading: boolean;
  error: string | null;

  fetchToday: () => Promise<void>;
  submitToday: (data: {
    submission_date: string;
    account_snapshots: { account_id: string; balance: number }[];
    mood?: number;
    notes?: string;
    habits_checked: string[];
  }) => Promise<any>;
  fetchHistory: (limit?: number) => Promise<void>;
  reset: () => void;
}

const initialEodState = {
  todaySubmission: null as EodSubmission | null,
  history: [] as EodSubmission[],
  isLoading: false,
  error: null as string | null,
};

export const useEODStore = create<EodState>((set) => ({
  ...initialEodState,

  fetchToday: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await eodApi.getToday();
      set({ todaySubmission: data.submission !== undefined ? data.submission : data });
    } catch (error) {
      const e = error as { response?: { status?: number; data?: { message?: unknown } } };
      if (e.response?.status !== 404) {
        const msg = typeof e.response?.data?.message === 'string'
          ? e.response.data.message
          : "Failed to fetch today's check-in";
        set({ error: msg });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  submitToday: async (submissionData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await eodApi.submitToday(submissionData);
      const result = data.submission || data;
      set({ todaySubmission: result, isLoading: false });
      return result;
    } catch (error) {
      const e = error as { response?: { data?: { message?: unknown } } };
      const msg = typeof e.response?.data?.message === 'string'
        ? e.response.data.message
        : 'Failed to submit check-in';
      set({ error: msg, isLoading: false });
      throw error;
    }
  },

  fetchHistory: async (limit?: number) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await eodApi.getHistory(limit);
      set({ history: data.submissions || data, isLoading: false });
    } catch (error) {
      const e = error as { response?: { data?: { message?: unknown } } };
      const msg = typeof e.response?.data?.message === 'string'
        ? e.response.data.message
        : 'Failed to fetch check-in history';
      set({ error: msg, isLoading: false });
    }
  },

  reset: () => set(initialEodState),
}));
