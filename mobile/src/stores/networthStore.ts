// Net worth history state management — BULLETPROOF
import { create } from 'zustand';
import { networthApi } from '../services/api';
import type { NetWorthHistory } from '../types';

/** Safely extract an array from any API response shape */
function safeArray<T>(data: any, key: string): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data[key] && Array.isArray(data[key])) return data[key];
  return [];
}

/** Safe number — never let NaN propagate */
function safeNum(v: any, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

interface NetWorthStore {
  history: NetWorthHistory[];
  currentNetWorth: number;
  previousNetWorth: number;
  isLoading: boolean;
  error: string | null;

  fetchHistory: (days?: number) => Promise<void>;
  fetchCurrent: () => Promise<void>;
  setCurrentNetWorth: (value: number) => void;
  reset: () => void;
}

const initialNetWorthState = {
  history: [] as NetWorthHistory[],
  currentNetWorth: 0,
  previousNetWorth: 0,
  isLoading: false,
  error: null as string | null,
};

export const useNetWorthStore = create<NetWorthStore>((set, get) => ({
  ...initialNetWorthState,

  fetchHistory: async (days = 90) => {
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

      set({ history, currentNetWorth: current, previousNetWorth: previous, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load net worth history';
      set({ isLoading: false, error: message });
    }
  },

  fetchCurrent: async () => {
    try {
      const { data } = await networthApi.getCurrent();
      if (data && typeof data === 'object') {
        set({
          currentNetWorth: safeNum(data.net_worth),
          previousNetWorth: safeNum(data.previous_net_worth, get().currentNetWorth),
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
