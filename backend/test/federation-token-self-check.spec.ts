// Sprint A audit fix coach #13 — federation token self-check tests.

import { FederationTokenSelfCheck } from '../src/system/federation-token-self-check';

describe('FederationTokenSelfCheck', () => {
  const ORIGINAL = process.env.FEDERATION_SERVICE_TOKEN;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.FEDERATION_SERVICE_TOKEN;
    else process.env.FEDERATION_SERVICE_TOKEN = ORIGINAL;
  });

  it('returns "unset" when the env var is missing', () => {
    delete process.env.FEDERATION_SERVICE_TOKEN;
    const check = new FederationTokenSelfCheck();
    expect(check.runCheck()).toBe('unset');
  });

  it('returns "unset" when the env var is empty / whitespace', () => {
    process.env.FEDERATION_SERVICE_TOKEN = '   ';
    const check = new FederationTokenSelfCheck();
    expect(check.runCheck()).toBe('unset');
  });

  it('returns "too_short" when the token is < 32 chars', () => {
    process.env.FEDERATION_SERVICE_TOKEN = 'abc123';
    const check = new FederationTokenSelfCheck();
    expect(check.runCheck()).toBe('too_short');
  });

  it('returns "ok" when the token is at least 32 chars', () => {
    process.env.FEDERATION_SERVICE_TOKEN = 'a'.repeat(64);
    const check = new FederationTokenSelfCheck();
    expect(check.runCheck()).toBe('ok');
  });

  it('does not throw when called via onModuleInit', () => {
    delete process.env.FEDERATION_SERVICE_TOKEN;
    const check = new FederationTokenSelfCheck();
    expect(() => check.onModuleInit()).not.toThrow();
  });
});
