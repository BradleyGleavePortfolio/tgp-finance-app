import { NotFoundException } from '@nestjs/common';
import { AdminFederationService } from '../src/admin/federation/admin-federation.service';

function makePrisma(overrides: Record<string, any> = {}) {
  // Reasonable defaults so tests only need to override the call paths they
  // actually exercise.
  return {
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      ...(overrides.user || {}),
    },
    financialProfile: {
      count: jest.fn().mockResolvedValue(0),
      ...(overrides.financialProfile || {}),
    },
    eODSubmission: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      ...(overrides.eODSubmission || {}),
    },
    habitLog: {
      findMany: jest.fn().mockResolvedValue([]),
      ...(overrides.habitLog || {}),
    },
    whatIfScenario: {
      count: jest.fn().mockResolvedValue(0),
      ...(overrides.whatIfScenario || {}),
    },
    coachNote: {
      count: jest.fn().mockResolvedValue(0),
      ...(overrides.coachNote || {}),
    },
    milestoneUnlock: {
      count: jest.fn().mockResolvedValue(0),
      ...(overrides.milestoneUnlock || {}),
    },
  } as any;
}

describe('AdminFederationService.searchUsers', () => {
  it('returns an empty result without hitting the DB when query is blank', async () => {
    const prisma = makePrisma();
    const svc = new AdminFederationService(prisma);
    const out = await svc.searchUsers('', 50);
    expect(out).toEqual({ query: '', results: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('caps the limit at 100 and floors at 1', async () => {
    const prisma = makePrisma();
    const svc = new AdminFederationService(prisma);
    await svc.searchUsers('alice', 9999);
    expect(prisma.user.findMany.mock.calls[0][0].take).toBe(100);

    prisma.user.findMany.mockClear();
    await svc.searchUsers('alice', -5);
    expect(prisma.user.findMany.mock.calls[0][0].take).toBe(1);
  });

  it('shapes results with role and has_coach (no raw coach_id)', async () => {
    const prisma = makePrisma({
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'u-1',
            email: 'A@example.com',
            name: 'Alice',
            role: 'student',
            coach_id: 'coach-9',
            created_at: new Date('2026-04-01T00:00:00Z'),
          },
          {
            id: 'u-2',
            email: 'b@example.com',
            name: 'Bob',
            role: 'coach',
            coach_id: null,
            created_at: new Date('2026-04-02T00:00:00Z'),
          },
        ]),
      },
    });
    const svc = new AdminFederationService(prisma);
    const out = await svc.searchUsers('exa', 20);

    expect(out.query).toBe('exa');
    expect(out.identityMapping).toBe('email');
    expect(out.results).toEqual([
      {
        id: 'u-1',
        email: 'A@example.com',
        name: 'Alice',
        role: 'student',
        has_coach: true,
        created_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'u-2',
        email: 'b@example.com',
        name: 'Bob',
        role: 'coach',
        has_coach: false,
        created_at: '2026-04-02T00:00:00.000Z',
      },
    ]);

    // Verify the OR filter contains both email and name, case-insensitive.
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { email: { contains: 'exa', mode: 'insensitive' } },
      { name: { contains: 'exa', mode: 'insensitive' } },
    ]);
  });
});

