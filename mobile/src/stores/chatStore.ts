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

  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,

  sendMessage: async (message: string) => {
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
      // Send conversation history (last 10 messages) for context
      const history = get().messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { data } = await chatApi.send(message, history);

      // Backend returns { reply, model } wrapped in TransformInterceptor envelope
      const replyText =
        typeof data === 'string'
          ? data
          : data?.reply || data?.response || data?.message || JSON.stringify(data);

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: replyText,
        timestamp: new Date(),
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false,
      }));
    } catch (error) {
      const e = error as {
        response?: { data?: { error?: unknown; message?: unknown } };
        message?: unknown;
      };
      const rawError =
        (typeof e.response?.data?.error === 'string' && e.response.data.error) ||
        (typeof e.response?.data?.message === 'string' && e.response.data.message) ||
        (typeof e.message === 'string' && e.message) ||
        'Something went wrong. Try again.';
      // Never show raw HTTP exception class names to the user
      const errorMsg = rawError.includes('Exception') || rawError.includes('exception')
        ? 'AI service is temporarily unavailable. Please try again in a moment.'
        : rawError;

      // Add an error message as an assistant response so user sees it in chat
      const errorBubble: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorMsg,
        timestamp: new Date(),
      };

      set((state) => ({
        messages: [...state.messages, errorBubble],
        error: errorMsg,
        isLoading: false,
      }));
    }
  },

  clearMessages: () => set({ messages: [], error: null }),
  clearError: () => set({ error: null }),
  reset: () => set({ messages: [], isLoading: false, error: null }),
}));
