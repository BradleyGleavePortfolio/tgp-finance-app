import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoachService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudents(coachId: string, search?: string) {
    const where: any = { role: 'student', coach_id: coachId };

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

  async getStudentDetail(coachId: string, studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        profile: true,
        accounts: { where: { is_active: true } },
        eod_submissions: { orderBy: { submission_date: 'desc' }, take: 30 },
        milestones: true,
        notification_prefs: true,
        coach_notes_received: {
          where: { coach_id: coachId },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!student) throw new NotFoundException({ error: 'Student not found', code: 'NOT_FOUND' });
    // SECURITY: previously used `&&` which let any coach read any student (role is always 'student').
    // Deny unless the target actually belongs to this coach OR the target isn't a student at all.
    if (student.coach_id !== coachId || student.role !== 'student') {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    return student;
  }

  // SECURITY: shared ownership check used by any coach action that targets a specific student.
  private async assertCoachOwnsStudent(coachId: string, studentId: string): Promise<void> {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, coach_id: true, role: true },
    });
    if (!student) throw new NotFoundException({ error: 'Student not found', code: 'NOT_FOUND' });
    if (student.coach_id !== coachId || student.role !== 'student') {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }
  }

  async getStudentDetailWithHistory(coachId: string, studentId: string, days: number = 90) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: { profile: true, accounts: { where: { is_active: true } } },
    });

    if (!student) throw new NotFoundException({ error: 'Student not found', code: 'NOT_FOUND' });
    if (student.coach_id !== coachId) {
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

  private computeWeeklyRollups(submissions: any[]) {
    if (submissions.length === 0) return [];

    const weeks: Map<string, any[]> = new Map();
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
      avg_net_worth: Math.round(subs.reduce((s, e) => s + e.net_worth_computed, 0) / subs.length),
      avg_debt: Math.round(subs.reduce((s, e) => s + e.total_debt_computed, 0) / subs.length),
      avg_assets: Math.round(subs.reduce((s, e) => s + e.total_assets_computed, 0) / subs.length),
    }));
  }

  async getAlerts(coachId: string) {
    const students = await this.prisma.user.findMany({
      where: { role: 'student', coach_id: coachId },
      include: {
        profile: { select: { last_eod_date: true, streak_days: true, wealth_velocity_score: true } },
      },
    });

    const alerts: any[] = [];
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
          severity: daysSinceEOD >= 7 ? 'high' : 'medium',
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

  async createTemplate(coachId: string, data: any) {
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

    const phases = template.phases as any[];
    if (phases && phases.length > 0) {
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
