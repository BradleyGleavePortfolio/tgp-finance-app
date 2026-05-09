import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Unambiguous alphabet — no 0/O, 1/I/L — so codes read clearly over the
// phone or in handwriting. 31 chars x 6 = ~2^29 combinations, plenty for
// the foreseeable code volume.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;
const CODE_PREFIX = 'TG-';
const MAX_GENERATION_ATTEMPTS = 10;

export interface CreateInviteCodeInput {
  expires_at?: string | null;
  max_uses?: number | null;
}

@Injectable()
export class InviteCodesService {
  private readonly logger = new Logger(InviteCodesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private generateCode(): string {
    const bytes = randomBytes(CODE_LENGTH);
    let out = CODE_PREFIX;
    for (let i = 0; i < CODE_LENGTH; i++) {
      out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return out;
  }

  async createForCoach(coachId: string, input: CreateInviteCodeInput) {
    const expiresAt = input.expires_at ? new Date(input.expires_at) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException({
        error: 'Invalid expires_at',
        code: 'INVALID_EXPIRES_AT',
      });
    }
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        error: 'expires_at must be in the future',
        code: 'EXPIRES_AT_PAST',
      });
    }
    if (input.max_uses != null && (input.max_uses < 1 || input.max_uses > 100000)) {
      throw new BadRequestException({
        error: 'max_uses must be between 1 and 100000',
        code: 'INVALID_MAX_USES',
      });
    }

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const code = this.generateCode();
      try {
        return await this.prisma.inviteCode.create({
          data: {
            code,
            coach_id: coachId,
            expires_at: expiresAt,
            max_uses: input.max_uses ?? null,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          this.logger.warn(`invite code collision on ${code}, retrying`);
          continue;
        }
        throw err;
      }
    }
    throw new InternalServerErrorException({
      error: 'Could not generate a unique invite code',
      code: 'CODE_GENERATION_FAILED',
    });
  }

  async listForCoach(coachId: string) {
    return this.prisma.inviteCode.findMany({
      where: { coach_id: coachId },
      orderBy: { created_at: 'desc' },
    });
  }

  async revokeForCoach(coachId: string, inviteCodeId: string) {
    const existing = await this.prisma.inviteCode.findUnique({
      where: { id: inviteCodeId },
    });
    if (!existing) {
      throw new NotFoundException({
        error: 'Invite code not found',
        code: 'INVITE_CODE_NOT_FOUND',
      });
    }
    if (existing.coach_id !== coachId) {
      throw new ForbiddenException({
        error: 'Invite code does not belong to caller',
        code: 'IDOR_FORBIDDEN',
      });
    }
    return this.prisma.inviteCode.update({
      where: { id: inviteCodeId },
      data: { revoked: true },
    });
  }

  // Resolve a code (legacy InviteCode row OR CoachProfile.invite_code) to
  // a coach_id, applying the same revoke / expiry / max_uses gates that
  // the create-side enforces. Returns null on any reject so the caller
  // chooses the right HTTP shape.
  async resolveActiveCode(rawCode: string): Promise<{ coach_id: string; invite_code_id: string | null } | null> {
    const code = (rawCode ?? '').trim();
    if (!code) return null;

    const row = await this.prisma.inviteCode.findUnique({
      where: { code },
      include: { coach: { select: { id: true, role: true } } },
    });
    if (row) {
      if (row.revoked) return null;
      if (row.expires_at && row.expires_at.getTime() <= Date.now()) return null;
      if (row.max_uses !== null && row.used_count >= row.max_uses) return null;
      if (row.coach.role !== 'coach' && row.coach.role !== 'owner') return null;
      return { coach_id: row.coach.id, invite_code_id: row.id };
    }

    // Fall back to CoachProfile.invite_code (default per-coach link).
    const profile = await this.prisma.coachProfile.findUnique({
      where: { invite_code: code },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!profile || !profile.is_active) return null;
    if (profile.user.role !== 'coach' && profile.user.role !== 'owner') return null;
    return { coach_id: profile.user.id, invite_code_id: null };
  }

  async incrementUsedCount(inviteCodeId: string): Promise<void> {
    await this.prisma.inviteCode.update({
      where: { id: inviteCodeId },
      data: { used_count: { increment: 1 } },
    });
  }
}
