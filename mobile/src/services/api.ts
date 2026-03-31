import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'https://tgp-finance-api.fly.dev';

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
    const token = await AsyncStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Single response interceptor: unwrap envelope + handle 401
api.interceptors.response.use(
  (response) => {
    // Unwrap TransformInterceptor envelope: { data, success, timestamp } → data
    if (response.data && typeof response.data === 'object' && 'success' in response.data && 'data' in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('auth_token');
      // Navigation to login will be handled by auth state listener
    }
    return Promise.reject(error);
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
};

// Accounts API
export const accountsApi = {
  getAll: () => api.get('/api/accounts'),
  getById: (id: string) => api.get(`/api/accounts/${id}`),
  create: (data: any) => api.post('/api/accounts', data),
  update: (id: string, data: any) => api.put(`/api/accounts/${id}`, data),
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
};

// Chat API
export const chatApi = {
  send: (message: string, conversationHistory: any[] = []) =>
    api.post('/api/ai/chat', { message, conversation_history: conversationHistory }),
  getContext: () => api.get('/api/ai/context'),
};

// EOD API
export const eodApi = {
  submitToday: (data: any) => api.post('/api/eod', data),
  getToday: () => api.get('/api/eod/today'),
  getHistory: (days?: number) =>
    api.get('/api/eod', { params: { days } }),
};

// Onboarding API
export const onboardingApi = {
  submitQuiz: (answers: any) => api.post('/api/onboarding/quiz', { answers }),
  getStatus: () => api.get('/api/onboarding/status'),
};

// Milestones API
export const milestonesApi = {
  getAll: () => api.get('/api/milestones'),
  check: () => api.post('/api/milestones/check'),
  celebrate: (key: string) => api.post(`/api/milestones/${key}/celebrate`),
};

// What-If API
export const whatifApi = {
  run: (type: string, parameters: any) =>
    api.post('/api/whatif/run', { scenario_type: type, parameters }),
  getSaved: () => api.get('/api/whatif/saved'),
  save: (scenario: any) => api.post('/api/whatif/save', scenario),
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
  createTemplate: (data: any) => api.post('/api/coach/templates', data),
  applyTemplate: (templateId: string, studentId: string) =>
    api.post(`/api/coach/templates/${templateId}/apply/${studentId}`),
};

// Notifications API
export const notificationsApi = {
  getPreferences: () => api.get('/api/notifications/preferences'),
  updatePreferences: (data: any) => api.put('/api/notifications/preferences', data),
};

// AI API (beyond chat)
export const aiApi = {
  getSpendingDNA: (month: string) => api.post('/api/ai/spending-dna', { month }),
};

// Profile API
export const profileApi = {
  get: () => api.get('/api/profile'),
  update: (data: any) => api.put('/api/profile', data),
};

export default api;
