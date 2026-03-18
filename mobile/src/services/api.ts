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

// Response interceptor to unwrap TransformInterceptor envelope
api.interceptors.response.use(
  (response) => {
    // Unwrap TransformInterceptor envelope: { data, success, timestamp } → data
    if (response.data && typeof response.data === 'object' && 'success' in response.data && 'data' in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for 401 handling
api.interceptors.response.use(
  (response) => response,
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
  refreshToken: () => api.post('/api/auth/refresh'),
};

// Accounts API
export const accountsApi = {
  getAll: () => api.get('/api/accounts'),
  getById: (id: string) => api.get(`/api/accounts/${id}`),
  create: (data: any) => api.post('/api/accounts', data),
  update: (id: string, data: any) => api.put(`/api/accounts/${id}`, data),
  delete: (id: string) => api.delete(`/api/accounts/${id}`),
  sync: (id: string) => api.post(`/api/accounts/${id}/sync`),
};

// Net Worth API
export const networthApi = {
  getCurrent: () => api.get('/api/networth/current'),
  getHistory: (period?: string) =>
    api.get('/api/networth/history', { params: { period } }),
};

// Priority API
export const priorityApi = {
  getCurrent: () => api.get('/api/priorities/current'),
  getAll: () => api.get('/api/priorities'),
  update: (id: string, data: any) => api.put(`/api/priorities/${id}`, data),
  complete: (id: string) => api.post(`/api/priorities/${id}/complete`),
};

// Chat API
export const chatApi = {
  send: (message: string, context?: any) =>
    api.post('/api/chat', { message, context }),
  getHistory: () => api.get('/api/chat/history'),
};

// EOD API
export const eodApi = {
  submitToday: (data: any) => api.post('/api/eod', data),
  getToday: () => api.get('/api/eod/today'),
  getHistory: (limit?: number) =>
    api.get('/api/eod/history', { params: { limit } }),
};

// Onboarding API
export const onboardingApi = {
  submitQuiz: (answers: any) => api.post('/api/onboarding/quiz', { answers }),
  getStatus: () => api.get('/api/onboarding/status'),
};

export default api;
