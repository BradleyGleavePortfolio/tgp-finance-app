import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EODSubmission, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toN } from '../common/money';
import { scopeToCoach } from '../auth/scope';

export interface CoachAlert {
  student_id: string;
  student_name: string;
  alert_type: 'missed_checkin' | 'low_velocity';
  message: string;
  severity: 'low' | 'medium' | 'high';
  days_since_last?: number | null;
}

@Injectable()
export class CoachService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudents(coachId: string, search?: string, role: string = 'coach') {
    // OWNER sees every student across every coach; coach sees only their own.
    // scopeToCoach returns {} for owner, { coach_id: coachId } for coach.
    const scope = scopeToCoach({ id: coachId, role });
    const where: Prisma.UserWhereInput = { role: 'student', ...scope };

    // Support email search (exact or partial)
    if (search && search.trim()) {
      where.email = { contains: search.trim(), mode: 'insensitive' };
    }

    const students = await this.prisma.user.findMany({
      where,
      include: {
        profile: {
          select: {
            net_worth_snapshot: true,
            total_debt: true,
            total_assets: true,
            streak_days: true,
            wealth_velocity_score: true,
            current_priority_index: true,
            last_eod_date: true,
          },
        },
        _count: { select: { eod_submissions: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    const todayUTC = new Date().toISOString().split('T')[0];

    return students.map((s) => {
      const profile = s.profile;
      const lastEodDate = profile?.last_eod_date ?? null;
      const submittedToday = lastEodDate != null && String(lastEodDate).startsWith(todayUTC);

      return {
        user: { id: s.id, email: s.email, name: s.name },
        profile: {
          streak_days: profile?.streak_days ?? 0,
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
   *   - last 14 days of habit logs (streak signals)
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
        profile: { select: { last_eod_date: true, streak_days: true, wealth_velocity_score: true } },
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
}
