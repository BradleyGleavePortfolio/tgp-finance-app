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

function safeNumber(v: any): number | undefined {
  const n = Number(v);
  return isFinite(n) ? n : undefined;
}

function formatProjection(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

/** Safely normalize a ScenarioResult from any backend or local format */
function safeResult(data: any): ScenarioResult | null {
  if (!data || typeof data !== 'object') return null;

  // If data already has headline (local calc or already transformed), use as-is
  if (data.headline || data.result?.headline) {
    const r = data.result || data;
    return {
      headline: typeof r.headline === 'string' ? r.headline : '',
      narrative: typeof r.narrative === 'string' ? r.narrative : '',
      keyMetrics: Array.isArray(r.keyMetrics) ? r.keyMetrics : Array.isArray(r.key_metrics) ? r.key_metrics : [],
      monthsToGoalChange: safeNumber(r.monthsToGoalChange || r.months_to_goal_change),
      annualSavings: safeNumber(r.annualSavings || r.annual_savings),
      netWorthImpact10yr: safeNumber(r.netWorthImpact10yr || r.net_worth_impact_10yr),
    };
  }

  // Transform backend API format (result_summary + projections)
  const summary = data.result_summary || data;
  const narrative = typeof summary.narrative === 'string' ? summary.narrative : '';

  // Build headline from first sentence of narrative
  const headline = narrative.split('.')[0] || 'Scenario Result';

  // Build keyMetrics from known summary fields + projections
  const keyMetrics: Array<{label: string; value: string; positive?: boolean}> = [];

  if (summary.annual_tax_savings !== undefined) keyMetrics.push({ label: 'Tax Savings/yr', value: `$${Number(summary.annual_tax_savings).toLocaleString()}`, positive: true });
  if (summary.fi_number !== undefined) keyMetrics.push({ label: 'FI Number', value: `$${Number(summary.fi_number).toLocaleString()}`, positive: true });
  if (summary.years_to_fi_at_current_rate !== undefined) keyMetrics.push({ label: 'Years to FI', value: `~${summary.years_to_fi_at_current_rate} yrs`, positive: summary.years_to_fi_at_current_rate <= 20 });
  if (summary.purchasing_power_multiplier !== undefined) keyMetrics.push({ label: 'Purchasing Power', value: `${summary.purchasing_power_multiplier}x`, positive: true });
  if (summary.lifetime_earnings_impact !== undefined) keyMetrics.push({ label: 'Lifetime Impact', value: `$${Number(summary.lifetime_earnings_impact).toLocaleString()}`, positive: true });
  if (summary.interest_saved !== undefined) keyMetrics.push({ label: 'Interest Saved', value: `$${Number(summary.interest_saved).toLocaleString()}`, positive: true });
  if (summary.months_saved !== undefined) keyMetrics.push({ label: 'Months Saved', value: `${summary.months_saved} mo`, positive: true });
  if (summary.monthly_savings !== undefined) keyMetrics.push({ label: 'Monthly Savings', value: `$${Number(summary.monthly_savings).toLocaleString()}`, positive: Number(summary.monthly_savings) > 0 });
  if (summary.annual_savings !== undefined) keyMetrics.push({ label: 'Annual Savings', value: `$${Number(summary.annual_savings).toLocaleString()}`, positive: Number(summary.annual_savings) > 0 });

  // Add projection metrics if available
  if (data.projection_1yr !== undefined) keyMetrics.push({ label: '1 Year', value: formatProjection(data.projection_1yr), positive: true });
  if (data.projection_3yr !== undefined) keyMetrics.push({ label: '3 Years', value: formatProjection(data.projection_3yr), positive: true });
  if (data.projection_5yr !== undefined) keyMetrics.push({ label: '5 Years', value: formatProjection(data.projection_5yr), positive: true });
  if (data.projection_10yr !== undefined) keyMetrics.push({ label: '10 Years', value: formatProjection(data.projection_10yr), positive: true });

  return {
    headline,
    narrative,
    keyMetrics: keyMetrics.slice(0, 6),
    annualSavings: safeNumber(summary.annual_savings),
    netWorthImpact10yr: safeNumber(data.projection_10yr),
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