describe('AdminFederationService.getClientSummaryByEmail', () => {
  it('throws NotFoundException with FEDERATION_USER_NOT_FOUND when no match', async () => {
    const prisma = makePrisma();
    const svc = new AdminFederationService(prisma);
    await expect(svc.getClientSummaryByEmail('missing@example.com')).rejects.toMatchObject({
      response: { code: 'FEDERATION_USER_NOT_FOUND' },
    });
  });

  it('throws NotFoundException with FEDERATION_BAD_REQUEST when email is blank', async () => {
    const prisma = makePrisma();
    const svc = new AdminFederationService(prisma);
    await expect(svc.getClientSummaryByEmail('   ')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns finance summary, coach pointer, and activity counts', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u-1',
          email: 'alice@example.com',
          name: 'Alice',
          role: 'student',
          coach_id: 'coach-9',
          created_at: new Date('2026-01-01T00:00:00Z'),
          profile: {
            net_worth_snapshot: { toNumber: () => 12345.67 },
            total_assets: { toNumber: () => 50000 },
            total_debt: { toNumber: () => 37654.33 },
            total_cash: { toNumber: () => 1500 },
            wealth_velocity_score: 73,
            last_eod_date: new Date('2026-04-26T00:00:00Z'),
            current_priority_index: 3,
            onboarding_complete: true,
          },
          _count: {
            eod_submissions: 95,
            accounts: 7,
            milestones: 4,
            what_if_scenarios: 3,
          },
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'coach-9',
          email: 'coach@example.com',
          name: 'Coach Carter',
        }),
      },
    });

    const svc = new AdminFederationService(prisma);
    const out = await svc.getClientSummaryByEmail('alice@example.com');

    expect(out).toEqual({
      identityMapping: 'email',
      user: {
        id: 'u-1',
        email: 'alice@example.com',
        name: 'Alice',
        role: 'student',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      coach: { id: 'coach-9', email: 'coach@example.com', name: 'Coach Carter' },
      finance: {
        onboarding_complete: true,
        net_worth: 12345.67,
        total_assets: 50000,
        total_debt: 37654.33,
        total_cash: 1500,
        wealth_velocity_score: 73,
        last_eod_date: '2026-04-26T00:00:00.000Z',
        current_priority_index: 3,
      },
      activity: {
        eod_submissions_total: 95,
        accounts_total: 7,
        milestones_unlocked_total: 4,
        what_if_scenarios_total: 3,
      },
    });

    // Email lookup must be case-insensitive.
    const where = prisma.user.findFirst.mock.calls[0][0].where;
    expect(where.email).toEqual({ equals: 'alice@example.com', mode: 'insensitive' });
  });

  it('returns null finance fields gracefully when there is no profile yet', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u-2',
          email: 'newbie@example.com',
          name: 'Newbie',
          role: 'student',
          coach_id: null,
          created_at: new Date('2026-04-20T00:00:00Z'),
          profile: null,
          _count: {
            eod_submissions: 0,
            accounts: 0,
            milestones: 0,
            what_if_scenarios: 0,
          },
        }),
      },
    });
    const svc = new AdminFederationService(prisma);
    const out = await svc.getClientSummaryByEmail('newbie@example.com');

    expect(out.coach).toBeNull();
    expect(out.finance).toEqual({
      onboarding_complete: false,
      net_worth: null,
      total_assets: null,
      total_debt: null,
      total_cash: null,
      wealth_velocity_score: null,
      last_eod_date: null,
      current_priority_index: 0,
    });
  });
});

describe('AdminFederationService.getCoachSummaryByEmail', () => {
  it('throws FEDERATION_NOT_A_COACH when the email exists but role is student', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u-1',
          email: 'student@example.com',
          name: 'Student',
          role: 'student',
          created_at: new Date(),
          coach_profile: null,
          _count: { program_templates: 0 },
        }),
      },
    });
    const svc = new AdminFederationService(prisma);
    await expect(svc.getCoachSummaryByEmail('student@example.com')).rejects.toMatchObject({
      response: { code: 'FEDERATION_NOT_A_COACH' },
    });
  });

  it('throws FEDERATION_USER_NOT_FOUND when the email is unknown', async () => {
    const prisma = makePrisma();
    const svc = new AdminFederationService(prisma);
    await expect(svc.getCoachSummaryByEmail('nobody@example.com')).rejects.toMatchObject({
      response: { code: 'FEDERATION_USER_NOT_FOUND' },
    });
  });

  it('returns coach business stats for a coach', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'coach-1',
          email: 'coach@example.com',
          name: 'Coach Carter',
          role: 'coach',
          created_at: new Date('2026-02-01T00:00:00Z'),
          coach_profile: {
            invite_code: 'CODE123',
            display_name: 'Coach Carter',
            is_active: true,
            capacity: 50,
          },
          _count: { program_templates: 4 },
        }),
        // Two count() calls in the parallel block: students + active.
        count: jest
          .fn()
          .mockResolvedValueOnce(20) // student_count
          .mockResolvedValueOnce(8), // active_students
      },
      eODSubmission: { count: jest.fn().mockResolvedValue(57) },
      coachNote: { count: jest.fn().mockResolvedValue(33) },
    });

    const svc = new AdminFederationService(prisma);
    const out = await svc.getCoachSummaryByEmail('coach@example.com');

    expect(out.user.role).toBe('coach');
    expect(out.coach_profile).toEqual({
      invite_code: 'CODE123',
      display_name: 'Coach Carter',
      is_active: true,
      capacity: 50,
    });
    expect(out.business).toEqual({
      student_count: 20,
      active_students_last_7_days: 8,
      eod_submissions_last_7_days: 57,
      coach_notes_total: 33,
      program_templates_total: 4,
    });
  });

  it('also accepts owner role (owners are tenant heads)', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'owner-1',
          email: 'owner@example.com',
          name: 'Owner',
          role: 'owner',
          created_at: new Date(),
          coach_profile: null,
          _count: { program_templates: 0 },
        }),
        count: jest.fn().mockResolvedValue(0),
      },
    });
    const svc = new AdminFederationService(prisma);
    const out = await svc.getCoachSummaryByEmail('owner@example.com');
    expect(out.user.role).toBe('owner');
    expect(out.coach_profile).toBeNull();
  });
});

