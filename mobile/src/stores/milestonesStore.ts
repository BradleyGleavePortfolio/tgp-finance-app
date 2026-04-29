// Milestones state management — BULLETPROOF
import { create } from 'zustand';
import { milestonesApi } from '../services/api';
import type { MilestoneUnlock } from '../types';
import { MILESTONE_DEFINITIONS } from '../utils/constants';

/** Safely extract an array from any API response shape */
function safeArray<T>(data: unknown, key: string): T[] {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown>)[key];
  if (Array.isArray(inner)) return inner as T[];
  return [];
}

// Loose shape of a single milestone row coming back from the server. We
// only read three fields and tolerate extras / missing fields.
interface RawMilestoneRow {
  key?: unknown;
  unlocked?: unknown;
  unlocked_at?: unknown;
  celebrated?: unknown;
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
  reset: () => void;
}

const initialMilestonesState = {
  unlocked: [] as MilestoneUnlock[],
  pendingCelebration: null as MilestoneUnlock | null,
  isLoading: false,
  error: null as string | null,
};

export const useMilestonesStore = create<MilestonesStore>((set, get) => ({
  ...initialMilestonesState,

  fetchMilestones: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await milestonesApi.getAll();
      const all = safeArray<RawMilestoneRow>(data, 'milestones');
      // Filter to only actually-unlocked, and map field names
      const unlocked: MilestoneUnlock[] = all
        .filter((m) => m.unlocked === true)
        .map((m) => ({
          id: typeof m.key === 'string' ? m.key : '',
          user_id: '',
          milestone_key: typeof m.key === 'string' ? m.key : '',
          unlocked_at: typeof m.unlocked_at === 'string' ? m.unlocked_at : '',
          celebrated: m.celebrated === true,
        }));
      set({ unlocked, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  checkMilestones: async () => {
    try {
      const { data } = await milestonesApi.check();
      // Backend returns string[] of newly unlocked keys
      const rawKeys = Array.isArray(data) ? data : safeArray<unknown>(data, 'new_unlocks');
      const newUnlocks: MilestoneUnlock[] = (rawKeys as unknown[])
        .filter((k): k is string => typeof k === 'string')
        .map((k) => ({
          id: k,
          user_id: '',
          milestone_key: k,
          unlocked_at: new Date().toISOString(),
          celebrated: false,
        }));

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

  reset: () => set(initialMilestonesState),
}));
