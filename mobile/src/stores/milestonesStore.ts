// Milestones state management
import { create } from 'zustand';
import { milestonesApi } from '../services/api';
import type { MilestoneUnlock } from '../types';
import { MILESTONE_DEFINITIONS } from '../utils/constants';

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
      set({ unlocked: data.milestones || data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  checkMilestones: async () => {
    try {
      const { data } = await milestonesApi.check();
      const newUnlocks: MilestoneUnlock[] = data.new_unlocks || [];

      if (newUnlocks.length > 0) {
        set((state) => ({
          unlocked: [...state.unlocked, ...newUnlocks],
          pendingCelebration: newUnlocks[0], // Show first uncelebrated milestone
        }));
      }

      return newUnlocks;
    } catch {
      return [];
    }
  },

  dismissCelebration: () => set({ pendingCelebration: null }),

  isUnlocked: (key) => get().unlocked.some((m) => m.milestone_key === key),
}));
