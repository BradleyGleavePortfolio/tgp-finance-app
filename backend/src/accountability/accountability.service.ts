import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getPartner(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { accountability_pair: true },
    });

    if (!user?.accountability_pair) {
      return { partner: null, message: 'No accountability partner assigned' };
    }

    const partner = await this.prisma.user.findUnique({
      where: { id: user.accountability_pair },
      select: {
        id: true,
        name: true,
        // Privacy: only show scores, not actual balances
        profile: {
          select: {
            wealth_velocity_score: true,
            current_priority_index: true,
            last_eod_date: true,
            // DO NOT include: net_worth_snapshot, total_debt, total_assets, total_cash
          },
        },
      },
    });

    if (!partner) return { partner: null, message: 'Partner account not found' };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const partnerSubmittedToday = await this.prisma.eODSubmission.findFirst({
      where: {
        user_id: partner.id,
        submission_date: { gte: today, lt: tomorrow },
      },
    });

    return {
      partner: {
        id: partner.id,
        name: partner.name,
        wealth_velocity_score: partner.profile?.wealth_velocity_score || 0,
        current_priority_index: partner.profile?.current_priority_index || 0,
        submitted_today: !!partnerSubmittedToday,
      },
    };
  }

  async pairStudents(
    coachId: string,
    studentId1: string,
    studentId2: string,
    role: string = 'coach',
  ) {
    if (studentId1 === studentId2) {
      throw new BadRequestException({ error: 'Cannot pair a student with themselves', code: 'INVALID_PAIR' });
    }

    const [student1, student2] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: studentId1 } }),
      this.prisma.user.findUnique({ where: { id: studentId2 } }),
    ]);

    if (!student1 || !student2) {
      throw new NotFoundException({ error: 'One or both students not found', code: 'NOT_FOUND' });
    }

    // SECURITY: previously this method accepted any studentId pair from a coach
    // and updated both rows — a coach could overwrite the accountability_pair
    // field on students in a *different* coach's roster. That violates the
    // coach-ownership contract and is the bug the source-of-truth pass calls
    // out. Now:
    //   - both targets must be role='student'
    //   - both must belong to the calling coach (or caller is OWNER, who is
    //     allowed to pair across tenants by product rule)
    if (student1.role !== 'student' || student2.role !== 'student') {
      throw new ForbiddenException({
        error: 'Both targets must be students',
        code: 'INVALID_PAIR_TARGETS',
      });
    }
    if (role !== 'owner') {
      if (student1.coach_id !== coachId || student2.coach_id !== coachId) {
        throw new ForbiddenException({
          error: 'Both students must be in your roster',
          code: 'NOT_YOUR_STUDENTS',
        });
      }
    }

    // Update both students' accountability_pair field
    await Promise.all([
      this.prisma.user.update({
        where: { id: studentId1 },
        data: { accountability_pair: studentId2 },
      }),
      this.prisma.user.update({
        where: { id: studentId2 },
        data: { accountability_pair: studentId1 },
      }),
    ]);

    return {
      message: `${student1.name} and ${student2.name} are now accountability partners`,
      pair: [studentId1, studentId2],
    };
  }
}
