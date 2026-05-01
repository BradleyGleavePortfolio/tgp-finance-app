import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AbuseFlagSchema,
  CorrectAmountSchema,
  SignoffProofSchema,
  SubmitProofSchema,
} from './contracts';
import { ProofService } from './proof.service';

// Thin controller. All real work — including the role gate — runs in the
// service. The controller's only jobs are body validation (via Zod, like the
// rest of the backend) and forwarding the actor context.
//
// Wire-shape note: the existing `RoleGuard` is currently coupled to
// /api/admin routes; rather than retrofit it here, the service rechecks the
// role on every privileged write. The first integration PR that wires this
// module into client surfaces should add a dedicated `ProofRoleGuard` so the
// 403s come back at the HTTP boundary rather than from the service.
@Controller('api/proof')
@UseGuards(JwtAuthGuard)
export class ProofController {
  constructor(private readonly proofService: ProofService) {}

  @Post()
  async submit(
    @Body() body: unknown,
    @CurrentUser() user: { id: string; role: string },
  ) {
    const parsed = SubmitProofSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.proofService.submit(
      user.id,
      { user_id: user.id, role: this.normalizeRole(user.role) },
      parsed.data,
    );
  }

  @Get('mine')
  async listMine(@CurrentUser() user: { id: string }) {
    return this.proofService.listForUser(user.id);
  }

  @Get('queue')
  async listQueue(
    @CurrentUser() user: { id: string; role: string },
    @Query('all') all?: string,
  ) {
    const role = this.normalizeRole(user.role);
    if (role === 'student') {
      throw new BadRequestException('students cannot read the review queue');
    }
    // Coaches see only their own queue. Owner/admin can pass ?all=1 to see
    // every pending artifact across coaches.
    const reviewerFilter = role === 'coach' ? user.id : all === '1' ? undefined : user.id;
    return this.proofService.listForReviewQueue(reviewerFilter);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.proofService.getWithTrail(id);
  }

  @Post(':id/signoff')
  async signoff(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: { id: string; role: string },
  ) {
    const parsed = SignoffProofSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.proofService.signoff(
      id,
      { user_id: user.id, role: this.normalizeRole(user.role) },
      parsed.data,
    );
  }

  @Post(':id/abuse-flag')
  async flagAbuse(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: { id: string; role: string },
  ) {
    const parsed = AbuseFlagSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.proofService.flagAbuse(
      id,
      { user_id: user.id, role: this.normalizeRole(user.role) },
      parsed.data,
    );
  }

  @Post(':id/correct-amount')
  async correctAmount(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: { id: string; role: string },
  ) {
    const parsed = CorrectAmountSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.proofService.correctAmount(
      id,
      { user_id: user.id, role: this.normalizeRole(user.role) },
      parsed.data,
    );
  }

  // Maps the JWT `role` claim ('student' | 'coach' | 'owner') onto the
  // ActorContext shape the service expects. `owner` is treated as `admin`
  // for proof purposes so an owner inherits every admin power; the audit
  // log preserves the original role string from the JWT.
  private normalizeRole(role: string | undefined): 'student' | 'coach' | 'admin' | 'owner' {
    if (role === 'coach') return 'coach';
    if (role === 'admin') return 'admin';
    if (role === 'owner') return 'owner';
    return 'student';
  }
}
