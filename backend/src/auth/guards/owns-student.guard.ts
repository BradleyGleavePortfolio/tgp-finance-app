import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * OwnsStudentGuard
 *
 * Lifts the per-service `assertCoachOwnsStudent` checks (which lived in
 * coach.service.ts) up to the route layer. Apply with @UseGuards on any
 * coach route that takes a student param and belongs to a single coach's
 * roster.
 *
 * The guard inspects the request for the first matching param/body field
 * out of: `student_id`, `studentId`, `id` (when the route prefix is
 * `students/`). It then verifies the student record exists, has role
 * 'student', and is rostered to the calling coach (`coach_id === user.id`).
 *
 * Failure modes:
 *  - Missing student id            -> 400 BadRequestException
 *  - Student not found             -> 403 ForbiddenException (avoid leaking
 *                                     existence of arbitrary IDs)
 *  - Student belongs to another    -> 403 ForbiddenException
 *    coach
 *
 * Service-layer assertions remain in place as defense-in-depth \u2014 this guard
 * just makes the failure mode visible at the HTTP layer instead of relying
 * on every service method to remember the check.
 */
@Injectable()
export class OwnsStudentGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    // JwtAuthGuard runs before this in the global guard chain, so user is
    // populated. Defense in depth: if it isn't, fail closed.
    if (!user || user.role !== 'coach') {
      throw new ForbiddenException({
        error: 'Coach role required',
        code: 'NOT_A_COACH',
      });
    }

    const studentId = this.extractStudentId(req);
    if (!studentId) {
      throw new BadRequestException({
        error: 'Missing student id in route',
        code: 'STUDENT_ID_REQUIRED',
      });
    }

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, coach_id: true, role: true },
    });

    if (!student || student.role !== 'student' || student.coach_id !== user.id) {
      // Single error shape regardless of which check failed \u2014 don't leak
      // existence of arbitrary IDs to a hostile coach.
      throw new ForbiddenException({
        error: 'Student not in your roster',
        code: 'NOT_YOUR_STUDENT',
      });
    }

    // Cache so downstream service methods can skip the second DB hit if they
    // want to use it. Optional convenience.
    req.ownedStudent = student;
    return true;
  }

  private extractStudentId(req: any): string | undefined {
    const params = req.params || {};
    const body = req.body || {};
    const route: string = req.route?.path || req.url || '';

    // Explicit student-id param names first.
    if (params.student_id) return params.student_id;
    if (params.studentId) return params.studentId;

    // For routes like /api/coach/students/:id, treat :id as the student id.
    // This keeps existing routes (e.g. GET /students/:id, /students/:id/detail)
    // working without renaming params.
    if (params.id && /\/students\/[^/]+/.test(route)) return params.id;

    // Fallback: body fields (POSTs that take student_id in JSON).
    if (body.student_id) return body.student_id;
    if (body.studentId) return body.studentId;

    return undefined;
  }
}
