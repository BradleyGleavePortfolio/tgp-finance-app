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
import * as bcrypt from 'bcrypt';

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private supabase: SupabaseClient;
  private coachAccessCode: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL', '');
    const supabaseKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY', '');
    this.coachAccessCode = this.config.get<string>('COACH_ACCESS_CODE', 'CaboRules');

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
  }) {
    // Check if email already exists in our DB
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({ error: 'Email already registered', code: 'EMAIL_EXISTS' });
    }

    // Register with Supabase Auth — auto-confirm email for MVP
    const { data: authData, error: authError } = await this.supabase.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { name: dto.name },
    });

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
      },
    });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      message: 'Registration successful. You can now log in.',
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
      throw new UnauthorizedException({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
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
      // Auto-create user record if missing (edge case)
      user = await this.prisma.user.create({
        data: {
          supabase_id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || data.user.email,
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
        onboarding_complete: (user as any).profile?.onboarding_complete || false,
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
      user = await this.prisma.user.create({
        data: {
          supabase_id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || data.user.email,
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
        onboarding_complete: (user as any).profile?.onboarding_complete || false,
      },
    };
  }

  async selectRole(userId: string, role: 'coach' | 'student', coach_access_code?: string) {
    if (role === 'coach') {
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
