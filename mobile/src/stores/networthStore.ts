// Net worth history state management
import { create } from 'zustand';
import { networthApi } from '../services/api';
import type { NetWorthHistory } from '../types';

interface NetWorthStore {
  history: NetWorthHistory[];
  currentNetWorth: number;
  previousNetWorth: number; // yesterday's value for change indicator
  isLoading: boolean;
  error: string | null;

  fetchHistory: (days?: number) => Promise<void>;
  fetchCurrent: () => Promise<void>;
  setCurrentNetWorth: (value: number) => void;
}

export const useNetWorthStore = create<NetWorthStore>((set, get) => ({
  history: [],
  currentNetWorth: 0,
  previousNetWorth: 0,
  isLoading: false,
  error: null,

  fetchHistory: async (days = 90) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await networthApi.getHistory(days);
      const history: NetWorthHistory[] = data.history || data;

      // Compute previous (yesterday's) net worth for change indicator
      const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const current = sorted[0]?.net_worth || 0;
      const previous = sorted[1]?.net_worth || current;

      set({ history, currentNetWorth: current, previousNetWorth: previous, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load net worth history';
      set({ isLoading: false, error: message });
    }
  },

  fetchCurrent: async () => {
    try {
      const { data } = await networthApi.getCurrent();
      set({
        currentNetWorth: data.net_worth || 0,
        previousNetWorth: data.previous_net_worth || get().currentNetWorth,
      });
    } catch {
      // Silent failure - use cached value
    }
  },

  setCurrentNetWorth: (value) => {
    set((state) => ({ previousNetWorth: state.currentNetWorth, currentNetWorth: value }));
  },
}));
