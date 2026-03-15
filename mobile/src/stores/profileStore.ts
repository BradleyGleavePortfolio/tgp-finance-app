// User profile and financial profile state management
import { create } from 'zustand';
import { profileApi } from '../services/api';
import type { FinancialProfile } from '../types';

interface ProfileStore {
  profile: FinancialProfile | null;
  isLoading: boolean;
  error: string | null;

  fetchProfile: () => Promise<void>;
  updateProfile: (data: Partial<FinancialProfile>) => Promise<void>;
  clearError: () => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  profile: null,
  isLoading: false,
  error: null,

  fetchProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await profileApi.get();
      set({ profile: data.profile || data, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load profile';
      set({ isLoading: false, error: message });
    }
  },

  updateProfile: async (profileData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await profileApi.update(profileData as Record<string, unknown>);
      set({ profile: data.profile || data, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update profile';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
