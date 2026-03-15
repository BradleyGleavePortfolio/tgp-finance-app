// What-If scenarios state management
import { create } from 'zustand';
import { whatifApi } from '../services/api';
import type { WhatIfScenario, ScenarioType, ScenarioResult } from '../types';

interface WhatIfStore {
  savedScenarios: WhatIfScenario[];
  currentResult: ScenarioResult | null;
  isRunning: boolean;
  isLoading: boolean;
  error: string | null;

  runScenario: (type: ScenarioType, parameters: Record<string, unknown>) => Promise<ScenarioResult>;
  saveScenario: (scenario: Partial<WhatIfScenario>) => Promise<void>;
  fetchSaved: () => Promise<void>;
  deleteScenario: (id: string) => Promise<void>;
  clearResult: () => void;
  clearError: () => void;
}

export const useWhatIfStore = create<WhatIfStore>((set, get) => ({
  savedScenarios: [],
  currentResult: null,
  isRunning: false,
  isLoading: false,
  error: null,

  runScenario: async (type, parameters) => {
    set({ isRunning: true, error: null, currentResult: null });
    try {
      const { data } = await whatifApi.run(type, parameters);
      const result: ScenarioResult = data.result || data;
      set({ currentResult: result, isRunning: false });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Scenario failed';
      set({ isRunning: false, error: message });
      throw err;
    }
  },

  saveScenario: async (scenario) => {
    try {
      const { data } = await whatifApi.save(scenario as Record<string, unknown>);
      const saved: WhatIfScenario = data.scenario || data;
      set((state) => ({ savedScenarios: [saved, ...state.savedScenarios] }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save scenario';
      set({ error: message });
    }
  },

  fetchSaved: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await whatifApi.getSaved();
      set({ savedScenarios: data.scenarios || data, isLoading: false });
    } catch (err: unknown) {
      set({ isLoading: false });
    }
  },

  deleteScenario: async (id) => {
    try {
      await whatifApi.delete(id);
      set((state) => ({ savedScenarios: state.savedScenarios.filter((s) => s.id !== id) }));
    } catch {
      // Silent failure
    }
  },

  clearResult: () => set({ currentResult: null }),
  clearError: () => set({ error: null }),
}));
