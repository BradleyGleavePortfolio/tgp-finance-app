// Sprint A audit fix CR-3 — client-side messages service tests.
//
// Pins the tenancy shape: a client only ever sees / writes to their
// own currently-assigned coach. We mock the PrismaService surface
// the service touches so the tests stay fast and offline.

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagesService } from '../src/messages/messages.service';

interface MockClient {
  id: string;
  coach_id: string | null;
}
interface MockCoach {
  id: string;
  name: string;
  role: string;
}

function makePrisma(opts: {
  client?: MockClient | null;
  coach?: MockCoach | null;
  threadRows?: Array<{
    id: string;
    body: string;
    sender_id: string;
    recipient_id: string;
    read_at: Date | null;
    created_at: Date;
  }>;
  unread?: number;
} = {}) {
  // The service does a two-step lookup: first the client row (for
  // coach_id), then the coach row (for id, name, role). Sequence the
  // mock so the first call returns the client, the second the coach.
  const findUniqueUser = jest
    .fn()
    .mockResolvedValueOnce(opts.client ?? null)
    .mockResolvedValueOnce(opts.coach ?? null);
  const findManyMessages = jest.fn().mockResolvedValue(opts.threadRows ?? []);
  const updateManyMessages = jest.fn().mockResolvedValue({ count: opts.unread ?? 0 });
  const countMessages = jest.fn().mockResolvedValue(opts.unread ?? 0);
  const createMessage = jest.fn().mockImplementation(async ({ data }) => ({
    id: 'new-msg-1',
    body: data.body,
    read_at: null,
    created_at: new Date('2026-05-09T12:00:00Z'),
    sender_id: data.sender_id,
    recipient_id: data.recipient_id,
    thread_key: data.thread_key,
  }));
  return {
    findUniqueUser,
    findManyMessages,
    updateManyMessages,
    countMessages,
    createMessage,
    prisma: {
      user: { findUnique: findUniqueUser },
      coachMessage: {
        findMany: findManyMessages,
        updateMany: updateManyMessages,
        count: countMessages,
        create: createMessage,
      },
    } as any,
  };
}

const COACH: MockCoach = { id: 'coach-1', name: 'Coach A', role: 'coach' };
const CLIENT_WITH_COACH: MockClient = {
  id: 'client-1',
  coach_id: COACH.id,
};
const CLIENT_NO_COACH: MockClient = {
  id: 'client-2',
  coach_id: null,
};

describe('MessagesService.getThread', () => {
  it('returns has_coach=false when client has no coach assigned', async () => {
    const { prisma } = makePrisma({ client: CLIENT_NO_COACH });
    const svc = new MessagesService(prisma);
    const result = await svc.getThread('client-2');
    expect(result.has_coach).toBe(false);
    expect(result.thread_key).toBeNull();
    expect(result.coach_name).toBeNull();
    expect(result.messages).toEqual([]);
    expect(result.next_cursor).toBeNull();
  });

  it('returns the thread oldest-first when client has a coach', async () => {
    const rows = [
      // The service queries desc and reverses; mock returns newest first.
      {
        id: 'm2',
        body: 'second',
        sender_id: COACH.id,
        recipient_id: 'client-1',
        read_at: null,
        created_at: new Date('2026-05-09T12:30:00Z'),
      },
      {
        id: 'm1',
        body: 'first',
        sender_id: 'client-1',
        recipient_id: COACH.id,
        read_at: new Date(),
        created_at: new Date('2026-05-09T12:00:00Z'),
      },
    ];
    const { prisma, updateManyMessages } = makePrisma({
      client: CLIENT_WITH_COACH,
      coach: COACH,
      threadRows: rows,
    });
    const svc = new MessagesService(prisma);
    const result = await svc.getThread('client-1');
    expect(result.has_coach).toBe(true);
    expect(result.coach_name).toBe('Coach A');
    expect(result.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(result.messages[0].from_coach).toBe(false);
    expect(result.messages[1].from_coach).toBe(true);
    // mark-as-read sweep ran
    expect(updateManyMessages).toHaveBeenCalled();
  });

  it('emits next_cursor when there is another older page', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `m${i}`,
      body: `msg ${i}`,
      sender_id: COACH.id,
      recipient_id: 'client-1',
      read_at: null,
      created_at: new Date(`2026-05-09T${String(10 + (i % 12)).padStart(2, '0')}:00:00Z`),
    }));
    const { prisma } = makePrisma({ client: CLIENT_WITH_COACH, coach: COACH, threadRows: rows });
    const svc = new MessagesService(prisma);
    const result = await svc.getThread('client-1', { limit: 50 });
    expect(result.messages).toHaveLength(50);
    expect(result.next_cursor).not.toBeNull();
  });

  it('rejects a stale coach_id pointing at a demoted user', async () => {
    const stale: MockClient = {
      id: 'client-3',
      coach_id: 'former-coach',
    };
    const demotedCoach: MockCoach = {
      id: 'former-coach',
      name: 'Former',
      role: 'student',
    };
    const { prisma } = makePrisma({ client: stale, coach: demotedCoach });
    const svc = new MessagesService(prisma);
    const result = await svc.getThread('client-3');
    expect(result.has_coach).toBe(false);
  });
});

