import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../services/api';

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  onboardingComplete: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectRole: (roleId: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,

  initialize: async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        set({ token });
        const { data: resp } = await authApi.me();
        const me = resp;
        set({
          user: me,
          isAuthenticated: true,
          isLoading: false,
        });
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
      const { token } = data;
      await AsyncStorage.setItem('auth_token', token);
      set({ token });

      const { data: resp } = await authApi.me();
      const me = resp;
      set({
        user: me,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Login failed',
        isLoading: false,
      });
      throw error;
    }
  },

  logout: async () => {
    await AsyncStorage.removeItem('auth_token');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null,
    });
  },

  selectRole: async (roleId: string) => {
    set({ isLoading: true });
    try {
      await authApi.selectRole(roleId);
      const { data: resp } = await authApi.me();
      const me = resp;
      set({
        user: me,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Role selection failed',
        isLoading: false,
      });
      throw error;
    }
  },

  refreshUser: async () => {
    try {
      const { data: resp } = await authApi.me();
      const me = resp;
      set({ user: me });
    } catch (error) {
      // Silently fail - user data will be stale but app won't crash
    }
  },
}));
