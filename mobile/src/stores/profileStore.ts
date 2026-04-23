// User profile and financial profile state management — BULLETPROOF
import { create } from 'zustand';
import { profileApi } from '../services/api';
import type { FinancialProfile, IncomeSource } from '../types';

/** Safely normalize a profile object — guard against NaN, missing arrays, bad types */
function safeProfile(raw: any): FinancialProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  try {
    const p = raw.profile || raw;
    if (!p || typeof p !== 'object') return null;

    // Ensure income_sources is always an array
    let incomeSources: IncomeSource[] = [];
    if (Array.isArray(p.income_sources)) {
      incomeSources = p.income_sources.filter(
        (s: any) => s && typeof s === 'object' && typeof s.source === 'string'
      );
    }

    // Safe numeric extraction
    const safeNum = (v: any, fallback = 0): number => {
      const n = Number(v);
      return isFinite(n) ? n : fallback;
    };

    return {
      ...p,
      income_sources: incomeSources,
      monthly_income_gross: safeNum(p.monthly_income_gross),
      annual_income_gross: safeNum(p.annual_income_gross),
      goal_timeline_months: safeNum(p.goal_timeline_months),
      dream_lifestyle_cost_mo: safeNum(p.dream_lifestyle_cost_mo),
      net_worth_snapshot: safeNum(p.net_worth_snapshot),
      total_debt: safeNum(p.total_debt),
      total_assets: safeNum(p.total_assets),
      total_cash: safeNum(p.total_cash),
      current_priority_index: safeNum(p.current_priority_index),
      wealth_velocity_score: safeNum(p.wealth_velocity_score),
      streak_days: safeNum(p.streak_days),
      country: typeof p.country === 'string' ? p.country : 'US',
      risk_tolerance: ['conservative', 'moderate', 'aggressive'].includes(p.risk_tolerance)
        ? p.risk_tolerance
        : 'moderate',
      motivation_style: ['small_wins', 'big_picture'].includes(p.motivation_style)
        ? p.motivation_style
        : 'small_wins',
      is_self_employed: !!p.is_self_employed,
      has_business: !!p.has_business,
    } as FinancialProfile;
  } catch {
    return null;
  }
}

interface ProfileStore {
  profile: FinancialProfile | null;
  isLoading: boolean;
  error: string | null;

  fetchProfile: () => Promise<void>;
  updateProfile: (data: Partial<FinancialProfile>) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const initialProfileState = {
  profile: null as FinancialProfile | null,
  isLoading: false,
  error: null as string | null,
};

export const useProfileStore = create<ProfileStore>((set) => ({
  ...initialProfileState,

  fetchProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await profileApi.get();
      const profile = safeProfile(data);
      set({ profile, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load profile';
      set({ isLoading: false, error: message });
    }
  },

  updateProfile: async (profileData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await profileApi.update(profileData as Record<string, unknown>);
      const profile = safeProfile(data);
      set({ profile, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update profile';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set(initialProfileState),
}));
