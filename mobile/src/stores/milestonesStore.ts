// Milestones state management — BULLETPROOF
import { create } from 'zustand';
import { milestonesApi } from '../services/api';
import type { MilestoneUnlock } from '../types';
import { MILESTONE_DEFINITIONS } from '../utils/constants';

/** Safely extract an array from any API response shape */
function safeArray<T>(data: any, key: string): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data[key] && Array.isArray(data[key])) return data[key];
  return [];
}

interface MilestonesStore {
  unlocked: MilestoneUnlock[];
  pendingCelebration: MilestoneUnlock | null;
  isLoading: boolean;
  error: string | null;

  fetchMilestones: () => Promise<void>;
  checkMilestones: () => Promise<MilestoneUnlock[]>;
  dismissCelebration: () => void;
  isUnlocked: (key: string) => boolean;
}

export const useMilestonesStore = create<MilestonesStore>((set, get) => ({
  unlocked: [],
  pendingCelebration: null,
  isLoading: false,
  error: null,

  fetchMilestones: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await milestonesApi.getAll();
      const unlocked = safeArray<MilestoneUnlock>(data, 'milestones');
      set({ unlocked, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  checkMilestones: async () => {
    try {
      const { data } = await milestonesApi.check();
      const newUnlocks: MilestoneUnlock[] = safeArray(data, 'new_unlocks');

      if (newUnlocks.length > 0) {
        set((state) => ({
          unlocked: [...(Array.isArray(state.unlocked) ? state.unlocked : []), ...newUnlocks],
          pendingCelebration: newUnlocks[0],
        }));
      }

      return newUnlocks;
    } catch {
      return [];
    }
  },

  dismissCelebration: () => set({ pendingCelebration: null }),

  isUnlocked: (key) => {
    const unlocked = get().unlocked;
    return Array.isArray(unlocked) ? unlocked.some((m) => m?.milestone_key === key) : false;
  },
}));
