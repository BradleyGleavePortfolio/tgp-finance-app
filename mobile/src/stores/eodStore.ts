import { create } from 'zustand';
import { eodApi } from '../services/api';

interface EodSubmission {
  id: string;
  date: string;
  mood: number;
  accomplishments: string[];
  challenges: string[];
  notes?: string;
  createdAt: string;
}

interface EodState {
  todaySubmission: EodSubmission | null;
  history: EodSubmission[];
  isLoading: boolean;
  error: string | null;

  fetchToday: () => Promise<void>;
  submitToday: (data: Omit<EodSubmission, 'id' | 'date' | 'createdAt'>) => Promise<void>;
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
      set({ todaySubmission: data.submission || data, isLoading: false });
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
