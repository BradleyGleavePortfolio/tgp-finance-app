/**
 * Stage 2 — Coach OS API contract types.
 *
 * Mirrors the backend payloads in `backend/src/coach/coach.controller.ts`
 * exactly. Kept in a dedicated file so the API client (services/api.ts)
 * can declare typed return shapes without bloating the catch-all
 * `src/types/index.ts`.
 *
 * Naming convention: snake_case fields (matches the wire shape from
 * NestJS + Prisma). camelCase derivations belong to the screens that
 * adapt them.
 */

export type ClientStatus = 'active' | 'at_risk' | 'onboarding' | 'inactive';

export type ClientSortKey = 'name' | 'last_activity' | 'net_worth' | 'savings_rate';

export type AssignmentStatus = 'open' | 'completed' | 'dismissed';

export type AssignmentType =
  | 'budget'
  | 'savings_challenge'
  | 'debt_paydown'
  | 'habit'
  | 'custom';

export type CommunityPostStatus = 'draft' | 'published' | 'archived';

export type CommunityPostAudience = 'own_clients' | 'all_clients';

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface CoachDashboardActivityItem {
  kind: 'eod' | 'milestone';
  at: string; // ISO date
  client_id: string;
  client_name: string;
  summary: string;
}

export interface CoachDashboardAttention {
  id: string;
  name: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  days_silent: number | null;
}

export interface CoachDashboardResponse {
  stats: {
    total_clients: number;
    active_this_week: number;
    needs_attention: number;
    open_assignments: number;
    roster_net_worth: number;
    roster_total_debt: number;
    roster_total_assets: number;
  };
  clients_needing_attention: CoachDashboardAttention[];
  recent_activity: CoachDashboardActivityItem[];
}

// ─── Clients list ────────────────────────────────────────────────────────────

export interface CoachClientRow {
  id: string;
  name: string;
  email: string;
  status: ClientStatus;
  net_worth: number;
  total_debt: number;
  total_assets: number;
  wealth_velocity_score: number;
  primary_goal: string | null;
  days_since_last_checkin: number | null;
  eod_submission_count: number;
  priority_index: number;
  joined_at: string;
}

// ─── Client detail tabs ──────────────────────────────────────────────────────

export interface CoachClientSummary {
  client: { id: string; name: string; email: string; coach_id: string | null; role: string };
  profile: Record<string, unknown> | null;
  account_totals: {
    total_assets: number;
    total_debt: number;
    total_cash: number;
    net_worth: number;
  };
  recent_eods: Array<{
    date: string;
    net_worth: string | number;
    total_debt: string | number;
    total_assets: string | number;
    mood: number | null;
  }>;
  habit_logs: Array<{ habit_key: string; date: string; completed: boolean }>;
  milestones: Array<{ key: string; unlocked_at: string }>;
}

export interface CoachClientAccountRow {
  id: string;
  name: string;
  account_type: string;
  institution: string | null;
  balance: number;
  is_debt: boolean;
  apr_percent: number | null;
  minimum_payment: number;
  currency: string;
  updated_at: string;
}

export interface CoachClientCashflow {
  period_days: number;
  submissions: number;
  avg_net_worth_30d: number;
  total_assets_observed: number;
  timeline: Array<{
    date: string;
    net_worth: number;
    debt: number;
    assets: number;
    mood: number | null;
  }>;
}

export interface CoachClientGoals {
  primary_goal: string | null;
  goal_timeline_months: number | null;
  dream_lifestyle_cost_mo: number;
  dream_description: string | null;
  current_priority_index: number;
  milestones: Array<{ key: string; unlocked_at: string }>;
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export interface CoachNoteRow {
  id: string;
  coach_id: string;
  student_id: string;
  note: string;
  is_private: boolean;
  created_at: string;
}

// ─── Assignments ─────────────────────────────────────────────────────────────

export interface ClientAssignmentRow {
  id: string;
  coach_id: string;
  client_id: string;
  title: string;
  description: string | null;
  assignment_type: AssignmentType;
  due_date: string | null;
  status: AssignmentStatus;
  target_value: number | null;
  target_unit: string | null;
  coach_notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateAssignmentBody {
  title: string;
  description?: string;
  assignment_type?: AssignmentType;
  due_date?: string; // ISO
  target_value?: number;
  target_unit?: string;
  coach_notes?: string;
}

export interface UpdateAssignmentBody {
  title?: string;
  description?: string;
  assignment_type?: AssignmentType;
  due_date?: string | null;
  status?: AssignmentStatus;
  target_value?: number | null;
  target_unit?: string | null;
  coach_notes?: string | null;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface CoachMessageRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
  from_coach: boolean;
}

export interface CoachMessageThread {
  thread_key: string;
  messages: CoachMessageRow[];
}

export interface CoachMessageThreadRow {
  client_id: string;
  client_name: string;
  client_email: string;
  last_message: {
    id: string;
    body: string;
    created_at: string;
    from_coach: boolean;
  } | null;
  unread_count: number;
}

// ─── Community posts ─────────────────────────────────────────────────────────

export interface CommunityPostRow {
  id: string;
  author_id: string;
  title: string;
  body: string;
  resource_url: string | null;
  status: CommunityPostStatus;
  audience: CommunityPostAudience;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface CreateCommunityPostBody {
  title: string;
  body: string;
  resource_url?: string;
  status?: CommunityPostStatus;
  audience?: CommunityPostAudience;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface PracticeAnalytics {
  total_clients: number;
  retention_30d_pct: number;
  avg_velocity_score: number;
  eod_submissions_30d: number;
  roster_total_assets: number;
  roster_total_debt: number;
  roster_net_worth: number;
}
