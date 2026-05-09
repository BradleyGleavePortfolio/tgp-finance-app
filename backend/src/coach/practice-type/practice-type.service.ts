import { Injectable, ForbiddenException } from '@nestjs/common';
import { CoachPracticeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * PracticeTypeService — Stage-3 coach practice selection (finance side).
 *
 * The finance backend is a pure storage participant for the practice
 * type. The cross-pillar UI lives in the fitness app per the locked
 * architecture, so the finance side never gates anything on this
 * value — it just stores the coach's choice so the fitness backend can
 * read it via the federation surface (or so a coach who only operates
 * inside the finance app can declare "fitness_only" and not be
 * surprised by the option later).
 *
 * The migration `20260509000001_coach_practice_type_stage3` makes the
 * column nullable. `null` = not yet selected.
 */
@Injectable()
export class PracticeTypeService {
  constructor(private readonly prisma: PrismaService) {}

  async get(coachId: string): Promise<{ practice_type: CoachPracticeType | null }> {
    const u = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: { coach_practice_type: true, role: true },
    });
    if (!u) return { practice_type: null };
    if (u.role !== 'coach' && u.role !== 'owner') {
      throw new ForbiddenException({
        error: 'Practice type is only meaningful for coach or owner roles',
        code: 'NOT_A_COACH',
      });
    }
    return { practice_type: u.coach_practice_type };
  }

  async set(
    coachId: string,
    practiceType: CoachPracticeType,
  ): Promise<{ practice_type: CoachPracticeType }> {
    const u = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: { role: true },
    });
    if (!u || (u.role !== 'coach' && u.role !== 'owner')) {
      throw new ForbiddenException({
        error: 'Only coaches or owners can set a practice type',
        code: 'NOT_A_COACH',
      });
    }
    const updated = await this.prisma.user.update({
      where: { id: coachId },
      data: { coach_practice_type: practiceType },
      select: { coach_practice_type: true },
    });
    return { practice_type: updated.coach_practice_type! };
  }
}
