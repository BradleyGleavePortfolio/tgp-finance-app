// Sprint A — coach signup token verification.
//
// Pin the mobile-minted token byte-for-byte against the Node crypto
// HMAC-SHA256 reference. If this drifts the server will start
// 403-rejecting promotion attempts.

import { createHmac } from 'crypto';
import { hmacSha256Hex, mintCoachSignupToken } from '../coachSignupToken';

const SECRET = 'a'.repeat(64);

describe('coachSignupToken', () => {
  it('hmacSha256Hex matches Node crypto for ASCII inputs', () => {
    for (const msg of ['user-1.1700000000000', 'abc', '', 'hello world']) {
      const ours = hmacSha256Hex(SECRET, msg);
      const node = createHmac('sha256', SECRET).update(msg).digest('hex');
      expect(ours).toBe(node);
    }
  });

  it('hmacSha256Hex matches Node crypto for UTF-8 inputs', () => {
    const msg = 'user-é.1700000000000.café';
    expect(hmacSha256Hex(SECRET, msg)).toBe(
      createHmac('sha256', SECRET).update(msg).digest('hex'),
    );
  });

  it('mintCoachSignupToken produces a verifiable triplet', () => {
    const now = 1_700_000_000_000;
    const token = mintCoachSignupToken('user-42', SECRET, now);
    const [userId, expiresAtStr, sig] = token.split('.');
    expect(userId).toBe('user-42');
    expect(Number(expiresAtStr)).toBeGreaterThan(now);
    const expected = createHmac('sha256', SECRET)
      .update(`${userId}.${expiresAtStr}`)
      .digest('hex');
    expect(sig).toBe(expected);
  });

  it('refuses to mint a token with a too-short secret', () => {
    expect(() => mintCoachSignupToken('user-1', 'short')).toThrow();
  });
});
