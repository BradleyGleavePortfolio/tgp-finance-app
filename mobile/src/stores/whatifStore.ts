// What-If scenarios state management — BULLETPROOF
import { create } from 'zustand';
import { whatifApi } from '../services/api';
import type { WhatIfScenario, ScenarioType, ScenarioResult } from '../types';

/** Safely extract an array from any API response shape */
function safeArray<T>(data: any, key: string): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data[key] && Array.isArray(data[key])) return data[key];
  return [];
}

/** Safely normalize a ScenarioResult */
function safeResult(data: any): ScenarioResult | null {
  if (!data || typeof data !== 'object') return null;
  const r = data.result || data;
  return {
    headline: typeof r.headline === 'string' ? r.headline : '',
    narrative: typeof r.narrative === 'string' ? r.narrative : '',
    keyMetrics: Array.isArray(r.keyMetrics) ? r.keyMetrics : Array.isArray(r.key_metrics) ? r.key_metrics : [],
    monthsToGoalChange: isFinite(Number(r.monthsToGoalChange || r.months_to_goal_change)) ? Number(r.monthsToGoalChange || r.months_to_goal_change) : undefined,
    annualSavings: isFinite(Number(r.annualSavings || r.annual_savings)) ? Number(r.annualSavings || r.annual_savings) : undefined,
    netWorthImpact10yr: isFinite(Number(r.netWorthImpact10yr || r.net_worth_impact_10yr)) ? Number(r.netWorthImpact10yr || r.net_worth_impact_10yr) : undefined,
  };
}

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
      const result = safeResult(data);
      if (!result) throw new Error('Invalid scenario result');
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
      const saved: WhatIfScenario = data?.scenario || data;
      if (saved?.id) {
        set((state) => ({
          savedScenarios: [saved, ...(Array.isArray(state.savedScenarios) ? state.savedScenarios : [])],
        }));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save scenario';
      set({ error: message });
    }
  },

  fetchSaved: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await whatifApi.getSaved();
      const savedScenarios = safeArray<WhatIfScenario>(data, 'scenarios');
      set({ savedScenarios, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  deleteScenario: async (id) => {
    try {
      await whatifApi.delete(id);
      set((state) => ({
        savedScenarios: Array.isArray(state.savedScenarios)
          ? state.savedScenarios.filter((s) => s.id !== id)
          : [],
      }));
    } catch {
      // Silent failure
    }
  },

  clearResult: () => set({ currentResult: null }),
  clearError: () => set({ error: null }),
}));
