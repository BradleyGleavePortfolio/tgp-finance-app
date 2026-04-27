import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from '../admin/admin.service';

/**
 * InvitesService — Phase 1C invite/coach-code flow.
 *
 * Source-of-truth rule: a client can only sign up under an existing coach.
 * We never let a brand-new client create themselves with no coach. The
 * sign-up surfaces are:
 *
 *   1) Email/password register endpoint — accepts an `invite_code` field and
 *      attaches the new user to the coach atomically.
 *   2) Google OAuth — Supabase creates the auth user before we see them.
 *      The first time they hit a protected API route the JwtStrategy creates
 *      a User row for them; if they have no coach_id, /api/invites/attach
 *      must be called with a valid coach code before any client data routes
 *      will work. The "client gating" guard enforces that (see
 *      ClientCoachLinkedGuard / FEATURE_REQUIRE_COACH_CODE flag).
 *
 * Owners bypass the gate entirely (they can use the app without belonging to
 * another coach). Coaches likewise — a coach is, by definition, an
 * unattached top-of-tenant user.
 */
@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Whether new client signups must present a valid coach invite code. Phase
   * 1C ships the gate behind a flag so production traffic can roll out
   * gradually. When false, signups still RESPECT the code if one is provided
   * (so /api/invites/attach works), but we don't reject codeless signups.
   */
  isCoachCodeRequired(): boolean {
    const raw = this.config.get<string>('FEATURE_REQUIRE_COACH_CODE');
    return raw === 'true' || raw === '1';
  }

  /**
   * Resolve a coach by invite_code without exposing the coach's user record
   * surface. Used by:
   *  - the mobile signup screen (preview "you'll be coached by X")
   *  - server-side validation before write
   */
  async previewByCode(rawCode: string) {
    const code = (rawCode ?? '').trim();
    if (!code) {
      throw new BadRequestException({ error: 'Coach code required', code: 'CODE_REQUIRED' });
    }

    const profile = await this.prisma.coachProfile.findUnique({
      where: { invite_code: code },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!profile || !profile.is_active) {
      throw new NotFoundException({ error: 'Invalid or inactive coach code', code: 'INVALID_CODE' });
    }
    if (profile.user.role !== 'coach' && profile.user.role !== 'owner') {
      // Defensive: a CoachProfile pointing at a non-coach user means an admin
      // demoted somebody but left their profile around. Fail closed.
      throw new NotFoundException({ error: 'Invalid or inactive coach code', code: 'INVALID_CODE' });
    }

    return {
      coach_id: profile.user.id,
      coach_name: profile.display_name || profile.user.name,
      invite_code: profile.invite_code,
    };
  }

  /**
   * Attach the calling user to a coach via invite code. Used after Google
   * OAuth (or any path where the User row already exists with no coach_id).
   *
   * Idempotency: if the user already has the same coach attached, this is a
   * no-op success. If they have a *different* coach attached, we reject —
   * coach reassignment must go through an admin/coach action, not a client
   * action, so a leaked invite code from a competing coach can't poach
   * existing clients.
   */
  async attachByCode(userId: string, rawCode: string) {
    const preview = await this.previewByCode(rawCode);

    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, coach_id: true },
    });
    if (!me) {
      throw new NotFoundException({ error: 'User not found', code: 'NOT_FOUND' });
    }
    if (me.role === 'coach' || me.role === 'owner') {
      throw new BadRequestException({
        error: 'Coaches and owners do not attach to a coach',
        code: 'INVALID_ROLE',
      });
    }
    if (me.coach_id && me.coach_id !== preview.coach_id) {
      throw new ForbiddenException({
        error: 'You are already attached to a coach. Contact your administrator to change.',
        code: 'COACH_ALREADY_ATTACHED',
      });
    }

    if (me.coach_id === preview.coach_id) {
      return { attached: true, coach: preview, already_attached: true };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { coach_id: preview.coach_id },
    });

    this.logger.log(`Attached user ${userId} to coach ${preview.coach_id} via invite code`);

    return { attached: true, coach: preview, already_attached: false };
  }

  /**
   * Returns the calling coach's invite code + share-link payload. Auto-creates
   * the CoachProfile if missing — useful as a one-shot fix for any coach who
   * existed before this migration.
   */
  async getMyInvite(coachId: string) {
    const profile = await this.admin.ensureCoachProfile(coachId);
    return {
      invite_code: profile.invite_code,
      is_active: profile.is_active,
      // A relative path the mobile app can compose against its deep-link host.
      share_path: `/signup?coach=${encodeURIComponent(profile.invite_code)}`,
    };
  }
}
