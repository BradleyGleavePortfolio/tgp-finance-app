import { create } from 'zustand';
import { eodApi, type EODSubmissionResponse } from '../services/api';

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
  // Sprint A audit fix H-3: replace `Promise<any>` with the typed
  // EODSubmissionResponse so the screen consumes a typed result
  // instead of `useState<any>`.
  submitToday: (data: {
    submission_date: string;
    account_snapshots: { account_id: string; balance: number }[];
    mood?: number;
    notes?: string;
    habits_checked: string[];
  }) => Promise<EODSubmissionResponse>;
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
      // Hydrate the local todaySubmission from whichever shape the
      // server returned. The local EodSubmission type was always a
      // best-effort projection; we keep the behaviour but stop using
      // `any` at the boundary.
      const flat = data.submission as unknown as EodSubmission | undefined;
      const inline = data as unknown as EodSubmission;
      set({ todaySubmission: flat ?? inline, isLoading: false });
      return data;
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
