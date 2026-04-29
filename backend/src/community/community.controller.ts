// Community controller — UX Psychology Report #5: Contribution Loops
import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommunityService } from './community.service';

@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  /** GET /community/feed — recent 30 anonymized wins */
  @Get('feed')
  async getFeed(@CurrentUser() user: CurrentUser) {
    return this.communityService.getFeed(user.id);
  }

  /** POST /community/wins  body: { action, visibility: "circle" | "public" } */
  @Post('wins')
  async postWin(
    @Body('action') action: string,
    @Body('visibility') visibility: string,
    @CurrentUser() user: CurrentUser,
  ) {
    if (!action || typeof action !== 'string' || action.trim().length < 3) {
      throw new BadRequestException('action must be at least 3 characters');
    }
    const vis = visibility === 'circle' ? 'circle' : 'public';
    return this.communityService.postWin(user.id, action.trim(), vis);
  }
}
