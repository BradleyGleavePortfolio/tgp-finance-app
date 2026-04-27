import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InvitesService } from '../src/invites/invites.service';

function makePrisma(overrides: any = {}) {
  return {
    coachProfile: {
      findUnique: jest.fn(),
      ...overrides.coachProfile,
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      ...overrides.user,
    },
  } as any;
}

const fakeAdmin = {
  ensureCoachProfile: jest.fn().mockResolvedValue({
    id: 'cp-1',
    invite_code: 'CODE123',
    is_active: true,
  }),
} as any;

const fakeConfig = (vals: Record<string, string | undefined> = {}) => ({
  get: (k: string) => vals[k],
}) as any;

describe('InvitesService.previewByCode', () => {
  it('rejects empty codes', async () => {
    const svc = new InvitesService(makePrisma(), fakeAdmin, fakeConfig());
    await expect(svc.previewByCode('')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown codes', async () => {
    const prisma = makePrisma();
    prisma.coachProfile.findUnique.mockResolvedValue(null);
    const svc = new InvitesService(prisma, fakeAdmin, fakeConfig());
    await expect(svc.previewByCode('NOPE')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects inactive coach profiles', async () => {
    const prisma = makePrisma();
    prisma.coachProfile.findUnique.mockResolvedValue({
      invite_code: 'X',
      is_active: false,
      user: { id: 'c-1', role: 'coach', name: 'Alice', email: 'a@x.io' },
    });
    const svc = new InvitesService(prisma, fakeAdmin, fakeConfig());
    await expect(svc.previewByCode('X')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when underlying user is no longer a coach/owner', async () => {
    const prisma = makePrisma();
    prisma.coachProfile.findUnique.mockResolvedValue({
      invite_code: 'X',
      is_active: true,
      user: { id: 'u-1', role: 'student', name: 'Bob', email: 'b@x.io' },
    });
    const svc = new InvitesService(prisma, fakeAdmin, fakeConfig());
    await expect(svc.previewByCode('X')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns coach context for valid active code', async () => {
    const prisma = makePrisma();
    prisma.coachProfile.findUnique.mockResolvedValue({
      invite_code: 'CODE123',
      is_active: true,
      display_name: 'Coach Alice',
      user: { id: 'c-1', role: 'coach', name: 'Alice', email: 'a@x.io' },
    });
    const svc = new InvitesService(prisma, fakeAdmin, fakeConfig());
    const out = await svc.previewByCode('CODE123');
    expect(out).toEqual({
      coach_id: 'c-1',
      coach_name: 'Coach Alice',
      invite_code: 'CODE123',
    });
  });
});

describe('InvitesService.attachByCode', () => {
  function commonProfile() {
    return {
      invite_code: 'GOODCODE',
      is_active: true,
      display_name: null,
      user: { id: 'coach-99', role: 'coach', name: 'C', email: 'c@x.io' },
    };
  }

  it('rejects coaches/owners (not allowed to attach)', async () => {
    const prisma = makePrisma();
    prisma.coachProfile.findUnique.mockResolvedValue(commonProfile());
    prisma.user.findUnique.mockResolvedValue({ id: 'c-2', role: 'coach', coach_id: null });
    const svc = new InvitesService(prisma, fakeAdmin, fakeConfig());
    await expect(svc.attachByCode('c-2', 'GOODCODE')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to overwrite an existing different coach attachment', async () => {
    const prisma = makePrisma();
    prisma.coachProfile.findUnique.mockResolvedValue(commonProfile());
    prisma.user.findUnique.mockResolvedValue({ id: 's-1', role: 'student', coach_id: 'OTHER' });
    const svc = new InvitesService(prisma, fakeAdmin, fakeConfig());
    await expect(svc.attachByCode('s-1', 'GOODCODE')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('is a no-op when already attached to the same coach', async () => {
    const prisma = makePrisma();
    prisma.coachProfile.findUnique.mockResolvedValue(commonProfile());
    prisma.user.findUnique.mockResolvedValue({ id: 's-1', role: 'student', coach_id: 'coach-99' });
    const svc = new InvitesService(prisma, fakeAdmin, fakeConfig());
    const out = await svc.attachByCode('s-1', 'GOODCODE');
    expect(out.already_attached).toBe(true);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('attaches an unattached student', async () => {
    const prisma = makePrisma();
    prisma.coachProfile.findUnique.mockResolvedValue(commonProfile());
    prisma.user.findUnique.mockResolvedValue({ id: 's-1', role: 'student', coach_id: null });
    const svc = new InvitesService(prisma, fakeAdmin, fakeConfig());
    const out = await svc.attachByCode('s-1', 'GOODCODE');
    expect(out.attached).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: { coach_id: 'coach-99' },
    });
  });
});

describe('InvitesService.isCoachCodeRequired', () => {
  it('returns true when flag is set', () => {
    const svc = new InvitesService(makePrisma(), fakeAdmin, fakeConfig({ FEATURE_REQUIRE_COACH_CODE: 'true' }));
    expect(svc.isCoachCodeRequired()).toBe(true);
  });
  it('returns false when flag is unset', () => {
    const svc = new InvitesService(makePrisma(), fakeAdmin, fakeConfig());
    expect(svc.isCoachCodeRequired()).toBe(false);
  });
});
