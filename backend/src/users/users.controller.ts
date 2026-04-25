// Users controller — identity endpoints for UX Psychology Report #3
// "Identity Reinforcement / Inner Circle"
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}
