import { scopeToCoach, isOwner, isCoachOrOwner } from '../src/auth/scope';

describe('scopeToCoach', () => {
  it('returns empty filter for owner (sees all)', () => {
    expect(scopeToCoach({ id: 'owner-1', role: 'owner' })).toEqual({});
  });

  it('scopes to coach.id for coach role', () => {
    expect(scopeToCoach({ id: 'coach-1', role: 'coach' })).toEqual({ coach_id: 'coach-1' });
  });

  it('honors a custom field name', () => {
    expect(scopeToCoach({ id: 'coach-1', role: 'coach' }, 'coachId')).toEqual({ coachId: 'coach-1' });
  });

  it('returns a never-match filter for student role (fail-closed)', () => {
    expect(scopeToCoach({ id: 's-1', role: 'student' })).toEqual({ coach_id: '__no_match__' });
  });

  it('returns a never-match filter when user is missing', () => {
    expect(scopeToCoach(undefined as any)).toEqual({ coach_id: '__no_match__' });
  });
});

describe('isOwner / isCoachOrOwner', () => {
  it('isOwner only true for owner role', () => {
    expect(isOwner({ id: 'a', role: 'owner' })).toBe(true);
    expect(isOwner({ id: 'a', role: 'coach' })).toBe(false);
    expect(isOwner({ id: 'a', role: 'student' })).toBe(false);
    expect(isOwner(null)).toBe(false);
  });

  it('isCoachOrOwner true for coach and owner', () => {
    expect(isCoachOrOwner({ id: 'a', role: 'owner' })).toBe(true);
    expect(isCoachOrOwner({ id: 'a', role: 'coach' })).toBe(true);
    expect(isCoachOrOwner({ id: 'a', role: 'student' })).toBe(false);
  });
});
