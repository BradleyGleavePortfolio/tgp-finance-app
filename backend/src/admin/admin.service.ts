import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type PromoteRole = 'coach' | 'owner';

/**
 * AdminService — OWNER-only operations.
 *
 * The product rule (source of truth):
 *   "Only admin can promote users to coach/admin roles."
 *
 * Coach self-registration was already disabled in production via the
 * COACH_ACCESS_CODE backdoor flag (see auth.service). This service is the
 * intended replacement: an authenticated OWNER can call promoteUser to grant
 * the `coach` or `owner` role and (for coaches) lazily ensure a CoachProfile
 * row with a fresh invite_code exists.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a URL-safe, ~13-char invite code. Uses crypto.randomBytes so the
   * code can't be guessed by enumeration. Collisions are vanishingly unlikely
   * but the DB has a UNIQUE constraint on coach_profiles.invite_code so a
   * duplicate would surface as a P2002 and we'd just retry.
   */
  static generateInviteCode(): string {
    return randomBytes(8).toString('base64url');
  }

  async ensureCoachProfile(userId: string) {
    const existing = await this.prisma.coachProfile.findUnique({
      where: { user_id: userId },
    });
    if (existing) return existing;

    // Retry up to 3 times on UNIQUE collisions on invite_code.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.coachProfile.create({
          data: {
            user_id: userId,
            invite_code: AdminService.generateInviteCode(),
          },
        });
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
      }
    }
    throw new BadRequestException({
      error: 'Could not allocate a unique invite code',
      code: 'INVITE_CODE_COLLISION',
    });
  }

  async promoteUser(targetUserId: string, role: PromoteRole) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, email: true, name: true },
    });
    if (!target) {
      throw new NotFoundException({ error: 'User not found', code: 'NOT_FOUND' });
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });

    // For both `coach` and `owner` we ensure a CoachProfile so the user can
    // share an invite code. Owners coach too (they sit at the top of the
    // hierarchy); a profile lets owner-led tenants onboard clients directly.
    const profile = await this.ensureCoachProfile(targetUserId);

    return {
      user: updated,
      coach_profile: {
        id: profile.id,
        invite_code: profile.invite_code,
        is_active: profile.is_active,
      },
    };
  }

  async listCoaches() {
    // Includes owners — owners can also be tenant heads.
    const coaches = await this.prisma.user.findMany({
      where: { role: { in: ['coach', 'owner'] } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        created_at: true,
        coach_profile: {
          select: {
            invite_code: true,
            is_active: true,
            display_name: true,
            capacity: true,
          },
        },
        _count: { select: { program_templates: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    // Compute student counts per coach in a single query.
    const studentCounts = await this.prisma.user.groupBy({
      by: ['coach_id'],
      where: { role: 'student', coach_id: { not: null } },
      _count: { _all: true },
    });
    const countByCoach = new Map(
      studentCounts.map((row) => [row.coach_id as string, row._count._all]),
    );

    return coaches.map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      role: c.role,
      created_at: c.created_at,
      invite_code: c.coach_profile?.invite_code ?? null,
      is_active: c.coach_profile?.is_active ?? false,
      display_name: c.coach_profile?.display_name ?? null,
      capacity: c.coach_profile?.capacity ?? null,
      student_count: countByCoach.get(c.id) ?? 0,
      template_count: c._count.program_templates,
    }));
  }

  async getCoachDetail(coachId: string) {
    const coach = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        created_at: true,
        coach_profile: true,
      },
    });
    if (!coach || (coach.role !== 'coach' && coach.role !== 'owner')) {
      throw new NotFoundException({ error: 'Coach not found', code: 'NOT_FOUND' });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [studentCount, activeStudents, eodCount, noteCount] = await Promise.all([
      this.prisma.user.count({ where: { role: 'student', coach_id: coachId } }),
      this.prisma.user.count({
        where: {
          role: 'student',
          coach_id: coachId,
          profile: { last_eod_date: { gte: sevenDaysAgo } },
        },
      }),
      this.prisma.eODSubmission.count({
        where: {
          submitted_at: { gte: sevenDaysAgo },
          user: { coach_id: coachId },
        },
      }),
      this.prisma.coachNote.count({ where: { coach_id: coachId } }),
    ]);

    return {
      coach: {
        id: coach.id,
        email: coach.email,
        name: coach.name,
        role: coach.role,
        created_at: coach.created_at,
        coach_profile: coach.coach_profile,
      },
      stats: {
        student_count: studentCount,
        active_students_last_7_days: activeStudents,
        eod_submissions_last_7_days: eodCount,
        coach_notes_total: noteCount,
      },
    };
  }
}
