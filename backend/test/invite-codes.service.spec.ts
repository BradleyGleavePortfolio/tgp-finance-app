// Sprint A — InviteCodesService tests (finance side, parity with fitness).

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InviteCodesService } from '../src/coach/invite-codes/invite-codes.service';

function makePrisma() {
  const inviteCode = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const coachProfile = { findUnique: jest.fn() };
  return {
    inviteCode,
    coachProfile,
    prisma: { inviteCode, coachProfile } as any,
  };
}

describe('InviteCodesService.createForCoach', () => {
  it('persists a generated code with TG- prefix for a coach', async () => {
    const { prisma, inviteCode } = makePrisma();
    inviteCode.create.mockImplementation(async ({ data }) => ({
      id: 'iv-1',
      ...data,
      revoked: false,
      used_count: 0,
      created_at: new Date(),
    }));
    const svc = new InviteCodesService(prisma);
    const out = await svc.createForCoach('coach-1', { max_uses: 5 });
    expect(out.code).toMatch(/^TG-[A-Z2-9]{6}$/);
    expect(out.coach_id).toBe('coach-1');
    expect(out.max_uses).toBe(5);
  });

  it('rejects expires_at in the past', async () => {
    const { prisma } = makePrisma();
    const svc = new InviteCodesService(prisma);
    await expect(
      svc.createForCoach('coach-1', { expires_at: '2020-01-01T00:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects max_uses outside [1, 100000]', async () => {
    const { prisma } = makePrisma();
    const svc = new InviteCodesService(prisma);
    await expect(svc.createForCoach('coach-1', { max_uses: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.createForCoach('coach-1', { max_uses: 100001 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('InviteCodesService.revokeForCoach', () => {
  it('throws NotFound when the code does not exist', async () => {
    const { prisma, inviteCode } = makePrisma();
    inviteCode.findUnique.mockResolvedValue(null);
    const svc = new InviteCodesService(prisma);
    await expect(svc.revokeForCoach('coach-1', 'iv-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to revoke another coachs code (IDOR guard)', async () => {
    const { prisma, inviteCode } = makePrisma();
    inviteCode.findUnique.mockResolvedValue({ id: 'iv-1', coach_id: 'other' });
    const svc = new InviteCodesService(prisma);
    await expect(svc.revokeForCoach('coach-1', 'iv-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('marks revoked=true for the calling coachs own code', async () => {
    const { prisma, inviteCode } = makePrisma();
    inviteCode.findUnique.mockResolvedValue({ id: 'iv-1', coach_id: 'coach-1' });
    inviteCode.update.mockResolvedValue({ id: 'iv-1', revoked: true });
    const svc = new InviteCodesService(prisma);
    const out = await svc.revokeForCoach('coach-1', 'iv-1');
    expect(out.revoked).toBe(true);
  });
});

describe('InviteCodesService.resolveActiveCode', () => {
  it('resolves a fresh InviteCode row to the coach id', async () => {
    const { prisma, inviteCode } = makePrisma();
    inviteCode.findUnique.mockResolvedValue({
      id: 'iv-1',
      revoked: false,
      expires_at: null,
      max_uses: null,
      used_count: 0,
      coach: { id: 'coach-1', role: 'coach' },
    });
    const svc = new InviteCodesService(prisma);
    await expect(svc.resolveActiveCode('TG-ABC123')).resolves.toEqual({
      coach_id: 'coach-1',
      invite_code_id: 'iv-1',
    });
  });

  it('rejects a revoked code', async () => {
    const { prisma, inviteCode } = makePrisma();
    inviteCode.findUnique.mockResolvedValue({
      id: 'iv-1',
      revoked: true,
      expires_at: null,
      max_uses: null,
      used_count: 0,
      coach: { id: 'coach-1', role: 'coach' },
    });
    const svc = new InviteCodesService(prisma);
    await expect(svc.resolveActiveCode('TG-ABC123')).resolves.toBeNull();
  });

  it('falls back to CoachProfile.invite_code', async () => {
    const { prisma, inviteCode, coachProfile } = makePrisma();
    inviteCode.findUnique.mockResolvedValue(null);
    coachProfile.findUnique.mockResolvedValue({
      invite_code: 'CP-XYZ',
      is_active: true,
      user: { id: 'coach-9', role: 'coach' },
    });
    const svc = new InviteCodesService(prisma);
    await expect(svc.resolveActiveCode('CP-XYZ')).resolves.toEqual({
      coach_id: 'coach-9',
      invite_code_id: null,
    });
  });
});
