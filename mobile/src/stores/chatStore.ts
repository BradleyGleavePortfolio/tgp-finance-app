// AI chat history state management
import { create } from 'zustand';
import { aiApi } from '../services/api';
import type { ChatMessage } from '../types';

interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  isChatOpen: boolean;
  error: string | null;

  sendMessage: (content: string) => Promise<void>;
  openChat: () => void;
  closeChat: () => void;
  clearHistory: () => void;
  clearError: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isLoading: false,
  isChatOpen: false,
  error: null,

  sendMessage: async (content) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      error: null,
    }));

    try {
      const history = get().messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { data } = await aiApi.chat(content, history);
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || data.message || data,
        timestamp: new Date().toISOString(),
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI response failed';
      set({ isLoading: false, error: message });

      // Add error message in chat
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm having trouble connecting right now. Try again in a moment.",
        timestamp: new Date().toISOString(),
      };
      set((state) => ({ messages: [...state.messages, errorMessage] }));
    }
  },

  openChat: () => set({ isChatOpen: true }),
  closeChat: () => set({ isChatOpen: false }),
  clearHistory: () => set({ messages: [] }),
  clearError: () => set({ error: null }),
}));
