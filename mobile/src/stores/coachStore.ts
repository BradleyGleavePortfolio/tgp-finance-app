// Coach dashboard state management — BULLETPROOF
import { create } from 'zustand';
import { coachApi } from '../services/api';
import type {
  CoachStudentSummary,
  CoachAlert,
  CoachNote,
  EODSubmission,
  FinancialAccount,
  FinancialProfile,
  MilestoneUnlock,
  NetWorthHistory,
  ProgramTemplate,
  User,
} from '../types';

/** Safely extract an array from any API response shape */
function safeArray<T>(data: unknown, key: string): T[] {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown>)[key];
  if (Array.isArray(inner)) return inner as T[];
  return [];
}

// Server-computed weekly rollup envelope returned by /coach/students/:id/detail.
// Kept structural rather than a Prisma-derived shape so it stays loose if the
// backend adds fields — consumers only read net_worth/total_debt/etc. when
// rendering charts.
interface WeeklyRollup {
  week_start: string;
  net_worth?: number;
  total_debt?: number;
  total_assets?: number;
  total_cash?: number;
  [extra: string]: unknown;
}

interface StudentDetailData {
  student: User;
  profile: FinancialProfile | null;
  accounts: FinancialAccount[];
  eod_submissions: EODSubmission[];
  net_worth_history: NetWorthHistory[];
  weekly_rollups: WeeklyRollup[];
  milestones: MilestoneUnlock[];
  coach_notes: CoachNote[];
  period_days: number;
}

interface CoachStore {
  students: CoachStudentSummary[];
  selectedStudent: CoachStudentSummary | null;
  studentDetail: StudentDetailData | null;
  alerts: CoachAlert[];
  templates: ProgramTemplate[];
  isLoading: boolean;
  error: string | null;

  fetchStudents: (search?: string) => Promise<void>;
  fetchStudent: (id: string) => Promise<void>;
  fetchStudentDetail: (id: string, days?: number) => Promise<void>;
  fetchAlerts: () => Promise<void>;
  fetchTemplates: () => Promise<void>;
  addNote: (studentId: string, note: string, isPrivate?: boolean) => Promise<void>;
  createTemplate: (data: Partial<ProgramTemplate>) => Promise<void>;
  applyTemplate: (templateId: string, studentId: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const initialCoachState = {
  students: [] as CoachStudentSummary[],
  selectedStudent: null as CoachStudentSummary | null,
  studentDetail: null as StudentDetailData | null,
  alerts: [] as CoachAlert[],
  templates: [] as ProgramTemplate[],
  isLoading: false,
  error: null as string | null,
};

export const useCoachStore = create<CoachStore>((set, get) => ({
  ...initialCoachState,

  fetchStudents: async (search?: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await coachApi.getStudents(search);
      const students = safeArray<CoachStudentSummary>(data, 'students');
      set({ students, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load students';
      set({ isLoading: false, error: message });
    }
  },

  fetchStudent: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await coachApi.getStudent(id);
      const student = data?.student || data || null;
      set({ selectedStudent: student, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load student';
      set({ isLoading: false, error: message });
    }
  },

  fetchStudentDetail: async (id, days = 90) => {
    set({ isLoading: true, error: null, studentDetail: null });
    try {
      const { data } = await coachApi.getStudentDetail(id, days);
      set({ studentDetail: data || null, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load student detail';
      set({ isLoading: false, error: message });
    }
  },

  fetchAlerts: async () => {
    try {
      const { data } = await coachApi.getAlerts();
      const alerts = safeArray<CoachAlert>(data, 'alerts');
      set({ alerts });
    } catch {
      /* Non-critical — alerts will show empty */
    }
  },

  fetchTemplates: async () => {
    try {
      const { data } = await coachApi.getTemplates();
      const templates = safeArray<ProgramTemplate>(data, 'templates');
      set({ templates });
    } catch {
      /* Non-critical — templates will show empty */
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
      // The store accepts Partial<ProgramTemplate>; the API requires a complete
      // create body. Fall back to safe defaults when the caller didn't provide
      // them — caller-side validation is upstream of this method.
      const body = {
        name: templateData.name ?? '',
        description: templateData.description,
        phases: templateData.phases ?? [],
      };
      const { data } = await coachApi.createTemplate(body);
      const template: ProgramTemplate = data?.template || data;
      if (template?.id) {
        set((state) => ({
          templates: [template, ...(Array.isArray(state.templates) ? state.templates : [])],
        }));
      }
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
  reset: () => set(initialCoachState),
}));
