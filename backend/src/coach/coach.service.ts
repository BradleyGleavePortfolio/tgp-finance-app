import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoachService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudents(coachId: string) {
    const students = await this.prisma.user.findMany({
      where: { role: 'student', coach_id: coachId },
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return students.map((s) => ({
      id: s.id,
      email: s.email,
      name: s.name,
      created_at: s.created_at,
      profile: s.profile,
      eod_count: s._count.eod_submissions,
    }));
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
    if (student.coach_id !== coachId && student.role !== 'student') {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    return student;
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
