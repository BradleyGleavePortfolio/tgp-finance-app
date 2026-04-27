/**
 * scopeToCoach
 *
 * Helper used by list/query endpoints to enforce the source-of-truth rule:
 *
 *   - OWNER (admin)         -> sees everything (returns base where, no scope filter)
 *   - coach                 -> sees only rows where coach_id === user.id
 *   - student / anything    -> not allowed (caller should already have
 *                              role-guarded the route; we still fail closed)
 *
 * Returns a Prisma `where` fragment to spread/merge into a query.
 *
 * Example:
 *   const where = { ...scopeToCoach(user), role: 'student' };
 *   return this.prisma.user.findMany({ where });
 *
 * The caller decides which column holds the coach foreign key via `field`
 * (default `coach_id`). For tables that are owned by the coach directly
 * (CoachNote, ProgramTemplate) you can pass `field: 'coach_id'` and it works
 * the same way — owners see all rows, coaches see their own.
 */
export interface ScopeUser {
  id: string;
  role: string;
}

export function scopeToCoach(
  user: ScopeUser | undefined | null,
  field: string = 'coach_id',
): Record<string, unknown> {
  if (!user) {
    // Fail closed: an unauthenticated caller should never see anything.
    return { [field]: '__no_match__' };
  }
  if (user.role === 'owner') return {};
  if (user.role === 'coach') return { [field]: user.id };
  // Any other role (student, etc.) — caller must have a role guard. As a last
  // line of defence return a never-match filter so a missed @Roles decorator
  // can't silently leak data.
  return { [field]: '__no_match__' };
}

export function isOwner(user: ScopeUser | undefined | null): boolean {
  return !!user && user.role === 'owner';
}

export function isCoachOrOwner(user: ScopeUser | undefined | null): boolean {
  return !!user && (user.role === 'coach' || user.role === 'owner');
}
