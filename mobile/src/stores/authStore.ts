// Auth state + Supabase session management
import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { authApi } from '../services/api';
import type { User, FinancialProfile, Role } from '../types';

interface AuthStore {
  user: User | null;
  profile: FinancialProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; phone?: string; referral_code?: string }) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  selectRole: (role: Role, accessCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  setProfile: (profile: FinancialProfile) => void;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  profile: null,
  isAuthenticated: false,
  isLoading: true,
  hasCompletedOnboarding: false,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true });
      const session = await supabase.auth.getSession();

      if (session.data.session) {
        const { data } = await authApi.me();
        set({
          user: data.user,
          profile: data.profile,
          isAuthenticated: true,
          hasCompletedOnboarding: !!data.profile?.monthly_income_gross,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false, isAuthenticated: false });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw new Error(authError.message);

      const { data } = await authApi.me();
      set({
        user: data.user,
        profile: data.profile,
        isAuthenticated: true,
        hasCompletedOnboarding: !!data.profile?.monthly_income_gross,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  register: async (userData) => {
    set({ isLoading: true, error: null });
    try {
      const { error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: { data: { name: userData.name, phone: userData.phone } },
      });
      if (authError) throw new Error(authError.message);

      // Create backend user record
      await authApi.register(userData);

      set({ isLoading: false, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  loginWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'tgp-finance://auth/callback' },
    });
    if (error) throw error;
  },

  selectRole: async (role, accessCode) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.selectRole(role, accessCode);
      const { data } = await authApi.me();
      set({ user: data.user, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Role selection failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
      set({ user: null, profile: null, isAuthenticated: false, hasCompletedOnboarding: false });
    } catch {
      set({ user: null, profile: null, isAuthenticated: false, hasCompletedOnboarding: false });
    }
  },

  setProfile: (profile) => set({ profile, hasCompletedOnboarding: true }),

  clearError: () => set({ error: null }),

  refreshUser: async () => {
    try {
      const { data } = await authApi.me();
      set({ user: data.user, profile: data.profile });
    } catch {
      // Silent refresh failure
    }
  },
}));
