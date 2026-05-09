// Sprint A audit fix coach #5 — cursor pagination tests.
//
// We pin the encode/decode contract and the page-size contract on
// CoachService.getCoachClients. Full integration would need a DB,
// so we mock prisma at the call boundary; that is enough to verify
// the public shape (limit clamp, take = limit + 1 fetch, next_cursor
// emitted only when the page is full).

import {
  encodeRosterCursor,
  decodeRosterCursor,
  CoachService,
} from '../src/coach/coach.service';

describe('roster cursor encoding', () => {
  it('round-trips a valid id', () => {
    const id = 'abc-123-def';
    expect(decodeRosterCursor(encodeRosterCursor(id))).toBe(id);
  });

  it('returns null for undefined / empty / malformed cursors', () => {
    expect(decodeRosterCursor(undefined)).toBeNull();
    expect(decodeRosterCursor('')).toBeNull();
    // base64-decodes to a string that does not start with `v1:`
    expect(decodeRosterCursor('bm9wZQ==')).toBeNull();
  });

  it('rejects a v1 token with empty id', () => {
    const empty = Buffer.from('v1:', 'utf8').toString('base64url');
    expect(decodeRosterCursor(empty)).toBeNull();
  });

  it('produces a URL-safe base64 string', () => {
    const cursor = encodeRosterCursor('abc/+=def');
    // base64url charset is [A-Za-z0-9_-] only.
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('CoachService.getCoachClients pagination contract', () => {
  function makeRow(id: string, lastEod: Date | null = null) {
    return {
      id,
      name: `Client ${id}`,
      email: `${id}@example.com`,
      created_at: new Date('2026-05-01T00:00:00Z'),
      profile: {
        net_worth_snapshot: 0,
        total_debt: 0,
        total_assets: 0,
        wealth_velocity_score: 0,
        last_eod_date: lastEod,
        primary_goal: null,
        current_priority_index: 0,
      },
      _count: { eod_submissions: 0 },
    };
  }

  function makePrisma(rows: ReturnType<typeof makeRow>[]) {
    const findMany = jest.fn(async (args: { take: number }) =>
      rows.slice(0, args.take),
    );
    return {
      findMany,
      svc: new CoachService({ user: { findMany } } as any),
    };
  }

  it('clamps limit to MAX_TAKE=50', async () => {
    const rows = Array.from({ length: 60 }, (_, i) =>
      makeRow(`u${String(i).padStart(3, '0')}`),
    );
    const { svc, findMany } = makePrisma(rows);
    await svc.getCoachClients('coach-1', { limit: 999 });
    expect(findMany).toHaveBeenCalled();
    // take should be 51 (limit clamped to 50 + 1 lookahead).
    expect(findMany.mock.calls[0][0].take).toBe(51);
  });

  it('uses default limit=25 when caller omits one', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => makeRow(`u${i}`));
    const { svc, findMany } = makePrisma(rows);
    await svc.getCoachClients('coach-1', {});
    expect(findMany.mock.calls[0][0].take).toBe(26);
  });

  it('returns next_cursor only when the page is full', async () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      makeRow(`u${String(i).padStart(2, '0')}`),
    );
    const { svc } = makePrisma(rows);
    const result = await svc.getCoachClients('coach-1', { limit: 10 });
    expect(result.clients).toHaveLength(10);
    expect(result.next_cursor).not.toBeNull();
    // The cursor decodes to the last id in the returned page.
    const last = result.clients[result.clients.length - 1].id;
    expect(decodeRosterCursor(result.next_cursor!)).toBe(last);
  });

  it('returns next_cursor=null on the final page', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow(`u${i}`),
    );
    const { svc } = makePrisma(rows);
    const result = await svc.getCoachClients('coach-1', { limit: 10 });
    expect(result.clients).toHaveLength(5);
    expect(result.next_cursor).toBeNull();
  });
});
