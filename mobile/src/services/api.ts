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
import type {
  CoachDashboardResponse,
  CoachClientRow,
  CoachClientSummary,
  CoachClientAccountRow,
  CoachClientCashflow,
  CoachClientGoals,
  CoachNoteRow,
  ClientAssignmentRow,
  CreateAssignmentBody,
  UpdateAssignmentBody,
  CoachMessageRow,
  CoachMessageThread,
  CoachMessageThreadRow,
  CommunityPostRow,
  CreateCommunityPostBody,
  PracticeAnalytics,
  ClientStatus,
  ClientSortKey,
} from '../types/coach';

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
  // Sprint A — production-safe coach promotion. Replaces the dev-backdoor
  // coach_access_code path on /select-role. The mobile client mints a
  // signed token (see lib/coachSignupToken.ts) and posts it here.
  coachPromote: (signupToken: string) =>
    api.post<{ role: string; message: string }>('/api/auth/coach-promote', {
      signup_token: signupToken,
    }),
  logout: () => api.post('/api/auth/logout'),
  // Trade Google OAuth tokens (returned by Supabase implicit flow) for our
  // own backend-issued JWT. Backend verifies via supabase.auth.signInWithIdToken
  // and either creates or returns an existing user record.
  googleLogin: (params: { access_token: string; id_token?: string }) =>
    api.post('/api/auth/google', params),
};

// Sprint A — coach-issued invite codes (multi-code flow on top of the
// existing CoachProfile.invite_code default link). Mirrors the fitness
// /coach/invite-codes contract so the mobile screen ports cleanly.
export interface CoachInviteCode {
  id: string;
  code: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  revoked: boolean;
  created_at?: string;
}

export const coachInviteCodesApi = {
  list: () => api.get<CoachInviteCode[]>('/api/coach/invite-codes'),
  create: (data: { expires_at?: string | null; max_uses?: number | null }) =>
    api.post<CoachInviteCode>('/api/coach/invite-codes', data),
  revoke: (id: string) =>
    api.delete<CoachInviteCode>(`/api/coach/invite-codes/${id}`),
};

// Sprint A — coach practice type (already shipped backend in Stage 3).
// Surfaces here so the symmetric dual-write from the fitness app can
// also be invoked locally when a coach picks their practice from
// inside the finance app.
export type CoachPracticeType = 'fitness_only' | 'finance_only' | 'both';

export const coachPracticeApi = {
  get: () =>
    api.get<{ practice_type: CoachPracticeType | null }>('/api/coach/practice'),
  set: (practice_type: CoachPracticeType) =>
    api.put<{ practice_type: CoachPracticeType }>('/api/coach/practice', {
      practice_type,
    }),
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
  submitToday: (data: EODWriteInput) => api.post<EODSubmissionResponse>('/api/eod', data),
  getToday: () => api.get<EODSubmissionResponse>('/api/eod/today'),
  getHistory: (days?: number) =>
    api.get('/api/eod', { params: { days } }),
  getHistoryByLimit: (limit?: number) =>
    api.get('/api/eod/history', { params: { limit } }),
  update: (id: string, data: Partial<EODWriteInput>) =>
    api.put<EODSubmissionResponse>(`/api/eod/${id}`, data),
};

// Sprint A audit fix H-3 — typed shape for the EOD submit response.
// The store + screen previously consumed the result as `any`. The
// server returns the saved submission row plus the computed net-worth
// delta (`previous_net_worth` -> `new_net_worth`) and an optional AI
// insight. Optional fields stay optional so a degraded AI provider
// does not break the screen.
export interface EODSubmissionResponse {
  submission?: EODSubmissionRow;
  id?: string;
  user_id?: string;
  submission_date?: string;
  mood?: number | null;
  notes?: string | null;
  account_snapshots?: AccountSnapshot[];
  habits?: HabitEntry[];
  habits_checked?: string[];
  total_assets?: number;
  total_debt?: number;
  net_worth?: number;
  previous_net_worth?: number;
  new_net_worth?: number;
  ai_insight?: string;
  submitted_at?: string;
  created_at?: string;
}

export interface EODSubmissionRow {
  id: string;
  user_id: string;
  submission_date: string;
  mood: number | null;
  notes: string | null;
  account_snapshots: AccountSnapshot[];
  habits: HabitEntry[];
  total_assets: number;
  total_debt: number;
  net_worth: number;
  previous_net_worth?: number;
  new_net_worth?: number;
  ai_insight?: string;
  submitted_at: string;
}

