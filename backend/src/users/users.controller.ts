// Users controller — identity endpoints.
// Data-export and account-deletion are concierge-handled via the support
// inbox until the background-job + soft-delete infrastructure is built; the
// stubs that previously returned `{ requested: true }` were removed because
// they implied an automated pipeline that does not exist.
import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CommunityService } from '../community/community.service';

@ApiTags('users')
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly communityService: CommunityService,
  ) {}

  /**
   * GET /users/me/founding-number
   * Returns the caller's founding rank (position by createdAt ASC),
   * total registered users, and whether they are a founding member (rank ≤ 1000).
   */
  @Get('founding-number')
  async getFoundingNumber(@CurrentUser() user: CurrentUser) {
    return this.usersService.getFoundingNumber(user.id);
  }

  /**
   * GET /users/me/circle-stats
   * Returns community activity stats:
   *   - activeThisWeekCount: users who submitted an EOD, habit log, or account
   *     balance update in the last 7 days.
   *   - totalMembers: total registered users.
   */
  @Get('circle-stats')
  async getCircleStats(@CurrentUser() user: CurrentUser) {
    return this.usersService.getCircleStats(user.id);
  }

  /**
   * POST /users/me/data-controls/contact
   * Logs that the authenticated user has tapped through to the data-controls
   * support contact in the Trust Center. Returns the configured support email
   * and a deterministic acknowledgement payload — there is intentionally no
   * automated pipeline behind this. Self-serve export and deletion will land
   * with their own controllers when the background-job + soft-delete schema
   * change is approved.
   */
  @Post('data-controls/contact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Acknowledge that the user has been routed to the data-controls support contact.',
  })
  async dataControlsContact(@CurrentUser() user: CurrentUser) {
    const supportContactEmail =
      process.env.SUPPORT_CONTACT_EMAIL || 'support@thegrowthproject.courses';
    return {
      mode: 'concierge' as const,
      supportContactEmail,
      acknowledgedFor: user?.id ?? null,
    };
  }

  /**
   * GET /users/me/badges
   * UX Psychology Report #5: Contribution Loops
   * Returns earned + locked badges for the current user.
   */
  @Get('badges')
  async getBadges(@CurrentUser() user: CurrentUser) {
    return this.communityService.getBadges(user.id);
  }

  /**
   * GET /users/me/access-status
   * Returns the user's access posture so the mobile app can render an
   * honest "membership" surface in the profile screen. The shape is:
   *
   *   {
   *     role: 'student' | 'coach' | 'owner',
   *     accessSource: 'self' | 'coach_managed' | 'owner',
   *     coach: { id, displayName } | null,
   *     supportContactEmail: string,
   *   }
   *
   * No business-logic gates are evaluated here — this is a read-only
   * surface. Coach-managed clients see who manages their access; coaches
   * and the owner see their own role.
   */
  @Get('access-status')
  @ApiOperation({
    summary:
      'Read-only access posture for the Profile membership card.',
  })
  async getAccessStatus(@CurrentUser() user: CurrentUser) {
    return this.usersService.getAccessStatus(user.id);
  }
}
