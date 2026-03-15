// Financial accounts state management
import { create } from 'zustand';
import { accountsApi } from '../services/api';
import type { FinancialAccount, AccountBalanceLog } from '../types';
import { computeNetWorth, computeDailyInterest } from '../utils/financial';

interface AccountsStore {
  accounts: FinancialAccount[];
  isLoading: boolean;
  error: string | null;
  netWorth: number;
  totalAssets: number;
  totalDebt: number;
  totalCash: number;
  dailyInterest: number;
  lastFetched: number | null;

  fetchAccounts: () => Promise<void>;
  addAccount: (data: Partial<FinancialAccount>) => Promise<void>;
  updateAccount: (id: string, data: Partial<FinancialAccount>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  getAccountHistory: (id: string, days?: number) => Promise<AccountBalanceLog[]>;
  updateLocalBalance: (id: string, balance: number) => void;
  clearError: () => void;
}

export const useAccountsStore = create<AccountsStore>((set, get) => ({
  accounts: [],
  isLoading: false,
  error: null,
  netWorth: 0,
  totalAssets: 0,
  totalDebt: 0,
  totalCash: 0,
  dailyInterest: 0,
  lastFetched: null,

  fetchAccounts: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await accountsApi.getAll();
      const accounts: FinancialAccount[] = data.accounts || data;
      const computed = computeNetWorth(accounts);
      const dailyInterest = computeDailyInterest(accounts);

      set({
        accounts,
        ...computed,
        dailyInterest,
        isLoading: false,
        lastFetched: Date.now(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load accounts';
      set({ isLoading: false, error: message });
    }
  },

  addAccount: async (accountData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await accountsApi.create(accountData as Record<string, unknown>);
      const newAccount: FinancialAccount = data.account || data;
      const accounts = [...get().accounts, newAccount];
      const computed = computeNetWorth(accounts);
      const dailyInterest = computeDailyInterest(accounts);
      set({ accounts, ...computed, dailyInterest, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add account';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  updateAccount: async (id, accountData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await accountsApi.update(id, accountData as Record<string, unknown>);
      const updated: FinancialAccount = data.account || data;
      const accounts = get().accounts.map((a) => (a.id === id ? { ...a, ...updated } : a));
      const computed = computeNetWorth(accounts);
      const dailyInterest = computeDailyInterest(accounts);
      set({ accounts, ...computed, dailyInterest, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update account';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  deleteAccount: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await accountsApi.delete(id);
      const accounts = get().accounts.filter((a) => a.id !== id);
      const computed = computeNetWorth(accounts);
      const dailyInterest = computeDailyInterest(accounts);
      set({ accounts, ...computed, dailyInterest, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete account';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  getAccountHistory: async (id, days = 30) => {
    try {
      const { data } = await accountsApi.getHistory(id, days);
      return data.history || data;
    } catch {
      return [];
    }
  },

  updateLocalBalance: (id, balance) => {
    const accounts = get().accounts.map((a) => (a.id === id ? { ...a, balance } : a));
    const computed = computeNetWorth(accounts);
    const dailyInterest = computeDailyInterest(accounts);
    set({ accounts, ...computed, dailyInterest });
  },

  clearError: () => set({ error: null }),
}));
