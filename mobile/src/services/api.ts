import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import { secureStorage } from '../lib/secureStorage';
import { authEvents } from '../utils/authEvents';
import type {
  AccountSnapshot,
  AccountType,
  ChatMessage,
  FinancialAccount,
  HabitEntry,
  NotificationPreferences,
  ProgramPhase,
  ScenarioType,
  WhatIfScenario,
} from '../types';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'https://tgp-finance-api.fly.dev';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-Platform': Platform.OS,
  },
});

// Request interceptor to attach auth token
api.interceptors.request.use(
  async (config) => {
    // Tokens live in SecureStore on native; the adapter transparently migrates
    // any legacy AsyncStorage copy on first read.
    const token = await secureStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Token-refresh mutex + request queue
// ---------------------------------------------------------------------------
// Backported from growth-project-mobile (fitness). Without this, every 401
// (which arrives every ~hour as Supabase access tokens expire) just clobbered
// the token and forced a re-login. Now we coalesce N concurrent 401s into
// exactly ONE refresh call and retry the original requests with the new
// access token.
//
// Sign-out only happens when the refresh itself fails (stale refresh token).
let refreshPromise: Promise<string> | null = null;
let loggedOutOnce = false;

async function performRefresh(): Promise<string> {
  const refreshToken = await secureStorage.getItem('auth_refresh_token');
  if (!refreshToken) throw new Error('No refresh token');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase env vars missing — cannot refresh');
  }

  // Lightweight, stateless client — no session persistence here. The user-
  // facing supabase client (services/supabase.ts) owns persisted session;
  // this one is single-use to swap a refresh token for a new access token.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error: refreshError } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (refreshError || !data.session) {
    throw refreshError || new Error('Refresh returned no session');
  }
  await secureStorage.setItem('auth_token', data.session.access_token);
  await secureStorage.setItem('auth_refresh_token', data.session.refresh_token);
  return data.session.access_token;
}

async function handleRefreshFailure(): Promise<void> {
  // Fire exactly once per refresh-failure cascade.
  if (loggedOutOnce) return;
  loggedOutOnce = true;
  try {
    await secureStorage.removeItem('auth_token');
    await secureStorage.removeItem('auth_refresh_token');
  } catch (err) {
    // Best effort
  }
  authEvents.emit('logout');
  // Reset the one-shot guard after the emit so a subsequent successful login
  // → 401 cycle still triggers a fresh logout.
  setTimeout(() => {
    loggedOutOnce = false;
  }, 1000);
}

