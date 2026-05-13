import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EODSubmission, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toN } from '../common/money';
import { scopeToCoach } from '../auth/scope';
import { PushSenderService } from '../push/push-sender.service';

export interface CoachAlert {
  student_id: string;
  student_name: string;
  alert_type: 'missed_checkin' | 'low_velocity';
  message: string;
  severity: 'low' | 'medium' | 'high';
  days_since_last?: number | null;
}

// ─── Stage 2 typed payloads ───────────────────────────────────────────────────
//
// Money fields use the same Decimal | number shape the Zod money helper emits
// so the controller can pass parsed results straight through. The service
// runs `toN()` at the boundary before persisting, which Prisma then re-coerces
// to Decimal via its driver.

import type { Prisma as PrismaTypes } from '@prisma/client';
type MoneyInput = PrismaTypes.Decimal | number;

export interface CreateAssignmentInput {
  title: string;
  description?: string;
  assignment_type?: 'budget' | 'savings_challenge' | 'debt_paydown' | 'habit' | 'custom';
  due_date?: string; // ISO
  target_value?: MoneyInput;
  target_unit?: string;
  coach_notes?: string;
}

export interface UpdateAssignmentInput {
  title?: string;
  description?: string;
  assignment_type?: 'budget' | 'savings_challenge' | 'debt_paydown' | 'habit' | 'custom';
  due_date?: string | null;
  status?: 'open' | 'completed' | 'dismissed';
  target_value?: MoneyInput | null;
  target_unit?: string | null;
  coach_notes?: string | null;
}

export interface CreateCommunityPostInput {
  title: string;
  body: string;
  resource_url?: string;
  status?: 'draft' | 'published' | 'archived';
  audience?: 'own_clients' | 'all_clients';
}

/** Build a deterministic thread_key for a coach/client pair. */
export function threadKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

/**
 * Sprint A audit fix coach #5 — opaque base64-encoded cursor for
 * roster pagination. The body is just the row id; the encoding makes
 * the value opaque to clients so they treat it as an opaque token
 * rather than a row primary key.
 */
export function encodeRosterCursor(id: string): string {
  return Buffer.from(`v1:${id}`, 'utf8').toString('base64url');
}

export function decodeRosterCursor(cursor: string | undefined): string | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!decoded.startsWith('v1:')) return null;
    const id = decoded.slice('v1:'.length);
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

// Minimal surface CoachService uses from PushSenderService. Declared
// inline so tests can pass a stub without pulling in the full Push
// module — and so the legacy unit tests that construct the service
// with one argument continue to compile.
type PushSenderLike = Pick<PushSenderService, 'send'>;
const NOOP_PUSH_SENDER: PushSenderLike = {
  send: async () => ({ sent: false, reason: 'no_push_sender_in_test' }),
};

@Injectable()
export class CoachService {
  private readonly pushSender: PushSenderLike;

  constructor(
    private readonly prisma: PrismaService,
    pushSender?: PushSenderService,
  ) {
    this.pushSender = pushSender ?? NOOP_PUSH_SENDER;
  }