describe('AdminFederationService.getProductUsage', () => {
  it('returns aggregate metrics with role split + DAU/WAU/MAU union counts', async () => {
    const prisma = makePrisma({
      user: {
        count: jest.fn().mockResolvedValue(150),
        groupBy: jest.fn().mockResolvedValue([
          { role: 'student', _count: { _all: 120 } },
          { role: 'coach', _count: { _all: 25 } },
          { role: 'owner', _count: { _all: 5 } },
        ]),
      },
      financialProfile: { count: jest.fn().mockResolvedValue(110) },
      eODSubmission: {
        count: jest.fn().mockResolvedValue(420),
        // Order of findMany calls in service: 7d, 1d, 30d.
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'c' }])
          .mockResolvedValueOnce([{ user_id: 'a' }])
          .mockResolvedValueOnce([
            { user_id: 'a' },
            { user_id: 'b' },
            { user_id: 'c' },
            { user_id: 'd' },
          ]),
      },
      habitLog: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ user_id: 'b' }, { user_id: 'd' }]) // 7d
          .mockResolvedValueOnce([{ user_id: 'b' }]), // 1d
      },
      whatIfScenario: { count: jest.fn().mockResolvedValue(60) },
      coachNote: { count: jest.fn().mockResolvedValue(80) },
      milestoneUnlock: { count: jest.fn().mockResolvedValue(40) },
    });

    const svc = new AdminFederationService(prisma);
    const out = await svc.getProductUsage();

    expect(out.users).toEqual({
      total: 150,
      by_role: { student: 120, coach: 25, owner: 5 },
      onboarding_complete: 110,
    });
    // DAU = union of {a} and {b} = 2; WAU = union of {a,b,c} and {b,d} = 4;
    // MAU = union of {a,b,c,d} = 4.
    expect(out.engagement).toEqual({ dau: 2, wau: 4, mau: 4 });
    expect(out.product).toEqual({
      eod_submissions_last_7_days: 420,
      what_if_scenarios_last_30_days: 60,
      coach_notes_total: 80,
      milestones_unlocked_total: 40,
    });
    expect(out.window).toEqual({ dau_days: 1, wau_days: 7, mau_days: 30 });
    expect(typeof out.generated_at).toBe('string');
  });

  it('zero-fills role split for absent roles', async () => {
    const prisma = makePrisma({
      user: {
        count: jest.fn().mockResolvedValue(3),
        groupBy: jest.fn().mockResolvedValue([{ role: 'student', _count: { _all: 3 } }]),
      },
    });
    const svc = new AdminFederationService(prisma);
    const out = await svc.getProductUsage();
    expect(out.users.by_role).toEqual({ student: 3, coach: 0, owner: 0 });
  });
});
