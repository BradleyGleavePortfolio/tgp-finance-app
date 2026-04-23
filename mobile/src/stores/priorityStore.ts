import { create } from 'zustand';
import { priorityApi } from '../services/api';
import { Priority } from '../types';

interface PriorityState {
  currentPriority: Priority | null;
  allPriorities: Priority[];
  currentIndex: number;
  isLoading: boolean;
  error: string | null;

  fetchCurrent: () => Promise<void>;
  fetchAll: () => Promise<void>;
  reset: () => void;
}

const initialPriorityState = {
  currentPriority: null as Priority | null,
  allPriorities: [] as Priority[],
  currentIndex: 0,
  isLoading: false,
  error: null as string | null,
};

export const usePriorityStore = create<PriorityState>((set, get) => ({
  ...initialPriorityState,

  fetchCurrent: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await priorityApi.getCurrent();
      const raw = data.current || data.priority || data;
      const priority: Priority = {
        index: raw.index ?? 0,
        title: raw.title || '',
        description: raw.description || '',
        actionItems: raw.actionItems || raw.action_items || [],
        target: raw.target,
        current: raw.current,
        isComplete: raw.isComplete ?? raw.complete ?? false,
        estimatedCompletionDate: raw.estimatedCompletionDate || raw.estimated_completion || undefined,
        progressPercent: raw.progressPercent ?? (typeof raw.progress === 'number' ? Math.round(raw.progress * 100) : 0),
      };
      set({ currentPriority: priority, currentIndex: priority.index, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to fetch priority',
        isLoading: false,
      });
    }
  },

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await priorityApi.getAll();
      const rawPriorities = data.priorities || data;
      const allPriorities = Array.isArray(rawPriorities) ? rawPriorities.map((raw: any) => ({
        index: raw.index ?? 0,
        title: raw.title || '',
        description: raw.description || '',
        actionItems: raw.actionItems || raw.action_items || [],
        target: raw.target,
        current: raw.current,
        isComplete: raw.isComplete ?? raw.complete ?? false,
        estimatedCompletionDate: raw.estimatedCompletionDate || raw.estimated_completion || undefined,
        progressPercent: raw.progressPercent ?? (typeof raw.progress === 'number' ? Math.round(raw.progress * 100) : 0),
      })) : [];
      set({ allPriorities, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to fetch priorities',
        isLoading: false,
      });
    }
  },

  reset: () => set(initialPriorityState),
}));
