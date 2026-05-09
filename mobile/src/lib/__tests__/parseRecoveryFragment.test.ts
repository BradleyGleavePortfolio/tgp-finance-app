// Sprint A audit fix CR-2 — unit tests for the recovery-fragment
// parser. The screen-level handler is hard to test without a full RN
// runtime, so we pin the parser contract here and the integration of
// supabase.auth.setSession + updateUser stays a manual smoke item.

import { parseRecoveryFragment } from '../parseRecoveryFragment';

describe('parseRecoveryFragment', () => {
  const valid =
    'tgp-finance://auth/reset-password#access_token=AAA.BBB.CCC&refresh_token=ref-XYZ&type=recovery&expires_in=3600';

  it('parses a well-formed Supabase recovery URL', () => {
    const result = parseRecoveryFragment(valid);
    expect(result).toEqual({ access_token: 'AAA.BBB.CCC', refresh_token: 'ref-XYZ' });
  });

  it('returns null for null / undefined / empty input', () => {
    expect(parseRecoveryFragment(null)).toBeNull();
    expect(parseRecoveryFragment(undefined)).toBeNull();
    expect(parseRecoveryFragment('')).toBeNull();
  });

  it('returns null when the URL has no fragment', () => {
    expect(parseRecoveryFragment('tgp-finance://auth/reset-password')).toBeNull();
  });

  it('returns null when type is not recovery', () => {
    const url =
      'tgp-finance://auth/callback#access_token=AAA&refresh_token=BBB&type=signup';
    expect(parseRecoveryFragment(url)).toBeNull();
  });

  it('returns null when access_token is missing', () => {
    const url =
      'tgp-finance://auth/reset-password#refresh_token=BBB&type=recovery';
    expect(parseRecoveryFragment(url)).toBeNull();
  });

  it('returns null when refresh_token is missing', () => {
    const url =
      'tgp-finance://auth/reset-password#access_token=AAA&type=recovery';
    expect(parseRecoveryFragment(url)).toBeNull();
  });

  it('does not require expires_in or other extra params', () => {
    const url =
      'tgp-finance://auth/reset-password#access_token=AAA&refresh_token=BBB&type=recovery';
    expect(parseRecoveryFragment(url)).toEqual({
      access_token: 'AAA',
      refresh_token: 'BBB',
    });
  });

  it('preserves URL-encoded token characters', () => {
    const url =
      'tgp-finance://auth/reset-password#access_token=A%2BB&refresh_token=C%3D%3D&type=recovery';
    // URLSearchParams decodes %2B -> +, %3D -> =.
    expect(parseRecoveryFragment(url)).toEqual({
      access_token: 'A+B',
      refresh_token: 'C==',
    });
  });
});
