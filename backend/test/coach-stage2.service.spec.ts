/**
 * CoachService — Stage 2 surfaces.
 *
 * Hand-rolled prisma mocks so we can pin the contract without spinning up a
 * NestJS testing module. Mirrors the pattern in `coach.service.spec.ts`.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CoachService, threadKey } from '../src/coach/coach.service';

describe('threadKey', () => {
  it('is order-independent so coach/client agree on the same key', () => {
    expect(threadKey('a', 'b')).toBe(threadKey('b', 'a'));
    expect(threadKey('coach-1', 'client-9')).toBe('client-9:coach-1');
  });
});

describe('CoachService — Stage 2', () => {
  describe('getCoachClients', () => {
    it('returns clients with derived status, sorted by last_activity by default', async () => {
      const now = Date.now();
      const day = (n: number) => new Date(now - n * 86400_000);

      const prisma = {
        user: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 's1',
              name: 'Alice',
              email: 'a@x.com',
              created_at: day(30),
              profile: {
                net_worth_snapshot: 50000,
                total_debt: 1000,
                total_assets: 51000,
                wealth_velocity_score: 80,
                last_eod_date: day(1),
                primary_goal: 'save more',
                current_priority_index: 2,
              },
              _count: { eod_submissions: 12 },
            },
            {
              id: 's2',
              name: 'Bob',
              email: 'b@x.com',
              created_at: day(20),
              profile: {
                net_worth_snapshot: 10000,
                total_debt: 5000,
                total_assets: 15000,
                wealth_velocity_score: 50,
                last_eod_date: day(20),
                primary_goal: 'debt payoff',
                current_priority_index: 1,
              },
              _count: { eod_submissions: 4 },
            },
            {
              id: 's3',
              name: 'Carol',
              email: 'c@x.com',
              created_at: day(2),
              profile: null,
              _count: { eod_submissions: 0 },
            },
          ]),
        },
      };

      const svc = new CoachService(prisma as never);
      const out = await svc.getCoachClients('coach-1', { role: 'coach' });
      expect(out.total).toBe(3);
      // Active (s1, 1d) → at_risk (s2, 20d... actually >14 = inactive) → onboarding (s3, no eods)
      const ids = out.clients.map((c) => c.id);
      expect(ids[0]).toBe('s1'); // freshest
      expect(out.clients.find((c) => c.id === 's3')?.status).toBe('onboarding');
      expect(out.clients.find((c) => c.id === 's1')?.status).toBe('active');
      expect(out.clients.find((c) => c.id === 's2')?.status).toBe('inactive');
    });

    it('filters by status when provided', async () => {
      const day = (n: number) => new Date(Date.now() - n * 86400_000);
      const prisma = {
        user: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 's1',
              name: 'Alice',
              email: 'a@x.com',
              created_at: day(30),
              profile: {
                last_eod_date: day(1),
                wealth_velocity_score: 80,
                net_worth_snapshot: 0,
                total_debt: 0,
                total_assets: 0,
                primary_goal: null,
                current_priority_index: 0,
              },
              _count: { eod_submissions: 5 },
            },
            {
              id: 's2',
              name: 'Bob',
              email: 'b@x.com',
              created_at: day(20),
              profile: null,
              _count: { eod_submissions: 0 },
            },
          ]),
        },
      };
      const svc = new CoachService(prisma as never);
      const out = await svc.getCoachClients('coach-1', { status: 'onboarding', role: 'coach' });
      expect(out.clients).toHaveLength(1);
      expect(out.clients[0].id).toBe('s2');
    });
  });

  describe('createAssignment / updateAssignment ownership', () => {
    it('refuses to create an assignment for a student the coach does not own', async () => {
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'student-other', coach_id: 'coach-other', role: 'student' }) },
        clientAssignment: { create: jest.fn() },
      };
      const svc = new CoachService(prisma as never);
      await expect(
        svc.createAssignment('coach-1', 'student-other', { title: 'do thing' }, 'coach'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.clientAssignment.create).not.toHaveBeenCalled();
    });

    it('writes target_value as a number when provided as Decimal-like input', async () => {
      const prisma = {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'student-1', coach_id: 'coach-1', role: 'student' }),
        },
        clientAssignment: {
          create: jest.fn().mockResolvedValue({ id: 'a1' }),
        },
      };
      const svc = new CoachService(prisma as never);
      // Simulate Zod money's Decimal output via a duck-typed shape (toNumber).
      const decimalLike = { toNumber: () => 500.25 } as unknown as number;
      await svc.createAssignment(
        'coach-1',
        'student-1',
        { title: 'save 500', target_value: decimalLike },
        'coach',
      );
      const data = prisma.clientAssignment.create.mock.calls[0][0].data;
      expect(data.target_value).toBe(500.25);
      expect(data.coach_id).toBe('coach-1');
      expect(data.client_id).toBe('student-1');
    });

    it('updateAssignment refuses when the assignment belongs to a different coach', async () => {
      const prisma = {
        clientAssignment: {
          findUnique: jest.fn().mockResolvedValue({ id: 'a1', coach_id: 'coach-other' }),
          update: jest.fn(),
        },
      };
      const svc = new CoachService(prisma as never);
      await expect(
        svc.updateAssignment('coach-1', 'a1', { status: 'completed' }, 'coach'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.clientAssignment.update).not.toHaveBeenCalled();
    });

    it('owner bypass lets a non-owning coach update if role=owner', async () => {
      const prisma = {
        clientAssignment: {
          findUnique: jest.fn().mockResolvedValue({ id: 'a1', coach_id: 'coach-other' }),
          update: jest.fn().mockResolvedValue({ id: 'a1', status: 'completed' }),
        },
      };
      const svc = new CoachService(prisma as never);
      const result = await svc.updateAssignment('coach-admin', 'a1', { status: 'completed' }, 'owner');
      expect(prisma.clientAssignment.update).toHaveBeenCalledTimes(1);
      // Setting completed should also stamp completed_at.
      const data = prisma.clientAssignment.update.mock.calls[0][0].data;
      expect(data.status).toBe('completed');
      expect(data.completed_at).toBeInstanceOf(Date);
      expect(result.status).toBe('completed');
    });

    it('throws NotFound for an assignment that does not exist', async () => {
      const prisma = {
        clientAssignment: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const svc = new CoachService(prisma as never);
      await expect(svc.updateAssignment('coach-1', 'missing', { status: 'open' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('messaging', () => {
    it('sendCoachMessage stamps a deterministic thread_key', async () => {
      const prisma = {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'client-1', coach_id: 'coach-1', role: 'student' }),
        },
        coachMessage: {
          create: jest.fn().mockResolvedValue({ id: 'm1' }),
        },
      };
      const svc = new CoachService(prisma as never);
      await svc.sendCoachMessage('coach-1', 'client-1', 'hello world', 'coach');
      const data = prisma.coachMessage.create.mock.calls[0][0].data;
      expect(data.thread_key).toBe(threadKey('coach-1', 'client-1'));
      expect(data.sender_id).toBe('coach-1');
      expect(data.recipient_id).toBe('client-1');
      expect(data.body).toBe('hello world');
    });

    it('getCoachMessageThread marks inbound unread messages as read', async () => {
      const prisma = {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'client-1', coach_id: 'coach-1', role: 'student' }),
        },
        coachMessage: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'm1',
              sender_id: 'client-1',
              recipient_id: 'coach-1',
              body: 'hi',
              read_at: null,
              created_at: new Date(),
              thread_key: threadKey('coach-1', 'client-1'),
            },
            {
              id: 'm2',
              sender_id: 'coach-1',
              recipient_id: 'client-1',
              body: 'hey',
              read_at: null,
              created_at: new Date(),
              thread_key: threadKey('coach-1', 'client-1'),
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const svc = new CoachService(prisma as never);
      const out = await svc.getCoachMessageThread('coach-1', 'client-1', 'coach');
      expect(out.thread_key).toBe(threadKey('coach-1', 'client-1'));
      expect(prisma.coachMessage.updateMany).toHaveBeenCalledWith({
        where: { thread_key: threadKey('coach-1', 'client-1'), recipient_id: 'coach-1', read_at: null },
        data: { read_at: expect.any(Date) },
      });
      expect(out.messages.find((m) => m.id === 'm1')!.from_coach).toBe(false);
      expect(out.messages.find((m) => m.id === 'm2')!.from_coach).toBe(true);
    });
  });

  describe('community posts', () => {
    it('createCommunityPost stamps published_at when status defaults to published', async () => {
      const prisma = {
        communityPost: { create: jest.fn().mockResolvedValue({ id: 'p1' }) },
      };
      const svc = new CoachService(prisma as never);
      await svc.createCommunityPost('coach-1', { title: 'T', body: 'B' });
      const data = prisma.communityPost.create.mock.calls[0][0].data;
      expect(data.author_id).toBe('coach-1');
      expect(data.status).toBe('published');
      expect(data.published_at).toBeInstanceOf(Date);
    });

    it('updateCommunityPost does NOT overwrite published_at if already set', async () => {
      const prevPublished = new Date('2026-01-01T00:00:00Z');
      const prisma = {
        communityPost: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'p1',
            author_id: 'coach-1',
            published_at: prevPublished,
          }),
          update: jest.fn().mockResolvedValue({ id: 'p1' }),
        },
      };
      const svc = new CoachService(prisma as never);
      await svc.updateCommunityPost('coach-1', 'p1', { status: 'published', title: 'new' }, 'coach');
      const data = prisma.communityPost.update.mock.calls[0][0].data;
      // We did not touch published_at because it already had a value.
      expect(data.published_at).toBeUndefined();
      expect(data.status).toBe('published');
      expect(data.title).toBe('new');
    });

    it('deleteCommunityPost denies a non-owning coach', async () => {
      const prisma = {
        communityPost: {
          findUnique: jest.fn().mockResolvedValue({ id: 'p1', author_id: 'coach-other' }),
          delete: jest.fn(),
        },
      };
      const svc = new CoachService(prisma as never);
      await expect(svc.deleteCommunityPost('coach-1', 'p1', 'coach')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.communityPost.delete).not.toHaveBeenCalled();
    });
  });

  describe('practice analytics', () => {
    it('returns retention/avg-velocity rollup for the coach roster', async () => {
      const prisma = {
        user: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 's1',
              profile: {
                wealth_velocity_score: 80,
                net_worth_snapshot: 100,
                total_debt: 50,
                total_assets: 150,
                last_eod_date: new Date(),
              },
            },
            {
              id: 's2',
              profile: {
                wealth_velocity_score: 40,
                net_worth_snapshot: 10,
                total_debt: 5,
                total_assets: 15,
                last_eod_date: null,
              },
            },
          ]),
          count: jest.fn().mockResolvedValue(1),
        },
        eODSubmission: {
          count: jest.fn().mockResolvedValue(7),
        },
      };
      const svc = new CoachService(prisma as never);
      const out = await svc.getPracticeAnalytics('coach-1', 'coach');
      expect(out.total_clients).toBe(2);
      expect(out.retention_30d_pct).toBe(50);
      expect(out.avg_velocity_score).toBe(60);
      expect(out.eod_submissions_30d).toBe(7);
      expect(out.roster_total_assets).toBe(165);
      expect(out.roster_total_debt).toBe(55);
      expect(out.roster_net_worth).toBe(110);
    });
  });
});