describe('MessagesService.unreadCount', () => {
  it('returns 0 when the client has no coach', async () => {
    const { prisma } = makePrisma({ client: CLIENT_NO_COACH });
    const svc = new MessagesService(prisma);
    await expect(svc.unreadCount('client-2')).resolves.toEqual({ count: 0 });
  });

  it('returns the prisma count when the client has a coach', async () => {
    const { prisma } = makePrisma({ client: CLIENT_WITH_COACH, coach: COACH, unread: 7 });
    const svc = new MessagesService(prisma);
    await expect(svc.unreadCount('client-1')).resolves.toEqual({ count: 7 });
  });
});

describe('MessagesService.send', () => {
  it('rejects a non-string body', async () => {
    const { prisma } = makePrisma({ client: CLIENT_WITH_COACH, coach: COACH });
    const svc = new MessagesService(prisma);
    await expect(svc.send('client-1', 42)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an empty / whitespace-only body', async () => {
    const { prisma } = makePrisma({ client: CLIENT_WITH_COACH, coach: COACH });
    const svc = new MessagesService(prisma);
    await expect(svc.send('client-1', '   ')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a body over 4000 characters', async () => {
    const { prisma } = makePrisma({ client: CLIENT_WITH_COACH, coach: COACH });
    const svc = new MessagesService(prisma);
    const tooLong = 'a'.repeat(4001);
    await expect(svc.send('client-1', tooLong)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException when the client has no coach assigned', async () => {
    const { prisma } = makePrisma({ client: CLIENT_NO_COACH });
    const svc = new MessagesService(prisma);
    await expect(svc.send('client-2', 'hello')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('persists the trimmed body and returns it as from_coach=false', async () => {
    const { prisma, createMessage } = makePrisma({ client: CLIENT_WITH_COACH, coach: COACH });
    const svc = new MessagesService(prisma);
    const result = await svc.send('client-1', '  hello coach  ');
    expect(createMessage).toHaveBeenCalledWith({
      data: expect.objectContaining({
        body: 'hello coach',
        sender_id: 'client-1',
        recipient_id: 'coach-1',
      }),
    });
    expect(result.from_coach).toBe(false);
    expect(result.body).toBe('hello coach');
  });
});

describe('MessagesService.markRead', () => {
  it('returns marked=0 when there is no coach', async () => {
    const { prisma } = makePrisma({ client: CLIENT_NO_COACH });
    const svc = new MessagesService(prisma);
    await expect(svc.markRead('client-2')).resolves.toEqual({ marked: 0 });
  });

  it('returns the updateMany result when the client has a coach', async () => {
    const { prisma, updateManyMessages } = makePrisma({
      client: CLIENT_WITH_COACH,
      coach: COACH,
      unread: 3,
    });
    updateManyMessages.mockResolvedValue({ count: 3 });
    const svc = new MessagesService(prisma);
    await expect(svc.markRead('client-1')).resolves.toEqual({ marked: 3 });
  });
});