// Single response interceptor: unwrap envelope + handle 401 with refresh mutex
api.interceptors.response.use(
  (response) => {
    // Unwrap TransformInterceptor envelope: { data, success, timestamp } → data
    if (
      response.data &&
      typeof response.data === 'object' &&
      'success' in response.data &&
      'data' in response.data
    ) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalConfig = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    // Network error — no response from server. Don't log out.
    if (!error.response) {
      error.message = 'Cannot reach server. Please check your connection and try again.';
      return Promise.reject(error);
    }

    // Only 401s trigger refresh. _retry guards against an infinite loop if
    // the retried request also returns 401.
    if (error.response.status !== 401 || !originalConfig || originalConfig._retry) {
      return Promise.reject(error);
    }
    originalConfig._retry = true;

    if (!refreshPromise) {
      refreshPromise = performRefresh()
        .catch(async (err) => {
          await handleRefreshFailure();
          throw err;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    try {
      const newToken = await refreshPromise;
      originalConfig.headers = originalConfig.headers || {};
      (originalConfig.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
      return api.request(originalConfig);
    } catch (refreshErr) {
      return Promise.reject(refreshErr);
    }
  }
);

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),
  register: (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    referral_code?: string;
  }) => api.post('/api/auth/register', data),
  me: () => api.get('/api/auth/me'),
  selectRole: (role: string, coach_access_code?: string) =>
    api.post('/api/auth/select-role', { role, ...(coach_access_code ? { coach_access_code } : {}) }),
  logout: () => api.post('/api/auth/logout'),
  // Trade Google OAuth tokens (returned by Supabase implicit flow) for our
  // own backend-issued JWT. Backend verifies via supabase.auth.signInWithIdToken
  // and either creates or returns an existing user record.
  googleLogin: (params: { access_token: string; id_token?: string }) =>
    api.post('/api/auth/google', params),
};

// Body shape accepted by create/update routes — a partial of the public
// FinancialAccount (server fills in id/user_id/timestamps/balance_logs).
export type AccountWriteInput = Partial<
  Pick<
    FinancialAccount,
    | 'name'
    | 'institution'
    | 'balance'
    | 'is_debt'
    | 'apr_percent'
    | 'is_secured'
    | 'minimum_payment'
    | 'currency'
    | 'notes'
    | 'is_active'
  >
> & {
  account_type?: AccountType;
};

// Accounts API
export const accountsApi = {
  getAll: () => api.get('/api/accounts'),
  getById: (id: string) => api.get(`/api/accounts/${id}`),
  create: (data: AccountWriteInput) => api.post('/api/accounts', data),
  update: (id: string, data: AccountWriteInput) => api.put(`/api/accounts/${id}`, data),
  delete: (id: string) => api.delete(`/api/accounts/${id}`),
  getHistory: (id: string, days?: number) =>
    api.get(`/api/accounts/${id}/history`, { params: { days } }),
};

// Net Worth API
export const networthApi = {
  getCurrent: () => api.get('/api/networth/current'),
  getHistory: (days?: number) =>
    api.get('/api/networth/history', { params: { days } }),
};

// Priority API
export const priorityApi = {
  getCurrent: () => api.get('/api/priorities/current'),
  getAll: () => api.get('/api/priorities/all'),
  advance: (studentId: string) => api.post('/api/priorities/advance', { student_id: studentId }),
};

// Wire form for the chat history payload — only role + content travel to the
// model. The richer ChatMessage (id, timestamp) is the local store shape.
export type ChatHistoryEntry = Pick<ChatMessage, 'role' | 'content'>;

// Chat API
export const chatApi = {
  send: (message: string, conversationHistory: ChatHistoryEntry[] = []) =>
    api.post('/api/ai/chat', { message, conversation_history: conversationHistory }),
  getContext: () => api.get('/api/ai/context'),
};

// Body shape for /api/eod and /api/eod/:id. Mirrors the writeable fields of
// EODSubmission — server fills id, user_id, computed totals, submitted_at.
// `habits_checked` is the wire form (string[] of completed habit keys); the
// EODSubmission row carries the richer HabitEntry[] back on read.
export interface EODWriteInput {
  submission_date: string;
  account_snapshots: AccountSnapshot[];
  notes?: string;
  mood?: number;
  habits?: HabitEntry[];
  habits_checked?: string[];
}

// EOD API
export const eodApi = {
  submitToday: (data: EODWriteInput) => api.post('/api/eod', data),
  getToday: () => api.get('/api/eod/today'),
  getHistory: (days?: number) =>
    api.get('/api/eod', { params: { days } }),
  getHistoryByLimit: (limit?: number) =>
    api.get('/api/eod/history', { params: { limit } }),
  update: (id: string, data: Partial<EODWriteInput>) => api.put(`/api/eod/${id}`, data),
};

// Onboarding API
export const onboardingApi = {
  submitQuiz: (answers: Record<string, unknown>) =>
    api.post('/api/onboarding/quiz', { answers }),
  getStatus: () => api.get('/api/onboarding/status'),
};

// Milestones API
export const milestonesApi = {
  getAll: () => api.get('/api/milestones'),
  check: () => api.post('/api/milestones/check'),
  celebrate: (key: string) => api.post(`/api/milestones/${key}/celebrate`),
};

// Body shape for /api/whatif/save. Server fills id, user_id, created_at and
// the projection_*yr fields when it computes the result envelope.
export type WhatIfSaveInput = Pick<
  WhatIfScenario,
  'scenario_type' | 'label' | 'parameters' | 'result_summary'
> & {
  projection_1yr?: number;
  projection_3yr?: number;
  projection_5yr?: number;
  projection_10yr?: number;
};

// What-If API
export const whatifApi = {
  run: (type: ScenarioType, parameters: Record<string, unknown>) =>
    api.post('/api/whatif/run', { scenario_type: type, parameters }),
  getSaved: () => api.get('/api/whatif/saved'),
  save: (scenario: WhatIfSaveInput) => api.post('/api/whatif/save', scenario),
  delete: (id: string) => api.delete(`/api/whatif/${id}`),
};

// Coach API
export const coachApi = {
  getStudents: (search?: string) =>
    api.get('/api/coach/students', { params: search ? { search } : {} }),
  getStudent: (id: string) => api.get(`/api/coach/students/${id}`),
  getStudentDetail: (id: string, days: number = 90) =>
    api.get(`/api/coach/students/${id}/detail`, { params: { days } }),
  getAlerts: () => api.get('/api/coach/alerts'),
  addNote: (studentId: string, note: string, isPrivate: boolean) =>
    api.post(`/api/coach/notes/${studentId}`, { note, is_private: isPrivate }),
  getDigest: () => api.get('/api/coach/digest'),
  getTemplates: () => api.get('/api/coach/templates'),
  createTemplate: (data: { name: string; description?: string; phases: ProgramPhase[] }) =>
    api.post('/api/coach/templates', data),
  applyTemplate: (templateId: string, studentId: string) =>
    api.post(`/api/coach/templates/${templateId}/apply/${studentId}`),
};

// Notifications API
export const notificationsApi = {
  getPreferences: () => api.get('/api/notifications/preferences'),
  updatePreferences: (data: Partial<NotificationPreferences>) =>
    api.put('/api/notifications/preferences', data),
};

// AI API (beyond chat)
export const aiApi = {
  getSpendingDNA: (month: string) => api.post('/api/ai/spending-dna', { month }),
  getLatestSpendingDna: () => api.get('/api/ai/spending-dna/latest'),
};

// Users / Identity API
// Note: data export and account deletion are concierge-handled via the
// support inbox surfaced in /system/trust-meta — there is no self-serve
// endpoint until the background-job + soft-delete schema change ships.
// `acknowledgeDataControlsContact` records that the Trust Center routed
// the user to support so we can later reconcile inbound mail with logged
// requests.
export const usersApi = {
  getFoundingNumber: () => api.get('/users/me/founding-number'),
  getCircleStats: () => api.get('/users/me/circle-stats'),
  acknowledgeDataControlsContact: () =>
    api.post('/users/me/data-controls/contact'),
  getAccessStatus: (): Promise<{
    data: {
      role: 'student' | 'coach' | 'owner';
      accessSource: 'self' | 'coach_managed' | 'owner';
      coach: { id: string; displayName: string } | null;
      supportContactEmail: string;
    };
  }> => api.get('/users/me/access-status'),
};

// Trust / System API — UX Psychology Report #2: "Trust as Emotion"
export const trustApi = {
  getMeta: () => api.get('/system/trust-meta'),
};

// Profile API. The mobile app patches a subset of FinancialProfile —
// computed fields (net_worth_snapshot, totals, wealth_velocity_score,
// last_eod_date, current_priority_index) are server-owned and excluded.
export type ProfileUpdateInput = Partial<{
  state: string;
  city: string;
  country: string;
  monthly_income_gross: number;
  annual_income_gross: number;
  primary_goal: string;
  goal_timeline_months: number;
  dream_lifestyle_cost_mo: number;
  dream_description: string;
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
  is_self_employed: boolean;
  has_business: boolean;
  motivation_style: 'small_wins' | 'big_picture';
  future_self_letter: string;
}>;

export const profileApi = {
  get: () => api.get('/api/profile'),
  update: (data: ProfileUpdateInput) => api.put('/api/profile', data),
};

// Payday API
export const paydayApi = {
  deploy: (paycheckAmount: number, allocations: Array<{ account_id: string; amount: number; percentage?: number }>) =>
    api.post('/api/payday', { paycheck_amount: paycheckAmount, allocations }),
  getTemplates: () => api.get('/api/payday/templates'),
  saveTemplate: (name: string, allocations: Array<{ account_id: string; percentage: number }>) =>
    api.post('/api/payday/templates', { name, allocations }),
};

// User Preferences API — UX Psychology Report #4: Preference-Controlled Personalization
//
// The server may wrap the body in either a flat object or a `{ data: ... }`
// envelope (legacy compatibility). Both shapes are accepted by the consumer;
// see usePreferences for the merge with DEFAULT_PREFERENCES.
import type { UserPreferences } from '../types/preferences';

export type PreferencesResponseBody =
  | Partial<UserPreferences>
  | { data: Partial<UserPreferences> };

export const preferencesApi = {
  get: (): Promise<{ data: PreferencesResponseBody }> => api.get('/users/me/preferences'),
  patch: (data: Partial<UserPreferences>): Promise<{ data: PreferencesResponseBody }> =>
    api.patch('/users/me/preferences', data),
};

export default api;

// Community API — UX Psychology Report #5: Contribution Loops
// Doctrine: no reactions, no badges. Read-only feed + post-only composer.
export const communityApi = {
  getFeed: () => api.get('/community/feed'),
  postWin: (action: string, visibility: 'circle' | 'public') =>
    api.post('/community/wins', { action, visibility }),
};
