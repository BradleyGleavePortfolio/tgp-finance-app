import { HttpException } from '@nestjs/common';
import {
  AIRateLimitService,
  AI_RATE_LIMIT,
  AI_RATE_WINDOW_MS,
} from '../src/ai/ai-rate-limit.service';

type LogRow = { user_id: string; endpoint: string; created_at: Date };

function buildPrismaMock(initialRows: LogRow[] = []) {
  const rows: LogRow[] = [...initialRows];
  const calls = { create: 0, deleteMany: 0, count: 0 };

  return {
    rows,
    calls,
    aIRequestLog: {
      count: jest.fn(async ({ where }: any) => {
        calls.count += 1;
        return rows.filter(
          (r) =>
            r.user_id === where.user_id &&
            (!where.created_at?.gt || r.created_at > where.created_at.gt),
        ).length;
      }),
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        const matching = rows.filter(
          (r) =>
            r.user_id === where.user_id &&
            (!where.created_at?.gt || r.created_at > where.created_at.gt),
        );
        if (matching.length === 0) return null;
        const sorted = [...matching].sort((a, b) =>
          orderBy?.created_at === 'asc'
            ? a.created_at.getTime() - b.created_at.getTime()
            : b.created_at.getTime() - a.created_at.getTime(),
        );
        return sorted[0];
      }),
      create: jest.fn(async ({ data }: any) => {
        calls.create += 1;
        const row: LogRow = {
          user_id: data.user_id,
          endpoint: data.endpoint,
          created_at: new Date(),
        };
        rows.push(row);
        return { id: 'mock-' + rows.length, ...row };
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        calls.deleteMany += 1;
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (where.created_at?.lt && rows[i].created_at < where.created_at.lt) {
            rows.splice(i, 1);
          }
        }
        return { count: before - rows.length };
      }),
    },
  };
}

describe('AIRateLimitService', () => {
  it('rate limit constant is 20 requests per 60 minutes (matches user-facing copy)', () => {
    expect(AI_RATE_LIMIT).toBe(20);
    expect(AI_RATE_WINDOW_MS).toBe(60 * 60 * 1000);
  });

  it('allows the first call and returns remaining = limit-1', async () => {
    const prisma = buildPrismaMock();
    const svc = new AIRateLimitService(prisma as any);

    const res = await svc.consume('user-1', 'chat');

    expect(res.remaining).toBe(AI_RATE_LIMIT - 1);
    expect(prisma.calls.create).toBe(1);
  });

  it('blocks the (limit+1)th call inside the same window with HTTP 429', async () => {
    const now = Date.now();
    const seed: LogRow[] = Array.from({ length: AI_RATE_LIMIT }, (_, i) => ({
      user_id: 'user-1',
      endpoint: 'chat',
      created_at: new Date(now - i * 1000),
    }));
    const prisma = buildPrismaMock(seed);
    const svc = new AIRateLimitService(prisma as any);

    let caught: any = null;
    try {
      await svc.consume('user-1', 'chat');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught.getStatus()).toBe(429);
    const body = caught.getResponse();
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.limit).toBe(AI_RATE_LIMIT);
    expect(typeof body.reset_at).toBe('string');
    expect(prisma.calls.create).toBe(0); // blocked → no new row
  });

  it('per-user counters are isolated: user-A maxed does not block user-B', async () => {
    const now = Date.now();
    const seed: LogRow[] = Array.from({ length: AI_RATE_LIMIT }, () => ({
      user_id: 'user-A',
      endpoint: 'chat',
      created_at: new Date(now),
    }));
    const prisma = buildPrismaMock(seed);
    const svc = new AIRateLimitService(prisma as any);

    await expect(svc.consume('user-A', 'chat')).rejects.toBeInstanceOf(HttpException);
    await expect(svc.consume('user-B', 'chat')).resolves.toEqual({
      remaining: AI_RATE_LIMIT - 1,
    });
  });

  it('rows older than the window do not count against the budget', async () => {
    const old = new Date(Date.now() - AI_RATE_WINDOW_MS - 60_000);
    const seed: LogRow[] = Array.from({ length: AI_RATE_LIMIT }, () => ({
      user_id: 'user-1',
      endpoint: 'chat',
      created_at: old,
    }));
    const prisma = buildPrismaMock(seed);
    const svc = new AIRateLimitService(prisma as any);

    const res = await svc.consume('user-1', 'chat');
    expect(res.remaining).toBe(AI_RATE_LIMIT - 1);
  });

  it('snapshot returns used/remaining without inserting a row', async () => {
    const now = Date.now();
    const seed: LogRow[] = Array.from({ length: 5 }, () => ({
      user_id: 'user-1',
      endpoint: 'chat',
      created_at: new Date(now),
    }));
    const prisma = buildPrismaMock(seed);
    const svc = new AIRateLimitService(prisma as any);

    const snap = await svc.snapshot('user-1');
    expect(snap).toEqual({
      limit: AI_RATE_LIMIT,
      used: 5,
      remaining: AI_RATE_LIMIT - 5,
      window_seconds: 3600,
    });
    expect(prisma.calls.create).toBe(0);
  });
});
