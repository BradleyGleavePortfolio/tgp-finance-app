// Auth state management — BULLETPROOF
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../services/api';
import type { FinancialProfile } from '../types';

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  phone?: string;
  coach_id?: string;
  referral_code?: string;
}

interface AuthState {
  user: User | null;
  profile: FinancialProfile | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; phone?: string; referral_code?: string }) => Promise<any>;
  logout: () => Promise<void>;
  selectRole: (role: string, accessCode?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

/** Safely extract user + profile from /auth/me response */
function extractMe(data: any): { user: User | null; profile: FinancialProfile | null; onboardingComplete: boolean } {
  if (!data || typeof data !== 'object') {
    return { user: null, profile: null, onboardingComplete: false };
  }

  // /me returns { id, email, name, role, profile: {...}, ... }
  const raw = data.user || data;

  const user: User = {
    id: raw.id || '',
    email: raw.email || '',
    name: raw.name || '',
    role: raw.role || 'student',
    phone: raw.phone || undefined,
    coach_id: raw.coach_id || undefined,
    referral_code: raw.referral_code || undefined,
  };

  // Profile can be nested under .profile or be the data itself
  const profile = raw.profile || null;

  // Check onboarding_complete in multiple locations
  const onboardingComplete = !!(
    raw.onboarding_complete ||
    raw.onboardingComplete ||
    profile?.onboarding_complete ||
    profile?.onboardingComplete
  );

  return { user, profile, onboardingComplete };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  hasCompletedOnboarding: false,
  error: null,

  initialize: async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        set({ token });
        const { data } = await authApi.me();
        const { user, profile, onboardingComplete } = extractMe(data);

        if (user?.id) {
          set({
            user,
            profile,
            isAuthenticated: true,
            hasCompletedOnboarding: onboardingComplete,
            isLoading: false,
          });
        } else {
          // Token exists but /me failed — clear stale token
          await AsyncStorage.removeItem('auth_token');
          set({ token: null, isAuthenticated: false, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      await AsyncStorage.removeItem('auth_token');
      set({ token: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authApi.login(email, password);

      // Backend returns { access_token, refresh_token, user } OR { token, user }
      const token = data?.access_token || data?.token || '';
      if (!token) throw new Error('No token received from server');

      await AsyncStorage.setItem('auth_token', token);
      set({ token });

      // Fetch full user profile
      const { data: meData } = await authApi.me();
      const { user, profile, onboardingComplete } = extractMe(meData);

      set({
        user,
        profile,
        isAuthenticated: true,
        hasCompletedOnboarding: onboardingComplete,
        isLoading: false,
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Login failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  register: async (regData: { name: string; email: string; password: string; phone?: string; referral_code?: string }) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authApi.register(regData);
      // After register, store token if provided
      const token = data?.access_token || data?.token || '';
      if (token) {
        await AsyncStorage.setItem('auth_token', token);
        set({ token });
      }
      // Extract user info from register response
      const userRaw = data?.user || data;
      if (userRaw?.id) {
        set({
          user: {
            id: userRaw.id,
            email: userRaw.email || regData.email,
            name: userRaw.name || regData.name,
            role: userRaw.role,
          },
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
      return data;
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Registration failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout API errors
    }
    await AsyncStorage.removeItem('auth_token');
    set({
      user: null,
      profile: null,
      token: null,
      isAuthenticated: false,
      hasCompletedOnboarding: false,
      error: null,
    });
  },

  selectRole: async (role: string, accessCode?: string) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.selectRole(role, accessCode);
      // Refresh user data after role selection
      const { data } = await authApi.me();
      const { user, profile, onboardingComplete } = extractMe(data);
      set({
        user,
        profile,
        hasCompletedOnboarding: onboardingComplete,
        isLoading: false,
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Role selection failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  refreshUser: async () => {
    try {
      const { data } = await authApi.me();
      const { user, profile, onboardingComplete } = extractMe(data);
      if (user?.id) {
        set({ user, profile, hasCompletedOnboarding: onboardingComplete });
      }
    } catch {
      // Silent failure — user data will be stale but app won't crash
    }
  },

  clearError: () => set({ error: null }),
}));
