// Priority waterfall state management
import { create } from 'zustand';
import { prioritiesApi } from '../services/api';
import type { Priority } from '../types';
import { PRIORITY_WATERFALL } from '../utils/constants';

interface PriorityStore {
  currentPriority: Priority | null;
  allPriorities: Priority[];
  currentIndex: number;
  isLoading: boolean;
  error: string | null;

  fetchCurrent: () => Promise<void>;
  fetchAll: () => Promise<void>;
}

export const usePriorityStore = create<PriorityStore>((set) => ({
  currentPriority: null,
  allPriorities: [],
  currentIndex: 0,
  isLoading: false,
  error: null,

  fetchCurrent: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await prioritiesApi.getCurrent();
      const priority: Priority = data.priority || data;
      set({ currentPriority: priority, currentIndex: priority.index, isLoading: false });
    } catch (err: unknown) {
      // Fall back to local waterfall definition if API unavailable
      const fallback: Priority = {
        ...PRIORITY_WATERFALL[0],
        isComplete: false,
        progressPercent: 0,
      };
      set({ currentPriority: fallback, isLoading: false });
    }
  },

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await prioritiesApi.getAll();
      set({ allPriorities: data.priorities || data, isLoading: false });
    } catch (err: unknown) {
      // Fall back to full waterfall list
      const fallback = PRIORITY_WATERFALL.map((p) => ({
        ...p,
        isComplete: false,
        progressPercent: 0,
      }));
      set({ allPriorities: fallback, isLoading: false });
    }
  },
}));
