// Net worth history state management — BULLETPROOF
import { create } from 'zustand';
import { networthApi } from '../services/api';
import type { NetWorthHistory } from '../types';

// staleTime: see accountsStore for the rationale. Net worth history is the
// heaviest call we make (90 days of submissions); de-duping rapid mounts
// matters more here than for any other store.
const STALE_TIME_MS = 30 * 1000;

/** Safely extract an array from any API response shape */
function safeArray<T>(data: unknown, key: string): T[] {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown>)[key];
  if (Array.isArray(inner)) return inner as T[];
  return [];
}

/** Safe number — never let NaN propagate */
function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

interface NetWorthStore {
  history: NetWorthHistory[];
  currentNetWorth: number;
  previousNetWorth: number;
  isLoading: boolean;
  error: string | null;
  lastHistoryFetched: number | null;
  lastHistoryDays: number | null;
  lastCurrentFetched: number | null;

  fetchHistory: (days?: number, opts?: { force?: boolean }) => Promise<void>;
  fetchCurrent: (opts?: { force?: boolean }) => Promise<void>;
  setCurrentNetWorth: (value: number) => void;
  reset: () => void;
}

const initialNetWorthState = {
  history: [] as NetWorthHistory[],
  currentNetWorth: 0,
  previousNetWorth: 0,
  isLoading: false,
  error: null as string | null,
  lastHistoryFetched: null as number | null,
  lastHistoryDays: null as number | null,
  lastCurrentFetched: null as number | null,
};

export const useNetWorthStore = create<NetWorthStore>((set, get) => ({
  ...initialNetWorthState,

  fetchHistory: async (days = 90, opts?: { force?: boolean }) => {
    const { isLoading, lastHistoryFetched, lastHistoryDays } = get();
    if (!opts?.force) {
      if (isLoading) return;
      if (
        lastHistoryFetched &&
        lastHistoryDays === days &&
        Date.now() - lastHistoryFetched < STALE_TIME_MS
      ) {
        return;
      }
    }
    set({ isLoading: true, error: null });
    try {
      const { data } = await networthApi.getHistory(days);
      const history: NetWorthHistory[] = safeArray(data, 'history');

      // Compute previous (yesterday's) net worth for change indicator
      const sorted = [...history].sort((a, b) => {
        try {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        } catch {
          return 0;
        }
      });
      const current = safeNum(sorted[0]?.net_worth);
      const previous = safeNum(sorted[1]?.net_worth, current);

      set({
        history,
        currentNetWorth: current,
        previousNetWorth: previous,
        isLoading: false,
        lastHistoryFetched: Date.now(),
        lastHistoryDays: days,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load net worth history';
      set({ isLoading: false, error: message });
    }
  },

  fetchCurrent: async (opts?: { force?: boolean }) => {
    const { lastCurrentFetched } = get();
    if (!opts?.force && lastCurrentFetched && Date.now() - lastCurrentFetched < STALE_TIME_MS) {
      return;
    }
    try {
      const { data } = await networthApi.getCurrent();
      if (data && typeof data === 'object') {
        set({
          currentNetWorth: safeNum(data.net_worth),
          previousNetWorth: safeNum(data.previous_net_worth, get().currentNetWorth),
          lastCurrentFetched: Date.now(),
        });
      }
    } catch {
      // Silent failure - use cached value
    }
  },

  setCurrentNetWorth: (value) => {
    const safe = safeNum(value);
    set((state) => ({ previousNetWorth: state.currentNetWorth, currentNetWorth: safe }));
  },

  reset: () => set(initialNetWorthState),
}));
