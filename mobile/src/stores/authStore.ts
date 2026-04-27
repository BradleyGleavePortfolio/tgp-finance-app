import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../services/api';
import { safeAuthError } from '../lib/authErrors';
import { getGoogleOAuthTokens } from '../services/supabase';
import { secureStorage } from '../lib/secureStorage';

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

interface PendingVerification {
  email: string;
  password: string;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  error: string | null;
  pendingVerification: PendingVerification | null;

  initialize: () => Promise<void>;
  reset: () => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<boolean>;
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
  checkVerification: () => Promise<boolean>;
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
    supabase_id: raw.supabase_id || '',
    email: raw.email || '',
    name: raw.name || '',
    phone: raw.phone || undefined,
    referral_code: raw.referral_code || undefined,
    role: raw.role || undefined,
    coach_id: raw.coach_id || undefined,
    created_at: raw.created_at || '',
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
  pendingVerification: null,

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      user: null,
      profile: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
      hasCompletedOnboarding: false,
      error: null,
      pendingVerification: null,
    }),

  initialize: async () => {
    try {
      const token = await secureStorage.getItem('auth_token');
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
      await secureStorage.removeItem('auth_token');
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

  loginWithGoogle: async (): Promise<boolean> => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await getGoogleOAuthTokens();
      if (!tokens) {
        // User cancelled the OAuth popup — not an error.
        set({ isLoading: false });
        return false;
      }

      const { data } = await authApi.googleLogin(tokens);
      const token = data?.access_token || data?.token || '';
      const refreshToken = data?.refresh_token || '';
      if (!token) {
        throw new Error('No token received from server');
      }
      await secureStorage.setItem('auth_token', token);
      if (refreshToken) {
        await secureStorage.setItem('auth_refresh_token', refreshToken);
      }
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
      return true;
    } catch (error: any) {
      set({ error: safeAuthError(error), isLoading: false });
      throw error;
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authApi.login(email, password);
      // Backend returns { access_token, refresh_token, user: {...} }
      // After response interceptor unwraps envelope, data = that object
      const token = data?.access_token || data?.token || '';
      const refreshToken = data?.refresh_token || '';
      if (!token) {
        throw new Error('No token received from server');
      }
      await secureStorage.setItem('auth_token', token);
      // Store refresh token so the api.ts mutex can rotate access tokens
      // silently on 401 instead of forcing re-login every ~hour.
      if (refreshToken) {
        await secureStorage.setItem('auth_refresh_token', refreshToken);
      }
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
      set({
        error: safeAuthError(error),
        isLoading: false,
      });
      throw error;
    }
  },

  register: async (dto) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.register(dto);
      // Save pending verification state — do NOT try to login yet
      set({
        pendingVerification: { email: dto.email, password: dto.password },
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: safeAuthError(error),
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
    await secureStorage.removeItem('auth_token');
    await secureStorage.removeItem('auth_refresh_token');
    await AsyncStorage.removeItem('quiz_answers');
    set({
      user: null,
      profile: null,
      token: null,
      isAuthenticated: false,
      hasCompletedOnboarding: false,
      error: null,
      pendingVerification: null,
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
      set({
        error: safeAuthError(error),
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

  checkVerification: async () => {
    const { pendingVerification } = get();
    if (!pendingVerification) return false;

    try {
      // Attempt login — backend checks email_confirmed_at and rejects unverified users
      // If login succeeds, the user has verified their email
      const { data } = await authApi.login(pendingVerification.email, pendingVerification.password);
      const token = data?.access_token || data?.token || '';
      const refreshToken = data?.refresh_token || '';
      if (!token) return false;

      await secureStorage.setItem('auth_token', token);
      if (refreshToken) {
        await secureStorage.setItem('auth_refresh_token', refreshToken);
      }
      set({ token });

      // Fetch full user profile
      const { data: raw } = await authApi.me();
      const { user, profile, onboardingComplete } = extractMe(raw);
      set({
        user,
        profile,
        hasCompletedOnboarding: onboardingComplete,
        isAuthenticated: true,
        pendingVerification: null,
      });
      return true;
    } catch (error: any) {
      const code = error.response?.data?.code;
      // EMAIL_NOT_VERIFIED means user hasn't verified yet — expected during polling
      if (code === 'EMAIL_NOT_VERIFIED') return false;
      // INVALID_CREDENTIALS or other errors — also not verified or some other issue
      return false;
    }
  },
}));
