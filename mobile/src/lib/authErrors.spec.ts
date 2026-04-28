import {
  classifyAuthError,
  safeAuthError,
  safeAuthErrorMessage,
} from './authErrors';

describe('authErrors — raw → polished mapping', () => {
  describe('classifyAuthError', () => {
    it.each([
      ['Invalid login credentials', 'invalid_credentials'],
      ['Email not confirmed', 'email_unverified'],
      ['Too many requests, please try again later', 'rate_limited'],
      ['User cancelled the sign-in flow', 'oauth_cancelled'],
      ['Provider not enabled', 'oauth_unconfigured'],
      ['redirect_uri_mismatch', 'oauth_unconfigured'],
      ['Network request failed', 'network'],
      ['Request timed out', 'network'],
      ['Internal Server Error 500', 'server'],
    ])('classifies %p as %p', (raw, kind) => {
      expect(classifyAuthError(raw)).toBe(kind);
    });

    it('returns "unknown" for unmatched strings', () => {
      expect(classifyAuthError('something completely different')).toBe('unknown');
    });

    it('treats empty input as unknown', () => {
      expect(classifyAuthError(null)).toBe('unknown');
      expect(classifyAuthError(undefined)).toBe('unknown');
      expect(classifyAuthError('')).toBe('unknown');
    });
  });

  describe('safeAuthErrorMessage', () => {
    it('never includes the raw provider error verbatim', () => {
      const raw = 'Invalid JWT: token expired at 2026-04-25T10:00:00Z';
      const safe = safeAuthErrorMessage(raw);
      expect(safe).not.toContain('JWT');
      expect(safe).not.toContain('2026-04-25');
    });

    it('returns sentences that end in a period and contain no exclamation marks', () => {
      const seenKinds = [
        'Invalid login credentials',
        'Email not confirmed',
        'Too many requests',
        'cancelled',
        'provider not enabled',
        'Network request failed',
        '500 Internal Server Error',
        'something else',
      ];
      for (const raw of seenKinds) {
        const msg = safeAuthErrorMessage(raw);
        expect(msg.endsWith('.')).toBe(true);
        expect(msg).not.toMatch(/!/);
      }
    });
  });

  describe('safeAuthError on axios-shaped errors', () => {
    it('reads error.response.data.message first', () => {
      const err = {
        response: { data: { message: 'Invalid login credentials' } },
      };
      expect(safeAuthError(err)).toBe(
        'That email and password do not match an account.',
      );
    });

    it('falls back to error.message', () => {
      const err = { message: 'redirect_uri_mismatch' };
      expect(safeAuthError(err)).toBe(
        'Google sign-in is not available on this build.',
      );
    });

    it('returns a safe default for an unrecognised shape', () => {
      expect(safeAuthError({})).toBe('Sign-in did not complete.');
    });
  });
});
