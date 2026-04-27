import { ForbiddenException } from '@nestjs/common';
import {
  assertCoachOwnsRecord,
  assertOwnsRecord,
  scopeToSelf,
} from '../src/common/tenancy';

describe('tenancy helpers (service-layer guardrails)', () => {
  describe('assertOwnsRecord', () => {
    const student = { id: 'u-1', role: 'student' };
    const owner = { id: 'admin-1', role: 'owner' };
    const otherStudent = { id: 'u-2', role: 'student' };

    it('passes when the record is owned by the caller', () => {
      expect(() => assertOwnsRecord(student, { user_id: 'u-1' })).not.toThrow();
    });

    it('owner bypass: passes for any owned record', () => {
      expect(() => assertOwnsRecord(owner, { user_id: 'u-1' })).not.toThrow();
      expect(() => assertOwnsRecord(owner, { user_id: 'u-2' })).not.toThrow();
    });

    it('throws Forbidden when student touches another student row', () => {
      expect(() => assertOwnsRecord(student, { user_id: 'u-2' })).toThrow(ForbiddenException);
    });

    it('throws Forbidden when record is null/undefined (no existence leak)', () => {
      expect(() => assertOwnsRecord(student, null)).toThrow(ForbiddenException);
      expect(() => assertOwnsRecord(student, undefined)).toThrow(ForbiddenException);
    });

    it('throws Forbidden when there is no principal at all', () => {
      expect(() => assertOwnsRecord(null, { user_id: 'u-1' })).toThrow(ForbiddenException);
    });

    it('does not let a coach impersonate a student via assertOwnsRecord', () => {
      // Coach ownership of a student record goes through assertCoachOwnsRecord
      // / OwnsStudentGuard. assertOwnsRecord must only consider the caller's
      // own user_id (or the owner bypass).
      const coach = { id: 'coach-1', role: 'coach' };
      expect(() => assertOwnsRecord(coach, { user_id: 'u-1' })).toThrow(ForbiddenException);
      expect(() => assertOwnsRecord(coach, { user_id: otherStudent.id })).toThrow(ForbiddenException);
    });
  });

  describe('assertCoachOwnsRecord', () => {
    const coachA = { id: 'coach-a', role: 'coach' };
    const coachB = { id: 'coach-b', role: 'coach' };
    const owner = { id: 'admin-1', role: 'owner' };
    const student = { id: 'u-1', role: 'student' };

    it('passes when the record belongs to the calling coach', () => {
      expect(() => assertCoachOwnsRecord(coachA, { coach_id: 'coach-a' })).not.toThrow();
    });

    it('blocks one coach from acting on another coach\'s record', () => {
      expect(() => assertCoachOwnsRecord(coachA, { coach_id: coachB.id })).toThrow(ForbiddenException);
    });

    it('owner bypass also applies to coach-keyed records', () => {
      expect(() => assertCoachOwnsRecord(owner, { coach_id: coachA.id })).not.toThrow();
    });

    it('a student can never own a coach-keyed record', () => {
      expect(() => assertCoachOwnsRecord(student, { coach_id: 'coach-a' })).toThrow(ForbiddenException);
    });

    it('null record yields a generic Forbidden (no existence leak)', () => {
      expect(() => assertCoachOwnsRecord(coachA, null)).toThrow(ForbiddenException);
    });
  });

  describe('scopeToSelf', () => {
    it('owner gets unrestricted scope', () => {
      expect(scopeToSelf({ id: 'admin', role: 'owner' })).toEqual({});
    });

    it('student gets a user_id filter pinned to themselves', () => {
      expect(scopeToSelf({ id: 'u-1', role: 'student' })).toEqual({ user_id: 'u-1' });
    });

    it('honors a custom field name', () => {
      expect(scopeToSelf({ id: 'u-1', role: 'student' }, 'owner_id')).toEqual({ owner_id: 'u-1' });
    });

    it('fail-closed when no principal: returns a never-match filter', () => {
      expect(scopeToSelf(null)).toEqual({ user_id: '__no_match__' });
      expect(scopeToSelf(undefined)).toEqual({ user_id: '__no_match__' });
    });
  });
});
