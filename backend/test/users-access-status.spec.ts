import { UsersService } from '../src/users/users.service';

describe('UsersService.getAccessStatus', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  function buildPrisma(overrides: any) {
    return {
      user: {
        findUnique: jest.fn().mockImplementation(({ where, select }) => {
          if (where.id === 'student-with-coach') {
            return Promise.resolve({
              id: 'student-with-coach',
              role: 'student',
              coach_id: 'coach-1',
            });
          }
          if (where.id === 'student-self') {
            return Promise.resolve({
              id: 'student-self',
              role: 'student',
              coach_id: null,
            });
          }
          if (where.id === 'coach-only') {
            return Promise.resolve({
              id: 'coach-only',
              role: 'coach',
              coach_id: null,
            });
          }
          if (where.id === 'owner-1') {
            return Promise.resolve({
              id: 'owner-1',
              role: 'owner',
              coach_id: null,
            });
          }
          if (where.id === 'coach-1') {
            return Promise.resolve({
              id: 'coach-1',
              name: 'Coach Default',
              coach_profile: { display_name: 'Coach Display' },
            });
          }
          return Promise.resolve(null);
        }),
      },
      ...overrides,
    } as any;
  }

  it('reports coach_managed when a student has a coach_id and resolves the coach display name', async () => {
    const svc = new UsersService(buildPrisma({}));
    const status = await svc.getAccessStatus('student-with-coach');
    expect(status.role).toBe('student');
    expect(status.accessSource).toBe('coach_managed');
    expect(status.coach).toEqual({ id: 'coach-1', displayName: 'Coach Display' });
  });

  it('reports self when a student has no coach', async () => {
    const svc = new UsersService(buildPrisma({}));
    const status = await svc.getAccessStatus('student-self');
    expect(status.accessSource).toBe('self');
    expect(status.coach).toBeNull();
  });

  it('reports self for a coach role (coaches manage themselves)', async () => {
    const svc = new UsersService(buildPrisma({}));
    const status = await svc.getAccessStatus('coach-only');
    expect(status.role).toBe('coach');
    expect(status.accessSource).toBe('self');
  });

  it('reports owner accessSource for the owner role', async () => {
    const svc = new UsersService(buildPrisma({}));
    const status = await svc.getAccessStatus('owner-1');
    expect(status.role).toBe('owner');
    expect(status.accessSource).toBe('owner');
  });

  it('falls back to a safe shape when the user record is missing', async () => {
    const svc = new UsersService(buildPrisma({}));
    const status = await svc.getAccessStatus('does-not-exist');
    expect(status.role).toBe('student');
    expect(status.accessSource).toBe('self');
    expect(status.coach).toBeNull();
    expect(status.supportContactEmail).toMatch(/@/);
  });

  it('honours SUPPORT_CONTACT_EMAIL', async () => {
    process.env.SUPPORT_CONTACT_EMAIL = 'concierge@example.com';
    const svc = new UsersService(buildPrisma({}));
    const status = await svc.getAccessStatus('student-self');
    expect(status.supportContactEmail).toBe('concierge@example.com');
  });
});
