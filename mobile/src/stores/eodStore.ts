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
}

export const useEODStore = create<EodState>((set) => ({
  todaySubmission: null,
  history: [],
  isLoading: false,
  error: null,

  fetchToday: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await eodApi.getToday();
      set({ todaySubmission: data.submission !== undefined ? data.submission : data });
    } catch (error: any) {
      if (error.response?.status !== 404) {
        set({
          error: error.response?.data?.message || 'Failed to fetch today\'s check-in',
        });
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
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to submit check-in',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchHistory: async (limit?: number) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await eodApi.getHistory(limit);
      set({ history: data.submissions || data, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to fetch check-in history',
        isLoading: false,
      });
    }
  },
}));
