// Sprint A — production-safe coach promotion tests.
//
// These exercise the HMAC verifier directly (no NestJS test module). The
// goal is to pin the exact rejection conditions so future refactors of
// AuthService can't re-open the dev-backdoor regression in production.

import { ForbiddenException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { AuthService } from '../src/auth/auth.service';

const SECRET = 'a'.repeat(64);

function makeService(opts: {
  user: { id: string; role: string } | null;
  audits?: { create: jest.Mock };
} = { user: { id: 'user-1', role: 'student' } }) {
  const audits = opts.audits ?? { create: jest.fn().mockResolvedValue({}) };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(opts.user),
      update: jest.fn().mockResolvedValue({ role: 'coach' }),
    },
    coachPromotionAudit: audits,
  };
  const config = {
    get: (key: string) => {
      if (key === 'COACH_SIGNUP_SECRET') return SECRET;
      return undefined;
    },
  };
  const analytics = { capture: jest.fn(), identify: jest.fn() };
  // The constructor reads SUPABASE_URL/key but otherwise does nothing in
  // the coachPromote path; we hand it a stub config that returns
  // undefined for those.
  const service = new AuthService(prisma as any, config as any, analytics as any);
  return { service, prisma, audits };
}

function mintToken(userId: string, expiresAtMs: number, secret = SECRET): string {
  const sig = createHmac('sha256', secret)
    .update(`${userId}.${expiresAtMs}`)
    .digest('hex');
  return `${userId}.${expiresAtMs}.${sig}`;
}

describe('AuthService.coachPromote — happy path', () => {
  it('flips the role to coach for a fresh, valid token', async () => {
    const { service, prisma, audits } = makeService();
    const token = mintToken('user-1', Date.now() + 60_000);
    const out = await service.coachPromote('user-1', token);
    expect(out.role).toBe('coach');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: { role: 'coach' } }),
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: 'success' }) }),
    );
  });

  it('is idempotent — already-coach is a no-op success, not a 4xx', async () => {
    const { service, prisma, audits } = makeService({
      user: { id: 'user-1', role: 'coach' },
    });
    const token = mintToken('user-1', Date.now() + 60_000);
    const out = await service.coachPromote('user-1', token);
    expect(out.role).toBe('coach');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: 'already_coach' }) }),
    );
  });
});

describe('AuthService.coachPromote — rejections', () => {
  it('rejects an expired token', async () => {
    const { service, audits } = makeService();
    const token = mintToken('user-1', Date.now() - 1_000);
    await expect(service.coachPromote('user-1', token)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: 'invalid_token', reason: 'expired' }),
      }),
    );
  });

  it('rejects a token whose userId does not match the caller', async () => {
    const { service, audits } = makeService();
    const token = mintToken('attacker', Date.now() + 60_000);
    await expect(service.coachPromote('user-1', token)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: 'invalid_token', reason: 'subject_mismatch' }),
      }),
    );
  });

  it('rejects a token signed with a different secret', async () => {
    const { service, audits } = makeService();
    const token = mintToken('user-1', Date.now() + 60_000, 'b'.repeat(64));
    await expect(service.coachPromote('user-1', token)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: 'invalid_token', reason: 'signature' }),
      }),
    );
  });

  it('rejects a malformed token shape', async () => {
    const { service, audits } = makeService();
    await expect(service.coachPromote('user-1', 'not-a-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: 'invalid_token', reason: 'shape' }),
      }),
    );
  });

  it('fails closed when COACH_SIGNUP_SECRET is missing', async () => {
    const audits = { create: jest.fn().mockResolvedValue({}) };
    const prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      coachPromotionAudit: audits,
    };
    const config = { get: () => undefined };
    const service = new AuthService(prisma as any, config as any, { capture: jest.fn(), identify: jest.fn() } as any);
    const token = mintToken('user-1', Date.now() + 60_000);
    await expect(service.coachPromote('user-1', token)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
