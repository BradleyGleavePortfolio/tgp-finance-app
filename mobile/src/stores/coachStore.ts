// Coach dashboard state management
import { create } from 'zustand';
import { coachApi } from '../services/api';
import type { CoachStudentSummary, CoachAlert, ProgramTemplate } from '../types';

interface CoachStore {
  students: CoachStudentSummary[];
  selectedStudent: CoachStudentSummary | null;
  alerts: CoachAlert[];
  templates: ProgramTemplate[];
  isLoading: boolean;
  error: string | null;

  fetchStudents: () => Promise<void>;
  fetchStudent: (id: string) => Promise<void>;
  fetchAlerts: () => Promise<void>;
  fetchTemplates: () => Promise<void>;
  addNote: (studentId: string, note: string, isPrivate?: boolean) => Promise<void>;
  createTemplate: (data: Partial<ProgramTemplate>) => Promise<void>;
  applyTemplate: (templateId: string, studentId: string) => Promise<void>;
  clearError: () => void;
}

export const useCoachStore = create<CoachStore>((set, get) => ({
  students: [],
  selectedStudent: null,
  alerts: [],
  templates: [],
  isLoading: false,
  error: null,

  fetchStudents: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await coachApi.getStudents();
      set({ students: data.students || data, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load students';
      set({ isLoading: false, error: message });
    }
  },

  fetchStudent: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await coachApi.getStudent(id);
      set({ selectedStudent: data.student || data, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load student';
      set({ isLoading: false, error: message });
    }
  },

  fetchAlerts: async () => {
    try {
      const { data } = await coachApi.getAlerts();
      set({ alerts: data.alerts || data });
    } catch {
      // Silent failure
    }
  },

  fetchTemplates: async () => {
    try {
      const { data } = await coachApi.getTemplates();
      set({ templates: data.templates || data });
    } catch {
      // Silent failure
    }
  },

  addNote: async (studentId, note, isPrivate = false) => {
    try {
      await coachApi.addNote(studentId, note, isPrivate);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add note';
      set({ error: message });
      throw err;
    }
  },

  createTemplate: async (templateData) => {
    try {
      const { data } = await coachApi.createTemplate(templateData as Record<string, unknown>);
      const template: ProgramTemplate = data.template || data;
      set((state) => ({ templates: [template, ...state.templates] }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create template';
      set({ error: message });
    }
  },

  applyTemplate: async (templateId, studentId) => {
    try {
      await coachApi.applyTemplate(templateId, studentId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to apply template';
      set({ error: message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
