import { ForbiddenException } from '@nestjs/common';

/**
 * Service-layer multi-tenant guardrails.
 *
 * The HTTP layer already runs JwtAuthGuard → TenantGuard → ClientCoachLinkedGuard
 * (see app.module.ts), and `OwnsStudentGuard` covers coach→student routes.
 * These helpers are belt-and-suspenders for service methods that load a row
 * and then mutate it — i.e. the failure mode where a route param is right but
 * the body / nested record references something the caller doesn't own.
 *
 * The rule of thumb: any service method that reads a row by primary key and
 * then performs a mutation should call `assertOwnsRecord` between the read
 * and the write. That way a caller who can guess (or harvest) another user's
 * row id can still not act on it, even if a route guard is missed elsewhere.
 */
export interface TenantPrincipal {
  id: string;
  role: string;
}

export interface OwnedRecord {
  user_id: string;
}

export interface CoachOwnedRecord {
  coach_id: string;
}

/**
 * Throws ForbiddenException if `record` is not owned by `principal`.
 * Owners are allowed to act on any record. Coaches are NOT allowed to act on
 * a student's record by default — coach access goes through the coach service
 * which has its own scoping; this helper protects student-self routes.
 */
export function assertOwnsRecord(
  principal: TenantPrincipal | undefined | null,
  record: OwnedRecord | null | undefined,
  context: string = 'record',
): void {
  if (!principal) {
    throw new ForbiddenException({
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    });
  }
  if (!record) {
    // Don't leak existence. Same shape as a real ownership failure.
    throw new ForbiddenException({
      error: `${context} not found or not owned by caller`,
      code: 'TENANT_VIOLATION',
    });
  }
  if (principal.role === 'owner') return;
  if (record.user_id === principal.id) return;
  throw new ForbiddenException({
    error: `${context} not owned by caller`,
    code: 'TENANT_VIOLATION',
  });
}

/**
 * Throws ForbiddenException if `record` is not owned (as coach) by `principal`.
 * Owners pass through. Students can never own a coach-keyed record.
 */
export function assertCoachOwnsRecord(
  principal: TenantPrincipal | undefined | null,
  record: CoachOwnedRecord | null | undefined,
  context: string = 'record',
): void {
  if (!principal) {
    throw new ForbiddenException({
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    });
  }
  if (!record) {
    throw new ForbiddenException({
      error: `${context} not found or not owned by caller`,
      code: 'TENANT_VIOLATION',
    });
  }
  if (principal.role === 'owner') return;
  if (principal.role === 'coach' && record.coach_id === principal.id) return;
  throw new ForbiddenException({
    error: `${context} not owned by calling coach`,
    code: 'TENANT_VIOLATION',
  });
}

/**
 * Returns a Prisma `where` fragment that scopes a student-owned table to the
 * calling principal: owners see everything, students see only their own
 * rows. Coaches see nothing through this helper by design — coach reads of
 * a student's data must go through the coach service which already pulls
 * the coach_id link explicitly.
 */
export function scopeToSelf(
  principal: TenantPrincipal | undefined | null,
  field: string = 'user_id',
): Record<string, unknown> {
  if (!principal) {
    return { [field]: '__no_match__' };
  }
  if (principal.role === 'owner') return {};
  return { [field]: principal.id };
}
