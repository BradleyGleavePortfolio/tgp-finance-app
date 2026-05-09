import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../services/api';
import { safeAuthError } from '../lib/authErrors';
import { getGoogleOAuthTokens } from '../services/supabase';
import { secureStorage } from '../lib/secureStorage';

// Backend `/me` returns the user with a nested profile. The store
// intentionally keeps both shapes loose because new fields land regularly
// on either side and consumers read narrow fields by name; treat
// unknown keys as opaque values rather than `any`.
interface UserProfile {
  monthly_income_gross?: number;
  annual_income_gross?: number;
  dream_lifestyle_cost_mo?: number;
  dream_description?: string;
  future_self_letter?: string;
  primary_goal?: string;
  goal_timeline_months?: number;
  city?: string;
  state?: string;
  country?: string;
  net_worth_snapshot?: number;
  total_debt?: number;
  total_assets?: number;
  total_cash?: number;
  current_priority_index?: number;
  wealth_velocity_score?: number;
  last_eod_date?: string;
  onboarding_complete?: boolean;
  [key: string]: unknown;
}

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  onboarding_complete?: boolean;
  profile?: UserProfile | null;
  supabase_id?: string;
  phone?: string;
  referral_code?: string;
  coach_id?: string;
  created_at?: string;
  [key: string]: unknown;
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
// Loose shape for the `/me` payload — every field is read defensively in
// case the wire form drifts. We narrow each field at access time.
interface RawMePayload {
  id?: unknown;
  supabase_id?: unknown;
  email?: unknown;
  name?: unknown;
  phone?: unknown;
  referral_code?: unknown;
  role?: unknown;
  coach_id?: unknown;
  created_at?: unknown;
  onboarding_complete?: unknown;
  profile?: { onboarding_complete?: unknown } & UserProfile | null;
}

function extractMe(
  raw: RawMePayload | unknown,
): { user: User; profile: UserProfile | null; onboardingComplete: boolean } {
  if (!raw || typeof raw !== 'object') {
    return { user: { id: '', email: '', name: '' }, profile: null, onboardingComplete: false };
  }
  const r = raw as RawMePayload;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');

  const profile: UserProfile | null = r.profile ?? null;
  const profileOnboardingComplete =
    profile && typeof profile.onboarding_complete === 'boolean' ? profile.onboarding_complete : false;
  const rootOnboardingComplete =
    typeof r.onboarding_complete === 'boolean' ? r.onboarding_complete : false;

  const user: User = {
    id: str(r.id),
    supabase_id: str(r.supabase_id),
    email: str(r.email),
    name: str(r.name),
    phone: typeof r.phone === 'string' ? r.phone : undefined,
    referral_code: typeof r.referral_code === 'string' ? r.referral_code : undefined,
    role: typeof r.role === 'string' ? r.role : undefined,
    coach_id: typeof r.coach_id === 'string' ? r.coach_id : undefined,
    created_at: str(r.created_at),
    onboarding_complete: rootOnboardingComplete || profileOnboardingComplete,
  };

  const onboardingComplete = !!(rootOnboardingComplete || profileOnboardingComplete);

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

        // Stage-1 onboarding reconciler: if the backend doesn't show
        // onboarding_complete but the device has stored quiz answers (the
        // celebration POST failed last time), retry the POST and pull the
        // updated profile. Best-effort — failure here just leaves the
        // user at their existing state, no UX block.
        try {
          const { reconcileOnboarding } = await import('../lib/onboardingReconcile');
          const result = await reconcileOnboarding({
            backendOnboardingComplete: onboardingComplete,
          });
          if (result.resubmitted) {
            const { data: raw2 } = await authApi.me();
            const next = extractMe(raw2);
            set({
              user: next.user,
              profile: next.profile,
              hasCompletedOnboarding: next.onboardingComplete,
            });
          }
        } catch {
          // Reconciler is best-effort — never break the auth bootstrap.
        }
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      const e = error as { response?: { data?: { code?: unknown } } };
      const code = e?.response?.data?.code;
      // EMAIL_NOT_VERIFIED means user hasn't verified yet — expected during polling
      if (code === 'EMAIL_NOT_VERIFIED') return false;
      // INVALID_CREDENTIALS or other errors — also not verified or some other issue
      return false;
    }
  },
}));
