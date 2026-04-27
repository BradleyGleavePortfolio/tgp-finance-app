import { Injectable } from '@nestjs/common';
import { OwnsStudentGuard } from './owns-student.guard';

/**
 * CoachOwnsClientGuard
 *
 * Phase 1B/1C naming alias. This codebase historically called the consumer
 * users "students" (the original product framing). The product is broadening
 * to "clients" with multiple coach personas, but we don't want to rename the
 * Prisma model in the same change because that touches every existing route
 * and migration. The guard delegates to OwnsStudentGuard so the runtime
 * behaviour is identical:
 *
 *   - OWNER      -> bypass
 *   - coach      -> must own the target user (coach_id === user.id)
 *   - everyone   -> 403
 *
 * Use this name on new client-facing routes; existing student-named routes
 * can keep using OwnsStudentGuard.
 */
@Injectable()
export class CoachOwnsClientGuard extends OwnsStudentGuard {}
