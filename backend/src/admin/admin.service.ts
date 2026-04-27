import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toN } from '../common/money';

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

  // ---------------------------------------------------------------------------
  // Admin console bridge — endpoints below back the Healthie/EHR-style admin
  // console hosted in the fitness app. They are intentionally OWNER-only:
  // they let an admin search any user (coach or client) by name/email and
  // pull a finance-side record for that account.
  //
  // Identity contract with the fitness app
  // --------------------------------------
  // Today there is no shared user-id table between the finance and fitness
  // products. The only field guaranteed to exist on both sides is `email`
  // (unique on `users` here, unique on the corresponding fitness `users`
  // table). The `searchUsers` and `getClientFinanceSummaryByEmail` endpoints
  // therefore use **email as the join key**. This is documented as a
  // *temporary contract* — see backend/src/admin/README.md. Limitations:
  //   - Two accounts on opposite products with the same email but different
  //     real owners (rare; we do not allow it within finance) cannot be
  //     disambiguated. A future identity table (`shared_identities`) is the
  //     long-term answer.
  //   - Email change on either side desynchronises the join. The admin
  //     console must treat a missing match as `IDENTITY_NOT_LINKED` and
  //     surface that to the operator rather than silently 404.
  // ---------------------------------------------------------------------------

  /**
   * Search users (coach or client) by name or email. Case-insensitive
   * substring match. Returns the minimum identity surface plus a
   * `has_finance_profile` flag so the admin UI can decide whether to render
   * a finance tab. OWNER-only via controller guard.
   */
  async searchUsers(query: string, limit: number = 25) {
    const trimmed = (query ?? '').trim();
    if (trimmed.length < 2) {
      throw new BadRequestException({
        error: 'Query must be at least 2 characters',
        code: 'VALIDATION_ERROR',
      });
    }
    const cap = Math.max(1, Math.min(100, Math.floor(limit)));

    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: trimmed, mode: 'insensitive' } },
          { name: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        coach_id: true,
        created_at: true,
        profile: { select: { id: true } },
      },
      orderBy: { created_at: 'desc' },
      take: cap,
    });

    return {
      query: trimmed,
      count: users.length,
      results: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        coach_id: u.coach_id,
        created_at: u.created_at,
        has_finance_profile: !!u.profile,
      })),
    };
  }

  /**
   * Compute a finance-side roll-up for one user (intended to be a `student`
   * but tolerated for any role so the admin console can render whatever
   * record an operator clicks into). Pure read-only; no side effects.
   *
   * Returns identity + profile basics, account totals (debt/asset/cash/net
   * worth) computed live from `financial_accounts`, last-30 EOD streak/
   * activity signals, and explicit nulls where data is absent. Never
   * fabricates billing or subscription state — those tables do not exist
   * yet on the finance side.
   */
  async getClientFinanceSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        coach_id: true,
        created_at: true,
        profile: true,
        accounts: { where: { is_active: true } },
        _count: { select: { eod_submissions: true } },
      },
    });
    if (!user) {
      throw new NotFoundException({ error: 'User not found', code: 'NOT_FOUND' });
    }

    const accounts = user.accounts ?? [];
    const total_assets = accounts
      .filter((a) => !a.is_debt)
      .reduce((s, a) => s + toN(a.balance), 0);
    const total_debt = accounts
      .filter((a) => a.is_debt)
      .reduce((s, a) => s + toN(a.balance), 0);
    const total_cash = accounts
      .filter((a) => !a.is_debt && ['checking', 'savings'].includes(a.account_type))
      .reduce((s, a) => s + toN(a.balance), 0);
    const net_worth = total_assets - total_debt;

    const profile = user.profile;
    const lastEod = profile?.last_eod_date ?? null;
    const now = new Date();
    const daysSinceLastEod =
      lastEod != null
        ? Math.floor((now.getTime() - new Date(lastEod).getTime()) / (1000 * 60 * 60 * 24))
        : null;

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        coach_id: user.coach_id,
        created_at: user.created_at,
      },
      profile: profile
        ? {
            onboarding_complete: profile.onboarding_complete,
            primary_goal: profile.primary_goal,
            goal_timeline_months: profile.goal_timeline_months,
            monthly_income_gross: toN(profile.monthly_income_gross),
            wealth_velocity_score: profile.wealth_velocity_score ?? null,
            streak_days: profile.streak_days ?? 0,
            last_eod_date: lastEod,
            current_priority_index: profile.current_priority_index,
          }
        : null,
      finance: {
        net_worth,
        total_assets,
        total_debt,
        total_cash,
        active_account_count: accounts.length,
        debt_account_count: accounts.filter((a) => a.is_debt).length,
        asset_account_count: accounts.filter((a) => !a.is_debt).length,
      },
      activity: {
        eod_submissions_total: user._count.eod_submissions,
        days_since_last_eod: daysSinceLastEod,
      },
      // Billing/subscription state is *not* tracked on the finance side yet.
      // Surfacing nulls (rather than zeros or fake "active" strings) so the
      // admin console can render "Not tracked" instead of pretending status.
      billing: {
        plan: null,
        status: null,
        last_charge_at: null,
        note: 'Billing not tracked in finance backend; integrate with payments source of truth.',
      },
    };
  }

  /**
   * Convenience lookup by email — the cross-app identity join key. Returns
   * the same payload as `getClientFinanceSummary` but raises a structured
   * `IDENTITY_NOT_LINKED` 404 when the email isn't found, so the fitness
   * console can render a "no finance record on file" state without
   * confusing it with a generic system error.
   */
  async getClientFinanceSummaryByEmail(email: string) {
    const trimmed = (email ?? '').trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      throw new BadRequestException({
        error: 'A valid email is required',
        code: 'VALIDATION_ERROR',
      });
    }
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: trimmed, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException({
        error: 'No finance account is linked to this email.',
        code: 'IDENTITY_NOT_LINKED',
      });
    }
    return this.getClientFinanceSummary(user.id);
  }

  /**
   * Coach-side finance roll-up for the admin console. Fields chosen to
   * mirror what an operator wants to see on a coach record:
   *   - identity + invite code + active flag
   *   - clients added (total roster) + active vs. inactive split
   *   - 7-day and 30-day activity counts
   *   - basic account-health flags (no roster, no recent activity)
   * Billing/subscription remains explicitly null — same rationale as
   * `getClientFinanceSummary`.
   */
  async getCoachFinanceSummary(coachId: string) {
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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalClients, activeLast7, activeLast30, eodLast30] = await Promise.all([
      this.prisma.user.count({ where: { role: 'student', coach_id: coachId } }),
      this.prisma.user.count({
        where: {
          role: 'student',
          coach_id: coachId,
          profile: { last_eod_date: { gte: sevenDaysAgo } },
        },
      }),
      this.prisma.user.count({
        where: {
          role: 'student',
          coach_id: coachId,
          profile: { last_eod_date: { gte: thirtyDaysAgo } },
        },
      }),
      this.prisma.eODSubmission.count({
        where: {
          submitted_at: { gte: thirtyDaysAgo },
          user: { coach_id: coachId },
        },
      }),
    ]);

    const flags: string[] = [];
    if (totalClients === 0) flags.push('no_clients');
    if (totalClients > 0 && activeLast7 === 0) flags.push('roster_idle_7d');
    if (coach.coach_profile && coach.coach_profile.is_active === false) {
      flags.push('invite_code_inactive');
    }

    return {
      coach: {
        id: coach.id,
        email: coach.email,
        name: coach.name,
        role: coach.role,
        created_at: coach.created_at,
        invite_code: coach.coach_profile?.invite_code ?? null,
        is_active: coach.coach_profile?.is_active ?? false,
        capacity: coach.coach_profile?.capacity ?? null,
        display_name: coach.coach_profile?.display_name ?? null,
      },
      clients: {
        total: totalClients,
        active_last_7_days: activeLast7,
        active_last_30_days: activeLast30,
      },
      activity: {
        eod_submissions_last_30_days: eodLast30,
      },
      account_health: {
        flags,
      },
      billing: {
        plan: null,
        status: null,
        last_charge_at: null,
        note: 'Billing not tracked in finance backend; integrate with payments source of truth.',
      },
    };
  }
}
