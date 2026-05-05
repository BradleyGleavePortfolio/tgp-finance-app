import { create } from 'zustand';
import { priorityApi } from '../services/api';
import { Priority } from '../types';

// Loose envelope for what the backend returns from /priorities. Both the
// camelCase and snake_case variants are read for legacy compatibility.
interface RawPriority {
  index?: number;
  title?: string;
  description?: string;
  actionItems?: string[];
  action_items?: string[];
  target?: number;
  current?: number;
  isComplete?: boolean;
  complete?: boolean;
  estimatedCompletionDate?: string;
  estimated_completion?: string;
  progressPercent?: number;
  progress?: number;
}

function normalizePriority(raw: RawPriority): Priority {
  return {
    index: raw.index ?? 0,
    title: raw.title || '',
    description: raw.description || '',
    actionItems: raw.actionItems || raw.action_items || [],
    target: raw.target,
    current: raw.current,
    isComplete: raw.isComplete ?? raw.complete ?? false,
    estimatedCompletionDate: raw.estimatedCompletionDate || raw.estimated_completion || undefined,
    progressPercent:
      raw.progressPercent ??
      (typeof raw.progress === 'number' ? Math.round(raw.progress * 100) : 0),
  };
}

function pickMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const e = error as { response?: { data?: { message?: unknown } }; message?: unknown };
    const fromResp = e.response?.data?.message;
    if (typeof fromResp === 'string') return fromResp;
    if (typeof e.message === 'string') return e.message;
  }
  return fallback;
}

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
      const envelope = (data ?? {}) as { current?: RawPriority; priority?: RawPriority } & RawPriority;
      const raw: RawPriority = envelope.current ?? envelope.priority ?? envelope;
      const priority = normalizePriority(raw);
      set({ currentPriority: priority, currentIndex: priority.index, isLoading: false });
    } catch (error) {
      set({
        error: pickMessage(error, 'Failed to fetch priority'),
        isLoading: false,
      });
    }
  },

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await priorityApi.getAll();
      const envelope = (data ?? {}) as { priorities?: RawPriority[] };
      const rawPriorities: RawPriority[] = Array.isArray(envelope.priorities)
        ? envelope.priorities
        : Array.isArray(data)
          ? (data as RawPriority[])
          : [];
      const allPriorities = rawPriorities.map(normalizePriority);
      set({ allPriorities, isLoading: false });
    } catch (error) {
      set({
        error: pickMessage(error, 'Failed to fetch priorities'),
        isLoading: false,
      });
    }
  },

  reset: () => set(initialPriorityState),
}));
