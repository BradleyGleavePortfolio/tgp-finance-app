import { create } from 'zustand';
import { chatApi } from '../services/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;

  sendMessage: (message: string, context?: any) => Promise<void>;
  loadHistory: () => Promise<void>;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,

  sendMessage: async (message: string, context?: any) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      error: null,
    }));

    try {
      const { data } = await chatApi.send(message, context);
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: typeof data === 'string' ? data : (data.response || data.message || JSON.stringify(data)),
        timestamp: new Date(),
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to send message',
        isLoading: false,
      });
    }
  },

  loadHistory: async () => {
    set({ isLoading: true });
    try {
      const { data } = await chatApi.getHistory();
      const messages = data.messages || data;
      set({ messages, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to load chat history',
        isLoading: false,
      });
    }
  },

  clearMessages: () => set({ messages: [] }),
}));
