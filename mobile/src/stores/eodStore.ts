import { create } from 'zustand';
import {
  eodApi,
  type EODSubmissionResponse,
  type EODSubmissionRow,
} from '../services/api';

interface EodSubmission {
  id: string;
  submission_date: string;
  mood: number;
  account_snapshots: { account_id: string; balance: number }[];
  habits_checked: string[];
  notes?: string;
  createdAt: string;
}

/**
 * Sprint A audit fix H-3 follow-up. The server-side
 * EODSubmissionResponse / EODSubmissionRow shapes carry mood as a
 * nullable number and use submitted_at instead of createdAt. The
 * local EodSubmission interface predates the typed wire shape, so
 * we normalise here rather than reshaping the store consumers.
 *
 * Returns null when the input is missing the minimum fields the
 * store needs (id + submission_date) — the caller treats null as
 * "do not update todaySubmission".
 */
function normaliseSubmission(
  raw: EODSubmissionResponse | EODSubmissionRow | undefined | null,
): EodSubmission | null {
  if (!raw) return null;
  const row = (raw as EODSubmissionResponse).submission ?? (raw as EODSubmissionRow);
  if (!row || !row.id || !row.submission_date) return null;
  return {
    id: row.id,
    submission_date: row.submission_date,
    mood: row.mood ?? 0,
    account_snapshots: (row.account_snapshots ?? []).map((s) => ({
      account_id: s.account_id,
      balance: s.balance,
    })),
    habits_checked: (row.habits ?? [])
      .filter((h) => h.completed)
      .map((h) => h.habit_key),
    notes: row.notes ?? undefined,
    createdAt: row.submitted_at ?? new Date().toISOString(),
  };
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
      set({ todaySubmission: normaliseSubmission(data) });
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
      // Hydrate the local todaySubmission via the H-3 normaliser so
      // the typed wire shape (mood: number | null, submitted_at)
      // does not leak into the store consumers, which still rely on
      // the historical EodSubmission projection.
      set({ todaySubmission: normaliseSubmission(data), isLoading: false });
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
