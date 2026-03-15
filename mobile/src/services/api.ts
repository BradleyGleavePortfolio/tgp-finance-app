// Axios instance with auth interceptors for The Growth Project: Finance
import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { API_BASE_URL } from '../utils/constants';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request Interceptor: Attach JWT ─────────────────────────────────────────
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Session not available; proceed without auth
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor: Handle Auth Errors ─────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !data.session) {
          // Refresh failed: force logout
          await supabase.auth.signOut();
          return Promise.reject(error);
        }
        originalRequest.headers.Authorization = `Bearer ${data.session.access_token}`;
        return api(originalRequest);
      } catch {
        await supabase.auth.signOut();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

// ─── API Service Methods ──────────────────────────────────────────────────────

export const authApi = {
  register: (data: { name: string; email: string; password: string; phone?: string; referral_code?: string }) =>
    api.post('/api/auth/register', data),
  login: (email: string, password: string) => api.post('/api/auth/login', { email, password }),
  selectRole: (role: string, accessCode?: string) => api.post('/api/auth/select-role', { role, coach_access_code: accessCode }),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get('/api/auth/me'),
};

export const profileApi = {
  get: () => api.get('/api/profile'),
  update: (data: Record<string, unknown>) => api.put('/api/profile', data),
};

export const accountsApi = {
  getAll: () => api.get('/api/accounts'),
  create: (data: Record<string, unknown>) => api.post('/api/accounts', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/api/accounts/${id}`, data),
  delete: (id: string) => api.delete(`/api/accounts/${id}`),
  getHistory: (id: string, days = 30) => api.get(`/api/accounts/${id}/history?days=${days}`),
};

export const eodApi = {
  submit: (data: Record<string, unknown>) => api.post('/api/eod', data),
  getHistory: (days = 30) => api.get(`/api/eod?days=${days}`),
  getToday: () => api.get('/api/eod/today'),
};

export const networthApi = {
  getHistory: (days = 90) => api.get(`/api/networth/history?days=${days}`),
  getCurrent: () => api.get('/api/networth/current'),
};

export const prioritiesApi = {
  getCurrent: () => api.get('/api/priorities/current'),
  getAll: () => api.get('/api/priorities/all'),
};

export const whatifApi = {
  run: (scenario_type: string, parameters: Record<string, unknown>) =>
    api.post('/api/whatif/run', { scenario_type, parameters }),
  getSaved: () => api.get('/api/whatif/saved'),
  save: (data: Record<string, unknown>) => api.post('/api/whatif/save', data),
  delete: (id: string) => api.delete(`/api/whatif/${id}`),
};

export const projectionsApi = {
  run: (params: {
    income_growth_pct: number;
    savings_rate_pct: number;
    investment_return_pct: number;
    extra_debt_payment: number;
    years?: number;
  }) => api.post('/api/projections/run', params),
};

export const milestonesApi = {
  getAll: () => api.get('/api/milestones'),
  check: () => api.post('/api/milestones/check'),
};

export const aiApi = {
  chat: (message: string, conversation_history: Array<{ role: string; content: string }>) =>
    api.post('/api/ai/chat', { message, conversation_history }),
  getEodInsight: (eod_submission_id: string) => api.post('/api/ai/eod-insight', { eod_submission_id }),
  getSpendingDNA: (month: string) => api.post('/api/ai/spending-dna', { month }),
};

export const notificationsApi = {
  getPreferences: () => api.get('/api/notifications/preferences'),
  updatePreferences: (data: Record<string, unknown>) => api.put('/api/notifications/preferences', data),
};

export const coachApi = {
  getStudents: () => api.get('/api/coach/students'),
  getStudent: (id: string) => api.get(`/api/coach/students/${id}`),
  getAlerts: () => api.get('/api/coach/alerts'),
  addNote: (student_id: string, note: string, is_private = false) =>
    api.post(`/api/coach/notes/${student_id}`, { note, is_private }),
  getDigest: () => api.get('/api/coach/digest'),
  getTemplates: () => api.get('/api/coach/templates'),
  createTemplate: (data: Record<string, unknown>) => api.post('/api/coach/templates', data),
  applyTemplate: (template_id: string, student_id: string) =>
    api.post(`/api/coach/templates/${template_id}/apply/${student_id}`),
};

export const costLivingApi = {
  getCountries: () => api.get('/api/costliving/countries'),
  compare: (from: string, to: string, income: number) =>
    api.get(`/api/costliving/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&income=${income}`),
};

export const onboardingApi = {
  submit: (data: Record<string, unknown>) => api.post('/api/onboarding/complete', data),
};

export default api;