// Sprint A audit fix CR-3 — client-side messages.
// Backend mounts at /api/messages. Pagination cursor is the oldest
// `created_at` ISO string from the previous page; pass it back as
// `before` to walk further into the past.
export interface ClientMessage {
  id: string;
  body: string;
  from_coach: boolean;
  read_at: string | null;
  created_at: string;
}

export interface ClientMessageThreadResponse {
  thread_key: string | null;
  has_coach: boolean;
  coach_name: string | null;
  messages: ClientMessage[];
  next_cursor: string | null;
}

export const messagesApi = {
  getThread: (params?: { limit?: number; before?: string }) =>
    api.get<ClientMessageThreadResponse>('/api/messages', { params }),
  unreadCount: () => api.get<{ count: number }>('/api/messages/unread-count'),
  send: (body: string) => api.post<ClientMessage>('/api/messages', { body }),
  markRead: () => api.post<{ marked: number }>('/api/messages/read'),
};

// Onboarding API
//
// The wire payload is pinned to `SubmitQuizAnswers` to prevent the bucket-
// string drift we shipped in Stage-0 (mobile sent `'under_50k'`, backend
// switch expected `'Under $50k'`, every user fell through to default
// 75 000/yr). Any change to the union strings must land in lockstep with
// `backend/src/onboarding/onboarding.service.ts`. The contract test in
// `src/lib/__tests__/onboarding.contract.test.ts` enforces parity.
import type { SubmitQuizAnswers } from '../types/onboarding';

export const onboardingApi = {
  submitQuiz: (answers: SubmitQuizAnswers) =>
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

  // ── Stage 2 — Coach OS ────────────────────────────────────────────────
  getDashboard: () => api.get<CoachDashboardResponse>('/api/coach/dashboard'),
  getClients: (params: {
    search?: string;
    status?: ClientStatus | 'all';
    sort?: ClientSortKey;
  } = {}) =>
    api.get<{ clients: CoachClientRow[]; total: number }>('/api/coach/clients', { params }),
  getClientSummary: (id: string) =>
    api.get<CoachClientSummary>(`/api/coach/clients/${id}/summary`),
  getClientAccounts: (id: string) =>
    api.get<CoachClientAccountRow[]>(`/api/coach/clients/${id}/accounts`),
  getClientCashflow: (id: string) =>
    api.get<CoachClientCashflow>(`/api/coach/clients/${id}/cashflow`),
  getClientGoals: (id: string) =>
    api.get<CoachClientGoals>(`/api/coach/clients/${id}/goals`),
  // Notes
  listClientNotes: (id: string) =>
    api.get<CoachNoteRow[]>(`/api/coach/clients/${id}/notes`),
  patchNote: (noteId: string, data: { note?: string; is_private?: boolean }) =>
    api.patch<CoachNoteRow>(`/api/coach/notes/${noteId}`, data),
  deleteNote: (noteId: string) => api.delete(`/api/coach/notes/${noteId}`),
  // Assignments
  listClientAssignments: (id: string) =>
    api.get<ClientAssignmentRow[]>(`/api/coach/clients/${id}/assignments`),
  createAssignment: (clientId: string, data: CreateAssignmentBody) =>
    api.post<ClientAssignmentRow>(`/api/coach/clients/${clientId}/assignments`, data),
  patchAssignment: (assignmentId: string, data: UpdateAssignmentBody) =>
    api.patch<ClientAssignmentRow>(`/api/coach/assignments/${assignmentId}`, data),
  deleteAssignment: (assignmentId: string) =>
    api.delete(`/api/coach/assignments/${assignmentId}`),
  // Messages
  getMessageInbox: () =>
    api.get<{ threads: CoachMessageThreadRow[] }>('/api/coach/messages'),
  getMessageThread: (clientId: string, limit: number = 100) =>
    api.get<CoachMessageThread>(`/api/coach/clients/${clientId}/messages`, { params: { limit } }),
  sendMessage: (clientId: string, body: string) =>
    api.post<CoachMessageRow>(`/api/coach/clients/${clientId}/messages`, { body }),
  // Community
  listCommunityPosts: () => api.get<CommunityPostRow[]>('/api/coach/community/posts'),
  createCommunityPost: (data: CreateCommunityPostBody) =>
    api.post<CommunityPostRow>('/api/coach/community/posts', data),
  patchCommunityPost: (postId: string, data: Partial<CreateCommunityPostBody>) =>
    api.patch<CommunityPostRow>(`/api/coach/community/posts/${postId}`, data),
  deleteCommunityPost: (postId: string) =>
    api.delete(`/api/coach/community/posts/${postId}`),
  // Analytics
  getPracticeAnalytics: () => api.get<PracticeAnalytics>('/api/coach/analytics'),
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
