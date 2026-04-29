import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

// Cleanup (round 5): dropped `bcrypt` import and `BCRYPT_SALT_ROUNDS` constant.
// Password hashing is handled entirely by Supabase Auth (see `register` / `login`
// below). The `bcrypt` + `@types/bcrypt` deps have been removed from package.json
// for the same reason — keeping them invited dead-path confusion during audits.

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private supabase: SupabaseClient;
  private coachAccessCode: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly analytics: AnalyticsService,
  ) {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL', '');
    const supabaseKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY', '');
    // SECURITY: the coach-access-code path is a dev-only self-promotion backdoor. It is now
    // gated behind an explicit env flag and MUST NOT be enabled in production. Legitimate
    // coach promotion should be performed via an admin-only tool (see PR description for
    // the follow-up `is_coach` admin toggle plan).
    // NEVER set ENABLE_DEV_BACKDOOR=true in production. If unset or not "true", the
    // select-role coach path is disabled entirely.
    const backdoorEnabled = process.env.ENABLE_DEV_BACKDOOR === 'true';
    const rawCode = this.config.get<string>('COACH_ACCESS_CODE');
    if (backdoorEnabled && rawCode && process.env.NODE_ENV !== 'production') {
      this.coachAccessCode = rawCode;
      this.logger.warn(
        'DEV BACKDOOR ENABLED: coach-access-code self-promotion is active. ' +
          'This must never be enabled in production.',
      );
    } else {
      this.coachAccessCode = null;
    }

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn(
        'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Auth endpoints will fail until configured. ' +
        'Make sure your .env file is in the project root (tgp-finance/.env).',
      );
    }

    this.supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');
  }

  async register(dto: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    referral_code?: string;
    invite_code?: string;
  }) {
    // Check if email already exists in our DB
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({ error: 'Email already registered', code: 'EMAIL_EXISTS' });
    }

    // Phase 1C: resolve the optional coach invite code BEFORE creating any
    // Supabase or DB rows, so a bad code can't leave a half-created user
    // behind. Validation rules:
    //   - if FEATURE_REQUIRE_COACH_CODE is on, an invite_code is mandatory
    //   - if a code is supplied, it must resolve to an active coach profile
    //   - if no code and the flag is off, we register as before (legacy path)
    const requireCode = process.env.FEATURE_REQUIRE_COACH_CODE === 'true' ||
      process.env.FEATURE_REQUIRE_COACH_CODE === '1';
    let coachIdToAttach: string | null = null;
    if (dto.invite_code) {
      const profile = await this.prisma.coachProfile.findUnique({
        where: { invite_code: dto.invite_code },
        include: { user: { select: { id: true, role: true } } },
      });
      if (!profile || !profile.is_active ||
          (profile.user.role !== 'coach' && profile.user.role !== 'owner')) {
        throw new BadRequestException({
          error: 'Invalid or inactive coach code',
          code: 'INVALID_COACH_CODE',
        });
      }
      coachIdToAttach = profile.user.id;
    } else if (requireCode) {
      throw new BadRequestException({
        error: 'A coach invite code is required to sign up.',
        code: 'COACH_CODE_REQUIRED',
      });
    }

    // Register with Supabase Auth — auto-confirm email for MVP
    let { data: authData, error: authError } = await this.supabase.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: false,
      user_metadata: { name: dto.name },
    });

    // Handle ghost user: exists in Supabase Auth but not in our DB
    if (authError && authError.message?.toLowerCase().includes('already been registered')) {
      this.logger.warn(`Ghost user detected for ${dto.email} — cleaning up stale Supabase Auth entry`);

      const { data: listData } = await this.supabase.auth.admin.listUsers();
      // Supabase types `users` as `User[] | []` depending on the success/error
      // branch — narrow to a single User[] for the find().
      const users: { id: string; email?: string }[] = listData?.users ?? [];
      const ghostUser = users.find((u) => u.email === dto.email);

      if (ghostUser) {
        await this.supabase.auth.admin.deleteUser(ghostUser.id);

        // Retry registration after deleting the ghost user
        const retry = await this.supabase.auth.admin.createUser({
          email: dto.email,
          password: dto.password,
          email_confirm: false,
          user_metadata: { name: dto.name },
        });
        authData = retry.data;
        authError = retry.error;
      }
    }

    if (authError || !authData.user) {
      this.logger.error(`Supabase registration error: ${authError?.message}`);
      throw new BadRequestException({
        error: authError?.message || 'Registration failed',
        code: 'REGISTRATION_FAILED',
      });
    }

    // Create user record in our DB
    const user = await this.prisma.user.create({
      data: {
        supabase_id: authData.user.id,
        email: dto.email,
        name: dto.name,
        phone: dto.phone,
        referral_code: dto.referral_code,
        role: 'student', // Default; updated after role selection
        coach_id: coachIdToAttach,
      },
    });

    // Track user registration (fire-and-forget — never block the response)
    try {
      this.analytics.capture(user.id, 'user_registered', {
        has_referral: !!dto.referral_code,
        role: user.role,
      });
      this.analytics.identify(user.id, { role: user.role });
    } catch { /* best-effort */ }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      message: 'Verification email sent. Please verify your email to continue.',
    };
  }

  async verifyEmail(token: string, type?: string) {
    // Supabase handles email verification via redirect link
    // This endpoint is for manual re-check of verification status
    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    const user = await this.prisma.user.findUnique({
      where: { supabase_id: data.user.id },
    });

    return { verified: true, user: user ? { id: user.id, role: user.role } : null };
  }

  async login(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user || !data.session) {
      const isEmailNotConfirmed = error?.message?.includes('not confirmed') ||
                                   error?.message?.includes('Email not confirmed');
      throw new UnauthorizedException({
        error: isEmailNotConfirmed
          ? 'Please verify your email before logging in'
          : 'Invalid email or password',
        code: isEmailNotConfirmed ? 'EMAIL_NOT_VERIFIED' : 'INVALID_CREDENTIALS',
      });
    }

    // Email verification check — user must verify before login
    if (!data.user.email_confirmed_at) {
      throw new UnauthorizedException({
        error: 'Please verify your email before logging in',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    let user = await this.prisma.user.findUnique({
      where: { supabase_id: data.user.id },
      include: { profile: true },
    });

    if (!user) {
      // Auto-create user record if missing (edge case). Supabase can in theory
      // surface a user without an email; fall back to supabase_id as a last
      // resort so `email` remains non-null at the DB level.
      const email = data.user.email ?? `${data.user.id}@placeholder.local`;
      user = await this.prisma.user.create({
        data: {
          supabase_id: data.user.id,
          email,
          name: data.user.user_metadata?.name || email,
        },
        include: { profile: true },
      });
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        onboarding_complete: user.profile?.onboarding_complete || false,
      },
    };
  }

  async googleAuth(access_token: string, id_token?: string) {
    // Verify Google token via Supabase
    const { data, error } = await this.supabase.auth.signInWithIdToken({
      provider: 'google',
      token: id_token || access_token,
    });

    if (error || !data.user || !data.session) {
      throw new UnauthorizedException({
        error: 'Google authentication failed',
        code: 'GOOGLE_AUTH_FAILED',
      });
    }

    let user = await this.prisma.user.findUnique({
      where: { supabase_id: data.user.id },
      include: { profile: true },
    });

    const isNewUser = !user;

    if (!user) {
      const email = data.user.email ?? `${data.user.id}@placeholder.local`;
      user = await this.prisma.user.create({
        data: {
          supabase_id: data.user.id,
          email,
          name: data.user.user_metadata?.full_name || email,
        },
        include: { profile: true },
      });
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      is_new_user: isNewUser,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        onboarding_complete: user.profile?.onboarding_complete || false,
      },
    };
  }

  async selectRole(userId: string, role: 'coach' | 'student', coach_access_code?: string) {
    if (role === 'coach') {
      // SECURITY: the coach-access-code backdoor is disabled unless the dev env explicitly
      // opts in. In production, coach role must be granted by an administrator out-of-band
      // (DB toggle) — this endpoint will never grant it.
      if (!this.coachAccessCode) {
        throw new ForbiddenException({
          error: 'Coach self-registration is not available. Contact your administrator.',
          code: 'COACH_SELF_REGISTRATION_DISABLED',
        });
      }
      if (!coach_access_code || coach_access_code !== this.coachAccessCode) {
        throw new ForbiddenException({
          error: 'Incorrect access code. Contact your administrator.',
          code: 'INVALID_COACH_CODE',
        });
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    return { role: updatedUser.role, message: `Role set to ${role}` };
  }

  async logout(userId: string) {
    // Supabase handles session invalidation on the client side
    // Log the event server-side
    this.logger.log(`User ${userId} logged out`);
    return { message: 'Logged out successfully' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        notification_prefs: true,
        _count: { select: { accounts: true, eod_submissions: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    return user;
  }
}
