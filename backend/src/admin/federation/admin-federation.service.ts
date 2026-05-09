import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import type { CoachPracticeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * AdminFederationService
 *
 * Read-only summaries for the cross-app TGP admin console. The console is
 * hosted in the fitness backend and federates user identity by **email**:
 * a person who exists in both the fitness app and the finance app is the
 * same person if-and-only-if the email matches (case-insensitive).
 *
 * Limitations of the email-only mapping (documented for the integration
 * doc + console UI):
 *
 *   - A user who signs up to the two apps with different emails will appear
 *     as two separate identities. There is no SSO yet.
 *   - Email changes on either side break the link until both are updated.
 *   - The federation never returns raw financial account balances or per-EOD
 *     submission text — only aggregate snapshots safe for an admin overview.
 *
 * If/when a shared identity provider lands we would add a stable
 * `shared_identity_id` column on User and route lookups through it; the
 * email path stays as a fallback.
 */
type SafeUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  coach_id: string | null;
  created_at: Date;
};

@Injectable()
export class AdminFederationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search by name or email substring (case-insensitive). Returns at most
   * `limit` rows. Used by the admin console's user picker. No financials
   * here — the result rows are deliberately the same shape across coach,
   * student, and owner so the console can render a single list.
   */
  async searchUsers(query: string, limit: number) {
    const q = (query ?? '').trim();
    if (!q) return { query: q, results: [] as Array<unknown> };

    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 20));

    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        coach_id: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: safeLimit,
    });

    return {
      query: q,
      identityMapping: 'email',
      results: users.map((u: SafeUser) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        has_coach: !!u.coach_id,
        created_at: u.created_at.toISOString(),
      })),
    };
  }

  /**
   * Client (student) finance summary, looked up by email.
   *
   * The shape is deliberately compact — netWorth + debt + asset roll-up,
   * last-EOD timestamp, and a coach pointer when one exists. No
   * per-account balances, no individual EOD submissions, no AI insight
   * text. This is what an admin needs to answer "is this person actually
   * using the product?"; it is not a coach console replacement.
   */
  async getClientSummaryByEmail(email: string) {
    const normalized = (email ?? '').trim();
    if (!normalized) {
      throw new NotFoundException({
        error: 'Email is required',
        code: 'FEDERATION_BAD_REQUEST',
      });
    }

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
      include: {
        profile: true,
        _count: {
          select: {
            eod_submissions: true,
            accounts: true,
            milestones: true,
            what_if_scenarios: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        error: 'No finance account found for that email',
        code: 'FEDERATION_USER_NOT_FOUND',
      });
    }

    let coach: { id: string; email: string; name: string } | null = null;
    if (user.coach_id) {
      const c = await this.prisma.user.findUnique({
        where: { id: user.coach_id },
        select: { id: true, email: true, name: true },
      });
      coach = c ?? null;
    }

    const profile = user.profile;
    return {
      identityMapping: 'email',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        created_at: user.created_at.toISOString(),
      },
      coach,
      finance: {
        onboarding_complete: profile?.onboarding_complete ?? false,
        net_worth: numberOrNull(profile?.net_worth_snapshot),
        total_assets: numberOrNull(profile?.total_assets),
        total_debt: numberOrNull(profile?.total_debt),
        total_cash: numberOrNull(profile?.total_cash),
        wealth_velocity_score: profile?.wealth_velocity_score ?? null,
        last_eod_date: profile?.last_eod_date?.toISOString() ?? null,
        current_priority_index: profile?.current_priority_index ?? 0,
      },
      activity: {
        eod_submissions_total: user._count.eod_submissions,
        accounts_total: user._count.accounts,
        milestones_unlocked_total: user._count.milestones,
        what_if_scenarios_total: user._count.what_if_scenarios,
      },
    };
  }

  /**
   * Coach finance + business summary, looked up by email. "Business" here
   * means the coaching practice this user runs INSIDE the finance product:
   * how many clients they manage, how many wrote EODs in the last 7 days,
   * their template count, and their invite code (so the admin console can
   * regenerate or share it). Owners are returned the same way — they sit
   * at the top of the hierarchy and can also have students.
   */
  async getCoachSummaryByEmail(email: string) {
    const normalized = (email ?? '').trim();
    if (!normalized) {
      throw new NotFoundException({
        error: 'Email is required',
        code: 'FEDERATION_BAD_REQUEST',
      });
    }

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
      include: {
        coach_profile: true,
        _count: { select: { program_templates: true } },
      },
    });

    if (!user) {
      throw new NotFoundException({
        error: 'No finance account found for that email',
        code: 'FEDERATION_USER_NOT_FOUND',
      });
    }

    if (user.role !== 'coach' && user.role !== 'owner') {
      throw new NotFoundException({
        error: 'User exists but is not a coach or owner',
        code: 'FEDERATION_NOT_A_COACH',
      });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [studentCount, activeStudents, eodCount, noteCount] = await Promise.all([
      this.prisma.user.count({ where: { role: 'student', coach_id: user.id } }),
      this.prisma.user.count({
        where: {
          role: 'student',
          coach_id: user.id,
          profile: { last_eod_date: { gte: sevenDaysAgo } },
        },
      }),
      this.prisma.eODSubmission.count({
        where: {
          submitted_at: { gte: sevenDaysAgo },
          user: { coach_id: user.id },
        },
      }),
      this.prisma.coachNote.count({ where: { coach_id: user.id } }),
    ]);

    return {
      identityMapping: 'email',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        created_at: user.created_at.toISOString(),
      },
      coach_profile: user.coach_profile
        ? {
            invite_code: user.coach_profile.invite_code,
            display_name: user.coach_profile.display_name,
            is_active: user.coach_profile.is_active,
            capacity: user.coach_profile.capacity,
          }
        : null,
      business: {
        student_count: studentCount,
        active_students_last_7_days: activeStudents,
        eod_submissions_last_7_days: eodCount,
        coach_notes_total: noteCount,
        program_templates_total: user._count.program_templates,
      },
    };
  }

  /**
   * Aggregate product-usage metrics: total users by role, onboarding
   * completion, daily-active and weekly-active engagement counted off
   * EOD submissions, balance logs, and habit logs (the same activity
   * sources the in-product "circle stats" widget already uses).
   */
  async getProductUsage() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalUsers,
      roleSplit,
      onboarded,
      eodLast7,
      habitLast7,
      eodLast1,
      habitLast1,
      eodLast30,
      eodSubmissions7d,
      whatIfRuns30d,
      coachNotesAll,
      milestonesAll,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.financialProfile.count({ where: { onboarding_complete: true } }),
      this.prisma.eODSubmission.findMany({
        where: { submitted_at: { gte: sevenDaysAgo } },
        select: { user_id: true },
        distinct: ['user_id'],
      }),
      this.prisma.habitLog.findMany({
        where: { logged_at: { gte: sevenDaysAgo } },
        select: { user_id: true },
        distinct: ['user_id'],
      }),
      this.prisma.eODSubmission.findMany({
        where: { submitted_at: { gte: oneDayAgo } },
        select: { user_id: true },
        distinct: ['user_id'],
      }),
      this.prisma.habitLog.findMany({
        where: { logged_at: { gte: oneDayAgo } },
        select: { user_id: true },
        distinct: ['user_id'],
      }),
      this.prisma.eODSubmission.findMany({
        where: { submitted_at: { gte: thirtyDaysAgo } },
        select: { user_id: true },
        distinct: ['user_id'],
      }),
      this.prisma.eODSubmission.count({ where: { submitted_at: { gte: sevenDaysAgo } } }),
      this.prisma.whatIfScenario.count({ where: { created_at: { gte: thirtyDaysAgo } } }),
      this.prisma.coachNote.count(),
      this.prisma.milestoneUnlock.count(),
    ]);

    const dau = unionCount([eodLast1, habitLast1]);
    const wau = unionCount([eodLast7, habitLast7]);
    const mau = unionCount([eodLast30]);

    const splitMap: Record<string, number> = { student: 0, coach: 0, owner: 0 };
    for (const row of roleSplit) {
      splitMap[row.role] = row._count._all;
    }

    return {
      generated_at: new Date().toISOString(),
      window: { dau_days: 1, wau_days: 7, mau_days: 30 },
      users: {
        total: totalUsers,
        by_role: splitMap,
        onboarding_complete: onboarded,
      },
      engagement: {
        dau,
        wau,
        mau,
      },
      product: {
        eod_submissions_last_7_days: eodSubmissions7d,
        what_if_scenarios_last_30_days: whatIfRuns30d,
        coach_notes_total: coachNotesAll,
        milestones_unlocked_total: milestonesAll,
      },
    };
  }

  /**
   * Sprint A — set coach practice type by email.
   *
   * The fitness backend forwards a coach's practice selection here so the
   * value lands on both backends in a single user action. Email is the
   * federated identity key (same convention as the lookup endpoints).
   * Refuses to auto-create — if the email maps to a non-coach (or no
   * user at all), 404 with a descriptive code.
   */
  async setCoachPracticeByEmail(email: string, practiceType: CoachPracticeType) {
    const log = new Logger('AdminFederationService.setCoachPracticeByEmail');
    const normalized = (email ?? '').trim();
    if (!normalized) {
      throw new NotFoundException({
        error: 'Email is required',
        code: 'FEDERATION_BAD_REQUEST',
      });
    }
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      throw new NotFoundException({
        error: 'No finance account found for that email',
        code: 'FEDERATION_USER_NOT_FOUND',
      });
    }
    if (user.role !== 'coach' && user.role !== 'owner') {
      throw new NotFoundException({
        error: 'User exists but is not a coach or owner',
        code: 'FEDERATION_NOT_A_COACH',
      });
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { coach_practice_type: practiceType },
      select: { coach_practice_type: true },
    });
    log.log(
      `Practice type for coach ${user.email} set to ${practiceType} via federation`,
    );
    return {
      identityMapping: 'email',
      user: { email: user.email, role: user.role },
      practice_type: updated.coach_practice_type,
    };
  }
}

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  // Prisma Decimal exposes toNumber(); fall back to Number() for plain values.
  const anyV = v as { toNumber?: () => number };
  if (typeof anyV.toNumber === 'function') {
    return anyV.toNumber();
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function unionCount(buckets: Array<Array<{ user_id: string }>>): number {
  const set = new Set<string>();
  for (const bucket of buckets) {
    for (const row of bucket) set.add(row.user_id);
  }
  return set.size;
}
