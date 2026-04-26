// Users controller — identity endpoints for UX Psychology Reports #2, #3 & #5
// #2: "Trust as Emotion" — data-export + account-deletion stubs
// #3: "Identity Reinforcement / Inner Circle"
// #5: "Contribution Loops" — badges
import { Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CommunityService } from '../community/community.service';

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
  async getFoundingNumber(@CurrentUser() user: any) {
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
  async getCircleStats(@CurrentUser() user: any) {
    return this.usersService.getCircleStats(user.id);
  }

  /**
   * POST /users/me/data-export
   * UX Psychology Report #2: "Trust as Emotion"
   * Stub — queues a data-export request for the authenticated user.
   * In production this would enqueue a background job.
   */
  @Post('data-export')
  async requestDataExport(@CurrentUser() _user: any) {
    return { requested: true, eta: 'within 24h' };
  }

  /**
   * DELETE /users/me/account
   * UX Psychology Report #2: "Trust as Emotion"
   * Soft-delete stub — schedules account deletion with a grace period.
   * In production this would mark the user record for deferred deletion.
   */
  @Delete('account')
  async deleteAccount(@CurrentUser() _user: any) {
    return { scheduled: true, gracePeriodDays: 30 };
  }

  /**
   * GET /users/me/badges
   * UX Psychology Report #5: Contribution Loops
   * Returns earned + locked badges for the current user.
   */
  @Get('badges')
  async getBadges(@CurrentUser() user: any) {
    return this.communityService.getBadges(user.id);
  }
}