  /**
   * Legacy roster query used by the v1 dashboard list. `getCoachClients`
   * supersedes this for the Coach OS; we keep it for back-compat but now
   * clamp the result to MAX_TAKE so an OWNER fetching the full roster
   * cannot pull a million-row response into memory. Cursor pagination via
   * `cursor` (last seen user id) lets callers walk past the cap when they
   * really need to.
   */
  async getStudents(
    coachId: string,
    search?: string,
    role: string = 'coach',
    opts: { take?: number; cursor?: string } = {},
  ) {
    const MAX_TAKE = 200;
    const DEFAULT_TAKE = 100;
    const take = Math.min(Math.max(opts.take ?? DEFAULT_TAKE, 1), MAX_TAKE);

    // OWNER sees every student across every coach; coach sees only their own.
    // scopeToCoach returns {} for owner, { coach_id: coachId } for coach.
    const scope = scopeToCoach({ id: coachId, role });
    const where: Prisma.UserWhereInput = { role: 'student', ...scope };

    // Support email search (exact or partial)
    if (search && search.trim()) {
      where.email = { contains: search.trim(), mode: 'insensitive' };
    }

    const cursor = opts.cursor ? { id: opts.cursor } : undefined;

    const students = await this.prisma.user.findMany({
      where,
      include: {
        profile: {
          select: {
            net_worth_snapshot: true,
            total_debt: true,
            total_assets: true,
            wealth_velocity_score: true,
            current_priority_index: true,
            last_eod_date: true,
          },
        },
        _count: { select: { eod_submissions: true } },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      take,
      ...(cursor ? { cursor, skip: 1 } : {}),
    });

    const todayUTC = new Date().toISOString().split('T')[0];

    return students.map((s) => {
      const profile = s.profile;
      const lastEodDate = profile?.last_eod_date ?? null;
      const submittedToday = lastEodDate != null && String(lastEodDate).startsWith(todayUTC);

      return {
        user: { id: s.id, email: s.email, name: s.name },
        profile: {
          wealth_velocity_score: profile?.wealth_velocity_score ?? 0,
          net_worth_snapshot: profile?.net_worth_snapshot ?? 0,
          current_priority_index: profile?.current_priority_index ?? 0,
          last_eod_date: lastEodDate,
        },
        submitted_today: submittedToday,
        last_submission: lastEodDate ? String(lastEodDate) : null,
        red_flags: [],
      };
    });
  }

  async getStudentDetail(coachId: string, studentId: string, role: string = 'coach') {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        profile: true,
        accounts: { where: { is_active: true } },
        eod_submissions: { orderBy: { submission_date: 'desc' }, take: 30 },
        milestones: true,
        notification_prefs: true,
        // For coaches, scope notes to their own; for owners, surface all notes
        // written by any coach about this student so the admin view is complete.
        coach_notes_received: {
          where: role === 'owner' ? {} : { coach_id: coachId },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!student) throw new NotFoundException({ error: 'Student not found', code: 'NOT_FOUND' });
    if (student.role !== 'student') {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }
    if (role !== 'owner' && student.coach_id !== coachId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    return student;
  }

  // SECURITY: shared ownership check used by any coach action that targets a specific student.
  // OWNER bypass: an admin (role='owner') is allowed to act on any student regardless of
  // their coach assignment. Pass `role` from the controller so the service-layer check
  // matches the route-layer OwnsStudentGuard behavior.
  private async assertCoachOwnsStudent(
    coachId: string,
    studentId: string,
    role: string = 'coach',
  ): Promise<void> {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, coach_id: true, role: true },
    });
    if (!student) throw new NotFoundException({ error: 'Student not found', code: 'NOT_FOUND' });
    if (student.role !== 'student') {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }
    if (role === 'owner') return;
    if (student.coach_id !== coachId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }
  }

  /**
   * Phase 1B client summary used by coach messaging UI.
   *
   * Returns enough structured data for a coach to be informed before/while
   * messaging a client without paginating through the full detail view:
   *   - identity + profile basics
   *   - account roll-ups (debt/asset/cash totals)
   *   - last 14 EOD submissions (net worth trajectory)
   *   - last 14 days of habit logs
   *   - any active milestones
   *
   * Owner bypass is honored via the role parameter (route-level guard already
   * enforced membership for non-owners, but we re-check here for defense in
   * depth, mirroring the rest of the service).
   */
  async getClientSummary(coachId: string, clientId: string, role: string = 'coach') {
    await this.assertCoachOwnsStudent(coachId, clientId, role);

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const [client, recentEods, habits, milestones] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: clientId },
        include: {
          profile: true,
          accounts: { where: { is_active: true } },
        },
      }),
      this.prisma.eODSubmission.findMany({
        where: { user_id: clientId },
        orderBy: { submission_date: 'desc' },
        take: 14,
      }),
      this.prisma.habitLog.findMany({
        where: { user_id: clientId, date: { gte: fourteenDaysAgo } },
        orderBy: { date: 'desc' },
      }),
      this.prisma.milestoneUnlock.findMany({
        where: { user_id: clientId },
        orderBy: { unlocked_at: 'desc' },
        take: 10,
      }),
    ]);

    if (!client) {
      throw new NotFoundException({ error: 'Client not found', code: 'NOT_FOUND' });
    }

    const accountTotals = (client.accounts ?? []).reduce(
      (acc, a) => {
        const bal = toN(a.balance);
        if (a.is_debt) acc.debt += bal;
        else acc.assets += bal;
        if (['checking', 'savings'].includes(a.account_type) && !a.is_debt) acc.cash += bal;
        return acc;
      },
      { assets: 0, debt: 0, cash: 0 },
    );

    return {
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        coach_id: client.coach_id,
        role: client.role,
      },
      profile: client.profile,
      account_totals: {
        total_assets: Math.round(accountTotals.assets),
        total_debt: Math.round(accountTotals.debt),
        total_cash: Math.round(accountTotals.cash),
        net_worth: Math.round(accountTotals.assets - accountTotals.debt),
      },
      recent_eods: recentEods.map((e) => ({
        date: e.submission_date,
        net_worth: e.net_worth_computed,
        total_debt: e.total_debt_computed,
        total_assets: e.total_assets_computed,
        mood: e.mood,
      })),
      habit_logs: habits.map((h) => ({ habit_key: h.habit_key, date: h.date, completed: h.completed })),
      milestones: milestones.map((m) => ({ key: m.milestone_key, unlocked_at: m.unlocked_at })),
    };
  }

  async getStudentDetailWithHistory(
    coachId: string,
    studentId: string,
    days: number = 90,
    role: string = 'coach',
  ) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: { profile: true, accounts: { where: { is_active: true } } },
    });

    if (!student) throw new NotFoundException({ error: 'Student not found', code: 'NOT_FOUND' });
    if (role !== 'owner' && student.coach_id !== coachId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const [eodSubmissions, milestones, notes] = await Promise.all([
      this.prisma.eODSubmission.findMany({
        where: { user_id: studentId, submitted_at: { gte: since } },
        orderBy: { submission_date: 'desc' },
      }),
      this.prisma.milestoneUnlock.findMany({
        where: { user_id: studentId },
        orderBy: { unlocked_at: 'desc' },
      }),
      this.prisma.coachNote.findMany({
        where: { student_id: studentId, coach_id: coachId },
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
    ]);

    // Build net worth history from EOD submissions
    const netWorthHistory = eodSubmissions.map((e) => ({
      date: e.submission_date,
      net_worth: e.net_worth_computed,
      total_assets: e.total_assets_computed,
      total_debt: e.total_debt_computed,
      total_cash: e.total_cash_computed,
    }));

    // Weekly rollups
    const weeklyRollups = this.computeWeeklyRollups(eodSubmissions);

    return {
      student: {
        id: student.id,
        email: student.email,
        name: student.name,
        role: student.role,
        created_at: student.created_at,
      },
      profile: student.profile,
      accounts: student.accounts,
      eod_submissions: eodSubmissions,
      net_worth_history: netWorthHistory,
      weekly_rollups: weeklyRollups,
      milestones,
      coach_notes: notes,
      period_days: days,
    };
  }

  private computeWeeklyRollups(submissions: EODSubmission[]) {
    if (submissions.length === 0) return [];

    const weeks = new Map<string, EODSubmission[]>();
    for (const sub of submissions) {
      const date = new Date(sub.submission_date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const key = weekStart.toISOString().split('T')[0];
      if (!weeks.has(key)) weeks.set(key, []);
      weeks.get(key)!.push(sub);
    }

    return Array.from(weeks.entries()).map(([weekOf, subs]) => ({
      week_of: weekOf,
      submissions_count: subs.length,
      avg_net_worth: Math.round(subs.reduce((s, e) => s + toN(e.net_worth_computed), 0) / subs.length),
      avg_debt: Math.round(subs.reduce((s, e) => s + toN(e.total_debt_computed), 0) / subs.length),
      avg_assets: Math.round(subs.reduce((s, e) => s + toN(e.total_assets_computed), 0) / subs.length),
    }));
  }

  async getAlerts(coachId: string) {
    const students = await this.prisma.user.findMany({
      where: { role: 'student', coach_id: coachId },
      include: {
        profile: { select: { last_eod_date: true, wealth_velocity_score: true } },
      },
    });

    const alerts: CoachAlert[] = [];
    const now = new Date();

    for (const student of students) {
      const lastEOD = student.profile?.last_eod_date;
      const daysSinceEOD = lastEOD
        ? Math.floor((now.getTime() - new Date(lastEOD).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      if (daysSinceEOD === null || daysSinceEOD >= 3) {
        alerts.push({
          student_id: student.id,
          student_name: student.name,
          alert_type: 'missed_checkin',
          message: `${student.name} hasn't submitted in ${daysSinceEOD ?? 'unknown'} days`,
          severity: daysSinceEOD !== null && daysSinceEOD >= 7 ? 'high' : 'medium',
          days_since_last: daysSinceEOD,
        });
      }

      const velocityScore = student.profile?.wealth_velocity_score || 0;
      if (velocityScore < 20) {
        alerts.push({
          student_id: student.id,
          student_name: student.name,
          alert_type: 'low_velocity',
          message: `${student.name} has low wealth velocity score: ${velocityScore}/100`,
          severity: 'low',
        });
      }
    }

    return alerts;
  }

  async createNote(coachId: string, studentId: string, note: string, is_private: boolean = false) {
    // SECURITY: verify the target student actually belongs to this coach before writing a note.
    await this.assertCoachOwnsStudent(coachId, studentId);
    return this.prisma.coachNote.create({
      data: { coach_id: coachId, student_id: studentId, note, is_private },
    });
  }

  async getWeeklyDigest(coachId: string) {
    const students = await this.prisma.user.findMany({
      where: { role: 'student', coach_id: coachId },
      include: {
        profile: true,
        eod_submissions: {
          where: {
            submitted_at: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        },
      },
    });

    const totalStudents = students.length;
    const submittedThisWeek = students.filter((s) => s.eod_submissions.length > 0).length;
    const avgVelocity =
      students.reduce((sum, s) => sum + (s.profile?.wealth_velocity_score || 0), 0) / (totalStudents || 1);

    const topPerformers = [...students]
      .sort((a, b) => (b.profile?.wealth_velocity_score || 0) - (a.profile?.wealth_velocity_score || 0))
      .slice(0, 3)
      .map((s) => ({ name: s.name, velocity_score: s.profile?.wealth_velocity_score || 0 }));

    const needsAttention = students
      .filter((s) => s.eod_submissions.length === 0)
      .map((s) => ({ name: s.name, id: s.id, last_active: s.profile?.last_eod_date }));

    return {
      week_of: new Date().toISOString().split('T')[0],
      total_students: totalStudents,
      submitted_this_week: submittedThisWeek,
      submission_rate_pct: totalStudents > 0 ? Math.round((submittedThisWeek / totalStudents) * 100) : 0,
      avg_velocity_score: Math.round(avgVelocity),
      top_performers: topPerformers,
      needs_attention: needsAttention,
    };
  }

  async getTemplates(coachId: string) {
    return this.prisma.programTemplate.findMany({
      where: { coach_id: coachId },
      orderBy: { created_at: 'desc' },
    });
  }

  async createTemplate(
    coachId: string,
    data: Omit<Prisma.ProgramTemplateUncheckedCreateInput, 'coach_id'>,
  ) {
    return this.prisma.programTemplate.create({
      data: { coach_id: coachId, ...data },
    });
  }

  async applyTemplate(coachId: string, templateId: string, studentId: string) {
    const template = await this.prisma.programTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.coach_id !== coachId) {
      throw new NotFoundException({ error: 'Template not found', code: 'NOT_FOUND' });
    }

    // SECURITY: verify the target student actually belongs to this coach before mutating their
    // priority index or attaching a coach note.
    await this.assertCoachOwnsStudent(coachId, studentId);

    interface TemplatePhase { priority_index?: number }
    const phases = (Array.isArray(template.phases) ? template.phases : []) as TemplatePhase[];
    if (phases.length > 0) {
      const firstPhase = phases[0];
      await this.prisma.financialProfile.updateMany({
        where: { user_id: studentId },
        data: { current_priority_index: firstPhase.priority_index || 0 },
      });
    }

    // Create a coach note documenting the template application
    await this.prisma.coachNote.create({
      data: {
        coach_id: coachId,
        student_id: studentId,
        note: `Applied program template: "${template.name}" — ${template.description || ''}`,
        is_private: false,
      },
    });

    return { message: `Template "${template.name}" applied to student`, template_id: templateId };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stage 2 — Coach OS additions
  //
  // Each public method below either returns coach-scoped data (own_clients
  // only by default; owner sees all) or mutates coach-scoped data with an
  // explicit ownership check. The mobile coach module hits these directly.
  // ──────────────────────────────────────────────────────────────────────────

  /** Aggregated dashboard payload for the Coach Home screen. One round-trip. */
  async getCoachDashboard(coachId: string, role: string = 'coach') {
    const scope = scopeToCoach({ id: coachId, role });
    const where: Prisma.UserWhereInput = { role: 'student', ...scope };

    const [students, recentEods, openAssignments, recentMilestones] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          profile: {
            select: {
              net_worth_snapshot: true,
              total_debt: true,
              total_assets: true,
              wealth_velocity_score: true,
              last_eod_date: true,
              primary_goal: true,
            },
          },
        },
      }),
      // Activity feed = last 10 EOD submissions across the coach's roster.
      this.prisma.eODSubmission.findMany({
        where: { user: { role: 'student', ...scope } },
        orderBy: { submission_date: 'desc' },
        take: 10,
        include: { user: { select: { id: true, name: true } } },
      }),
      // "Open assignments" lets us surface compliance pressure on the coach's home.
      this.prisma.clientAssignment.count({
        where: {
          coach_id: role === 'owner' ? undefined : coachId,
          status: 'open',
        },
      }),
      // Recent milestones for the activity feed.
      this.prisma.milestoneUnlock.findMany({
        where: { user: { role: 'student', ...scope } },
        orderBy: { unlocked_at: 'desc' },
        take: 10,
        include: { user: { select: { id: true, name: true } } },
      }),
    ]);

    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    let totalNetWorth = 0;
    let totalDebt = 0;
    let totalAssets = 0;
    let needsAttention = 0;

    const clientsNeedingAttention: Array<{
      id: string;
      name: string;
      reason: string;
      severity: 'low' | 'medium' | 'high';
      days_silent: number | null;
    }> = [];

    for (const s of students) {
      const p = s.profile;
      totalNetWorth += toN(p?.net_worth_snapshot);
      totalDebt += toN(p?.total_debt);
      totalAssets += toN(p?.total_assets);
      const lastEod = p?.last_eod_date ? new Date(p.last_eod_date).getTime() : null;
      const daysSince = lastEod ? Math.floor((now - lastEod) / (24 * 60 * 60 * 1000)) : null;
      if (daysSince === null || daysSince >= 7) {
        needsAttention += 1;
        clientsNeedingAttention.push({
          id: s.id,
          name: s.name,
          reason:
            daysSince === null
              ? 'Never submitted a check-in'
              : `${daysSince} days since last check-in`,
          severity: daysSince === null || daysSince >= 14 ? 'high' : 'medium',
          days_silent: daysSince,
        });
      }
    }

    const activeThisWeek = students.filter((s) => {
      const last = s.profile?.last_eod_date;
      return last && now - new Date(last).getTime() < oneWeek;
    }).length;

    return {
      stats: {
        total_clients: students.length,
        active_this_week: activeThisWeek,
        needs_attention: needsAttention,
        open_assignments: openAssignments,
        roster_net_worth: Math.round(totalNetWorth),
        roster_total_debt: Math.round(totalDebt),
        roster_total_assets: Math.round(totalAssets),
      },
      clients_needing_attention: clientsNeedingAttention.slice(0, 8),
      recent_activity: [
        ...recentEods.map((e) => ({
          kind: 'eod' as const,
          at: e.submission_date,
          client_id: e.user_id,
          client_name: e.user.name,
          summary: `Logged a check-in (mood ${e.mood ?? '—'})`,
        })),
        ...recentMilestones.map((m) => ({
          kind: 'milestone' as const,
          at: m.unlocked_at,
          client_id: m.user_id,
          client_name: m.user.name,
          summary: `Unlocked milestone: ${m.milestone_key}`,
        })),
      ]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 10),
    };
  }

  /**
   * Searchable / filterable / sortable client list for the EHR-style screen.
   * Filtering and sorting are implemented in-memory after the prisma fetch
   * because the underlying ranks (savings rate, growth) are derived. For a
   * roster of <500 clients this is fine; we can move to a materialized
   * roster_summary table once the typical tenant exceeds that.
   */
  /**
   * Sprint A audit fix coach #5 — DB-layer pagination + status WHERE
   * + sort orderBy. The previous implementation pulled every roster
   * row, post-filtered + post-sorted in JS, and returned the whole
   * list with no `take`. On a coach with 100+ clients (which the
   * canonical positioning explicitly claims to support) this was a
   * memory-bound full-table scan per request.
   *
   * Status is derived from last_eod_date + eod_submissions count and
   * pushed down to the WHERE clause:
   *   - onboarding: profile.last_eod_date IS NULL (no EOD yet)
   *   - active:     last_eod_date within ACTIVE_DAYS
   *   - at_risk:    last_eod_date in (ACTIVE_DAYS, AT_RISK_DAYS]
   *   - inactive:   last_eod_date older than AT_RISK_DAYS
   *
   * Sort is mapped to a Prisma orderBy on the underlying column, so
   * Prisma's existing index on profile rows + the (coach_id, name)
   * index on User can serve the query without a sort phase.
   *
   * Cursor: opaque base64-encoded `id` of the last row in the
   * previous page. Prisma's `cursor + skip: 1` semantics give stable
   * pagination as long as the orderBy is total — we always include
   * `{ id: 'asc' }` as the tiebreaker.
   *
   * Limit: clamped to [1, MAX_TAKE]. Returns next_cursor when the
   * page was full.
   */
  async getCoachClients(
    coachId: string,
    opts: {
      search?: string;
      status?: 'all' | 'active' | 'at_risk' | 'onboarding' | 'inactive';
      sort?: 'name' | 'last_activity' | 'net_worth' | 'savings_rate';
      role?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    const MAX_TAKE = 50;
    const DEFAULT_TAKE = 25;
    const ACTIVE_DAYS = 3;
    const AT_RISK_DAYS = 14;

    const limit = Math.min(Math.max(opts.limit ?? DEFAULT_TAKE, 1), MAX_TAKE);
    const scope = scopeToCoach({ id: coachId, role: opts.role ?? 'coach' });
    const where: Prisma.UserWhereInput = { role: 'student', ...scope };

    if (opts.search && opts.search.trim()) {
      const term = opts.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    // Status -> WHERE on profile.last_eod_date.
    if (opts.status && opts.status !== 'all') {
      const now = new Date();
      const activeFloor = new Date(now.getTime() - ACTIVE_DAYS * 24 * 60 * 60 * 1000);
      const atRiskFloor = new Date(now.getTime() - AT_RISK_DAYS * 24 * 60 * 60 * 1000);
      switch (opts.status) {
        case 'onboarding':
          where.profile = { is: { last_eod_date: null } };
          break;
        case 'active':
          where.profile = { is: { last_eod_date: { gte: activeFloor } } };
          break;
        case 'at_risk':
          where.profile = {
            is: { last_eod_date: { gte: atRiskFloor, lt: activeFloor } },
          };
          break;
        case 'inactive':
          // last_eod_date is set (so not onboarding) AND older than AT_RISK_DAYS.
          where.profile = { is: { last_eod_date: { lt: atRiskFloor } } };
          break;
        default:
          break;
      }
    }

    // Map sort key -> Prisma orderBy. We always append `{ id: 'asc' }`
    // as the tiebreaker so cursor pagination is stable.
    const sortKey = opts.sort ?? 'last_activity';
    let orderBy: Prisma.UserOrderByWithRelationInput[] = [{ id: 'asc' }];
    switch (sortKey) {
      case 'name':
        orderBy = [{ name: 'asc' }, { id: 'asc' }];
        break;
      case 'net_worth':
        orderBy = [
          { profile: { net_worth_snapshot: 'desc' } },
          { id: 'asc' },
        ];
        break;
      case 'savings_rate':
        orderBy = [
          { profile: { wealth_velocity_score: 'desc' } },
          { id: 'asc' },
        ];
        break;
      case 'last_activity':
      default:
        // last_activity = most recent EOD first. NULLs (clients who
        // never logged) sort to the end.
        orderBy = [
          { profile: { last_eod_date: { sort: 'desc', nulls: 'last' } } },
          { id: 'asc' },
        ];
        break;
    }

    const decodedCursor = decodeRosterCursor(opts.cursor);
    const cursor = decodedCursor ? { id: decodedCursor } : undefined;
    const skip = cursor ? 1 : 0;

    // Fetch limit + 1 so we can compute next_cursor without an extra
    // round trip.
    const students = await this.prisma.user.findMany({
      where,
      include: {
        profile: {
          select: {
            net_worth_snapshot: true,
            total_debt: true,
            total_assets: true,
            wealth_velocity_score: true,
            last_eod_date: true,
            primary_goal: true,
            current_priority_index: true,
          },
        },
        _count: { select: { eod_submissions: true } },
      },
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor, skip } : {}),
    });

    const hasMore = students.length > limit;
    const page = hasMore ? students.slice(0, limit) : students;
    const nextCursor = hasMore && page.length > 0
      ? encodeRosterCursor(page[page.length - 1].id)
      : null;

    const now = Date.now();
    const clients = page.map((s) => {
      const lastEod = s.profile?.last_eod_date
        ? new Date(s.profile.last_eod_date).getTime()
        : null;
      const daysSince = lastEod
        ? Math.floor((now - lastEod) / (24 * 60 * 60 * 1000))
        : null;
      const eodCount = s._count?.eod_submissions ?? 0;
      let status: 'active' | 'at_risk' | 'onboarding' | 'inactive';
      if (eodCount === 0 || lastEod === null) {
        status = 'onboarding';
      } else if (daysSince !== null && daysSince <= ACTIVE_DAYS) {
        status = 'active';
      } else if (daysSince !== null && daysSince <= AT_RISK_DAYS) {
        status = 'at_risk';
      } else {
        status = 'inactive';
      }

      return {
        id: s.id,
        name: s.name,
        email: s.email,
        status,
        net_worth: Math.round(toN(s.profile?.net_worth_snapshot)),
        total_debt: Math.round(toN(s.profile?.total_debt)),
        total_assets: Math.round(toN(s.profile?.total_assets)),
        wealth_velocity_score: s.profile?.wealth_velocity_score ?? 0,
        primary_goal: s.profile?.primary_goal ?? null,
        days_since_last_checkin: daysSince,
        eod_submission_count: eodCount,
        priority_index: s.profile?.current_priority_index ?? 0,
        joined_at: s.created_at,
      };
    });

    return {
      clients,
      next_cursor: nextCursor,
      // Kept for back-compat with the existing mobile clients which
      // read `total` from the response. With cursor pagination this
      // is the page size, not the global count — the mobile UI can
      // migrate to next_cursor.
      total: clients.length,
    };
  }

  /** Combined accounts/goals/cashflow snapshot used by ClientDetail tabs. */
  async getClientAccounts(coachId: string, clientId: string, role: string = 'coach') {
    await this.assertCoachOwnsStudent(coachId, clientId, role);
    const accounts = await this.prisma.financialAccount.findMany({
      where: { user_id: clientId, is_active: true },
      orderBy: [{ is_debt: 'asc' }, { balance: 'desc' }],
    });
    return accounts.map((a) => ({
      id: a.id,
      name: a.name,
      account_type: a.account_type,
      institution: a.institution,
      balance: toN(a.balance),
      is_debt: a.is_debt,
      apr_percent: a.apr_percent,
      minimum_payment: toN(a.minimum_payment),
      currency: a.currency,
      updated_at: a.updated_at,
    }));
  }

  async getClientCashflow(coachId: string, clientId: string, role: string = 'coach') {
    await this.assertCoachOwnsStudent(coachId, clientId, role);
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const eods = await this.prisma.eODSubmission.findMany({
      where: { user_id: clientId, submitted_at: { gte: since } },
      orderBy: { submission_date: 'desc' },
    });
    const totalIncoming = eods.reduce((s, e) => s + toN(e.total_assets_computed), 0);
    return {
      period_days: 30,
      submissions: eods.length,
      avg_net_worth_30d:
        eods.length === 0
          ? 0
          : Math.round(
              eods.reduce((s, e) => s + toN(e.net_worth_computed), 0) / eods.length,
            ),
      total_assets_observed: Math.round(totalIncoming),
      timeline: eods.slice(0, 14).map((e) => ({
        date: e.submission_date,
        net_worth: toN(e.net_worth_computed),
        debt: toN(e.total_debt_computed),
        assets: toN(e.total_assets_computed),
        mood: e.mood,
      })),
    };
  }

  /** Goals = derived from FinancialProfile + active milestones for now. */
  async getClientGoals(coachId: string, clientId: string, role: string = 'coach') {
    await this.assertCoachOwnsStudent(coachId, clientId, role);
    const [profile, milestones] = await Promise.all([
      this.prisma.financialProfile.findUnique({ where: { user_id: clientId } }),
      this.prisma.milestoneUnlock.findMany({
        where: { user_id: clientId },
        orderBy: { unlocked_at: 'desc' },
      }),
    ]);
    return {
      primary_goal: profile?.primary_goal ?? null,
      goal_timeline_months: profile?.goal_timeline_months ?? null,
      dream_lifestyle_cost_mo: toN(profile?.dream_lifestyle_cost_mo),
      dream_description: profile?.dream_description ?? null,
      current_priority_index: profile?.current_priority_index ?? 0,
      milestones: milestones.map((m) => ({
        key: m.milestone_key,
        unlocked_at: m.unlocked_at,
      })),
    };
  }

  // ── Assignments ──────────────────────────────────────────────────────────

  async listClientAssignments(
    coachId: string,
    clientId: string,
    role: string = 'coach',
  ) {
    await this.assertCoachOwnsStudent(coachId, clientId, role);
    return this.prisma.clientAssignment.findMany({
      where: { client_id: clientId },
      orderBy: [{ status: 'asc' }, { due_date: 'asc' }, { created_at: 'desc' }],
    });
  }

  async createAssignment(
    coachId: string,
    clientId: string,
    input: CreateAssignmentInput,
    role: string = 'coach',
  ) {
    await this.assertCoachOwnsStudent(coachId, clientId, role);
    return this.prisma.clientAssignment.create({
      data: {
        coach_id: coachId,
        client_id: clientId,
        title: input.title,
        description: input.description,
        assignment_type: input.assignment_type ?? 'custom',
        due_date: input.due_date ? new Date(input.due_date) : null,
        target_value:
          input.target_value === undefined ? null : toN(input.target_value),
        target_unit: input.target_unit ?? null,
        coach_notes: input.coach_notes ?? null,
      },
    });
  }

  async updateAssignment(
    coachId: string,
    assignmentId: string,
    input: UpdateAssignmentInput,
    role: string = 'coach',
  ) {
    const existing = await this.prisma.clientAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!existing) {
      throw new NotFoundException({ error: 'Assignment not found', code: 'NOT_FOUND' });
    }
    if (role !== 'owner' && existing.coach_id !== coachId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    const data: Prisma.ClientAssignmentUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.assignment_type !== undefined) data.assignment_type = input.assignment_type;
    if (input.due_date !== undefined) data.due_date = input.due_date === null ? null : new Date(input.due_date);
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === 'completed') data.completed_at = new Date();
      if (input.status === 'open') data.completed_at = null;
    }
    if (input.target_value !== undefined) {
      data.target_value = input.target_value === null ? null : toN(input.target_value);
    }
    if (input.target_unit !== undefined) data.target_unit = input.target_unit;
    if (input.coach_notes !== undefined) data.coach_notes = input.coach_notes;

    return this.prisma.clientAssignment.update({ where: { id: assignmentId }, data });
  }

  async deleteAssignment(coachId: string, assignmentId: string, role: string = 'coach') {
    const existing = await this.prisma.clientAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!existing) {
      throw new NotFoundException({ error: 'Assignment not found', code: 'NOT_FOUND' });
    }
    if (role !== 'owner' && existing.coach_id !== coachId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }
    await this.prisma.clientAssignment.delete({ where: { id: assignmentId } });
    return { ok: true };
  }

  // ── Notes (extends existing CoachNote endpoints with read/patch/delete) ──

  async listClientNotes(coachId: string, clientId: string, role: string = 'coach') {
    await this.assertCoachOwnsStudent(coachId, clientId, role);
    return this.prisma.coachNote.findMany({
      where: { student_id: clientId, ...(role === 'owner' ? {} : { coach_id: coachId }) },
      orderBy: { created_at: 'desc' },
    });
  }

  async updateNote(
    coachId: string,
    noteId: string,
    input: { note?: string; is_private?: boolean },
    role: string = 'coach',
  ) {
    const existing = await this.prisma.coachNote.findUnique({ where: { id: noteId } });
    if (!existing) throw new NotFoundException({ error: 'Note not found', code: 'NOT_FOUND' });
    if (role !== 'owner' && existing.coach_id !== coachId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }
    const data: Prisma.CoachNoteUpdateInput = {};
    if (input.note !== undefined) data.note = input.note;
    if (input.is_private !== undefined) data.is_private = input.is_private;
    return this.prisma.coachNote.update({ where: { id: noteId }, data });
  }

  async deleteNote(coachId: string, noteId: string, role: string = 'coach') {
    const existing = await this.prisma.coachNote.findUnique({ where: { id: noteId } });
    if (!existing) throw new NotFoundException({ error: 'Note not found', code: 'NOT_FOUND' });
    if (role !== 'owner' && existing.coach_id !== coachId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }
    await this.prisma.coachNote.delete({ where: { id: noteId } });
    return { ok: true };
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  /**
   * Coach inbox — one row per thread (paired with one client). The aggregate
   * is built in-memory because the typical coach has tens of clients, not
   * thousands; once that pressure shifts we'll switch to a per-thread
   * `last_message_at` column.
   */
  async getCoachMessageInbox(coachId: string, role: string = 'coach') {
    const scope = scopeToCoach({ id: coachId, role });
    const clients = await this.prisma.user.findMany({
      where: { role: 'student', ...scope },
      select: { id: true, name: true, email: true },
    });
    const clientIds = clients.map((c) => c.id);
    if (clientIds.length === 0) return { threads: [] };

    // Most recent message per pair, plus an unread count where the coach is
    // the recipient and read_at is null.
    const messages = await this.prisma.coachMessage.findMany({
      where: {
        OR: [
          { sender_id: coachId, recipient_id: { in: clientIds } },
          { sender_id: { in: clientIds }, recipient_id: coachId },
        ],
      },
      orderBy: { created_at: 'desc' },
    });

    const byClient = new Map<
      string,
      { last: typeof messages[number]; unread: number }
    >();
    for (const m of messages) {
      const otherId = m.sender_id === coachId ? m.recipient_id : m.sender_id;
      const entry = byClient.get(otherId);
      if (!entry) {
        byClient.set(otherId, {
          last: m,
          unread: m.recipient_id === coachId && !m.read_at ? 1 : 0,
        });
      } else {
        if (m.recipient_id === coachId && !m.read_at) entry.unread += 1;
      }
    }

    const threads = clients
      .map((c) => {
        const entry = byClient.get(c.id);
        return {
          client_id: c.id,
          client_name: c.name,
          client_email: c.email,
          last_message: entry
            ? {
                id: entry.last.id,
                body: entry.last.body,
                created_at: entry.last.created_at,
                from_coach: entry.last.sender_id === coachId,
              }
            : null,
          unread_count: entry?.unread ?? 0,
        };
      })
      .sort((a, b) => {
        const aT = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
        const bT = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
        return bT - aT;
      });

    return { threads };
  }

  /** Returns the message history for a single coach/client pair. */
  async getCoachMessageThread(
    coachId: string,
    clientId: string,
    role: string = 'coach',
    limit: number = 100,
  ) {
    await this.assertCoachOwnsStudent(coachId, clientId, role);
    const tk = threadKey(coachId, clientId);
    const messages = await this.prisma.coachMessage.findMany({
      where: { thread_key: tk },
      orderBy: { created_at: 'asc' },
      take: limit,
    });

    // Mark inbound messages as read on coach fetch.
    await this.prisma.coachMessage.updateMany({
      where: { thread_key: tk, recipient_id: coachId, read_at: null },
      data: { read_at: new Date() },
    });

    return {
      thread_key: tk,
      messages: messages.map((m) => ({
        id: m.id,
        sender_id: m.sender_id,
        recipient_id: m.recipient_id,
        body: m.body,
        read_at: m.read_at,
        created_at: m.created_at,
        from_coach: m.sender_id === coachId,
      })),
    };
  }

  async sendCoachMessage(
    coachId: string,
    clientId: string,
    body: string,
    role: string = 'coach',
  ) {
    await this.assertCoachOwnsStudent(coachId, clientId, role);
    const row = await this.prisma.coachMessage.create({
      data: {
        thread_key: threadKey(coachId, clientId),
        sender_id: coachId,
        recipient_id: clientId,
        body,
      },
    });

    // Push the new message to the client. Best-effort: PushSenderService
    // logs and swallows its own errors so a flaky Expo response never
    // takes down the message-send round trip.
    const coachRow = await this.prisma.user
      .findUnique({ where: { id: coachId }, select: { name: true } })
      .catch(() => null);
    const senderName = coachRow?.name?.trim() || 'Your coach';
    const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
    this.pushSender
      .send(clientId, 'coach_message', {
        title: `${senderName} sent a message`,
        body: preview,
        data: { type: 'coach_message', screen: '/messages', message_id: row.id },
      })
      .catch(() => undefined);

    return row;
  }

  // ── Community posts ──────────────────────────────────────────────────────

  async listCommunityPosts(coachId: string, role: string = 'coach') {
    return this.prisma.communityPost.findMany({
      where: role === 'owner' ? {} : { author_id: coachId },
      orderBy: { created_at: 'desc' },
    });
  }

  async createCommunityPost(coachId: string, input: CreateCommunityPostInput) {
    return this.prisma.communityPost.create({
      data: {
        author_id: coachId,
        title: input.title,
        body: input.body,
        resource_url: input.resource_url ?? null,
        status: input.status ?? 'published',
        audience: input.audience ?? 'own_clients',
        published_at:
          (input.status ?? 'published') === 'published' ? new Date() : null,
      },
    });
  }

  async updateCommunityPost(
    coachId: string,
    postId: string,
    input: Partial<CreateCommunityPostInput>,
    role: string = 'coach',
  ) {
    const existing = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!existing) throw new NotFoundException({ error: 'Post not found', code: 'NOT_FOUND' });
    if (role !== 'owner' && existing.author_id !== coachId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }
    const data: Prisma.CommunityPostUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.body !== undefined) data.body = input.body;
    if (input.resource_url !== undefined) data.resource_url = input.resource_url ?? null;
    if (input.audience !== undefined) data.audience = input.audience;
    if (input.status !== undefined) {
      data.status = input.status;
      // Flipping to 'published' for the first time stamps published_at.
      if (input.status === 'published' && !existing.published_at) {
        data.published_at = new Date();
      }
    }
    return this.prisma.communityPost.update({ where: { id: postId }, data });
  }

  async deleteCommunityPost(coachId: string, postId: string, role: string = 'coach') {
    const existing = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!existing) throw new NotFoundException({ error: 'Post not found', code: 'NOT_FOUND' });
    if (role !== 'owner' && existing.author_id !== coachId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }
    await this.prisma.communityPost.delete({ where: { id: postId } });
    return { ok: true };
  }

  // ── Practice analytics ───────────────────────────────────────────────────

  async getPracticeAnalytics(coachId: string, role: string = 'coach') {
    const scope = scopeToCoach({ id: coachId, role });
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const [students, eodCount, retainedCount] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'student', ...scope },
        include: {
          profile: {
            select: {
              wealth_velocity_score: true,
              net_worth_snapshot: true,
              total_debt: true,
              total_assets: true,
              last_eod_date: true,
            },
          },
        },
      }),
      this.prisma.eODSubmission.count({
        where: {
          user: { role: 'student', ...scope },
          submitted_at: { gte: oneMonthAgo },
        },
      }),
      // "Retained" = clients with at least one check-in in the last 30 days.
      this.prisma.user.count({
        where: {
          role: 'student',
          ...scope,
          eod_submissions: { some: { submitted_at: { gte: oneMonthAgo } } },
        },
      }),
    ]);

    const total = students.length;
    const avgVelocity =
      total === 0
        ? 0
        : students.reduce((s, st) => s + (st.profile?.wealth_velocity_score ?? 0), 0) / total;
    const totalAssets = students.reduce((s, st) => s + toN(st.profile?.total_assets), 0);
    const totalDebt = students.reduce((s, st) => s + toN(st.profile?.total_debt), 0);

    return {
      total_clients: total,
      retention_30d_pct: total === 0 ? 0 : Math.round((retainedCount / total) * 100),
      avg_velocity_score: Math.round(avgVelocity),
      eod_submissions_30d: eodCount,
      roster_total_assets: Math.round(totalAssets),
      roster_total_debt: Math.round(totalDebt),
      roster_net_worth: Math.round(totalAssets - totalDebt),
    };
  }
}
