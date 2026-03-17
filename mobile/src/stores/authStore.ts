import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../services/api';

interface UserProfile {
  monthly_income_gross?: number;
  onboarding_complete?: boolean;
  [key: string]: any;
}

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  onboarding_complete?: boolean;
  profile?: UserProfile | null;
  [key: string]: any;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    referral_code?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  selectRole: (role: string, coachAccessCode?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

/**
 * Extract user + profile from the /me response.
 * Backend returns the full user object with nested profile.
 * After the response interceptor unwraps the envelope, we get the user object directly.
 */
function extractMe(raw: any): { user: User; profile: UserProfile | null; onboardingComplete: boolean } {
  if (!raw || typeof raw !== 'object') {
    return { user: { id: '', email: '', name: '' }, profile: null, onboardingComplete: false };
  }

  const user: User = {
    id: raw.id || '',
    email: raw.email || '',
    name: raw.name || '',
    role: raw.role || undefined,
    onboarding_complete: raw.onboarding_complete || raw.profile?.onboarding_complete || false,
  };

  const profile: UserProfile | null = raw.profile || null;

  const onboardingComplete = !!(
    raw.onboarding_complete ||
    raw.profile?.onboarding_complete ||
    user.onboarding_complete
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

  clearError: () => set({ error: null }),

  initialize: async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        set({ token });
        const { data: raw } = await authApi.me();
        const { user, profile, onboardingComplete } = extractMe(raw);
        set({
          user,
          profile,
          hasCompletedOnboarding: onboardingComplete,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      await AsyncStorage.removeItem('auth_token');
      set({
        token: null,
        user: null,
        profile: null,
        isAuthenticated: false,
        hasCompletedOnboarding: false,
        isLoading: false,
      });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authApi.login(email, password);
      // Backend returns { access_token, refresh_token, user: {...} }
      // After response interceptor unwraps envelope, data = that object
      const token = data?.access_token || data?.token || '';
      if (!token) {
        throw new Error('No token received from server');
      }
      await AsyncStorage.setItem('auth_token', token);
      set({ token });

      // Fetch full user profile
      const { data: raw } = await authApi.me();
      const { user, profile, onboardingComplete } = extractMe(raw);
      set({
        user,
        profile,
        hasCompletedOnboarding: onboardingComplete,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'Login failed';
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  register: async (dto) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authApi.register(dto);
      // Registration returns { user: { id, email, name }, message }
      // User is NOT authenticated yet — they must verify email first
      // Store the user info for the verify-email screen to display
      if (data?.user) {
        set({
          user: {
            id: data.user.id || '',
            email: data.user.email || dto.email,
            name: data.user.name || dto.name,
          },
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'Registration failed';
      set({
        error: message,
        isLoading: false,
      });
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

  selectRole: async (role: string, coachAccessCode?: string) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.selectRole(role, coachAccessCode);
      // Refresh user to get updated role
      const { data: raw } = await authApi.me();
      const { user, profile, onboardingComplete } = extractMe(raw);
      set({
        user,
        profile,
        hasCompletedOnboarding: onboardingComplete,
        isLoading: false,
      });
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'Role selection failed';
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  refreshUser: async () => {
    try {
      const { data: raw } = await authApi.me();
      const { user, profile, onboardingComplete } = extractMe(raw);
      set({
        user,
        profile,
        hasCompletedOnboarding: onboardingComplete,
      });
    } catch (error) {
      // Silently fail — user data will be stale but app won't crash
    }
  },
}));
