import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ServiceTokenGuard,
  constantTimeEqual,
} from '../src/admin/federation/service-token.guard';

function ctx(headers: Record<string, string> = {}): ExecutionContext {
  const req = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function configWith(token: string | undefined): any {
  return { get: () => token };
}

const VALID_TOKEN = 'a'.repeat(64);

describe('ServiceTokenGuard', () => {
  it('returns 503 when FEDERATION_SERVICE_TOKEN is unset', () => {
    const guard = new ServiceTokenGuard(configWith(undefined));
    expect(() => guard.canActivate(ctx({ authorization: `Bearer ${VALID_TOKEN}` }))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('returns 503 when FEDERATION_SERVICE_TOKEN is too short', () => {
    const guard = new ServiceTokenGuard(configWith('short'));
    expect(() => guard.canActivate(ctx({ authorization: 'Bearer ' + 'b'.repeat(40) }))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects when no Authorization header is present', () => {
    const guard = new ServiceTokenGuard(configWith(VALID_TOKEN));
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });

  it('rejects when header is not Bearer-shaped', () => {
    const guard = new ServiceTokenGuard(configWith(VALID_TOKEN));
    expect(() => guard.canActivate(ctx({ authorization: VALID_TOKEN }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when token is too short to be plausible', () => {
    const guard = new ServiceTokenGuard(configWith(VALID_TOKEN));
    expect(() => guard.canActivate(ctx({ authorization: 'Bearer abc' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an incorrect token', () => {
    const guard = new ServiceTokenGuard(configWith(VALID_TOKEN));
    const wrong = 'b'.repeat(64);
    expect(() => guard.canActivate(ctx({ authorization: `Bearer ${wrong}` }))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the correct token', () => {
    const guard = new ServiceTokenGuard(configWith(VALID_TOKEN));
    expect(guard.canActivate(ctx({ authorization: `Bearer ${VALID_TOKEN}` }))).toBe(true);
  });

  it('is case-insensitive on the Bearer prefix', () => {
    const guard = new ServiceTokenGuard(configWith(VALID_TOKEN));
    expect(guard.canActivate(ctx({ authorization: `bearer ${VALID_TOKEN}` }))).toBe(true);
  });
});

describe('constantTimeEqual', () => {
  it('matches identical strings', () => {
    expect(constantTimeEqual('hello-world-token', 'hello-world-token')).toBe(true);
  });

  it('rejects different equal-length strings', () => {
    expect(constantTimeEqual('hello-world-token', 'HELLO-WORLD-TOKEN')).toBe(false);
  });

  it('rejects different-length strings without leaking length', () => {
    expect(constantTimeEqual('short', 'much-longer-string')).toBe(false);
  });
});
