import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { NetWorthService } from './networth.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('api/networth')
@UseGuards(JwtAuthGuard)
export class NetWorthController {
  constructor(private readonly netWorthService: NetWorthService) {}

  @Get('history')
  async getHistory(
    @Query('days', new DefaultValuePipe(90), ParseIntPipe) days: number,
    @CurrentUser() user: any,
  ) {
    return this.netWorthService.getNetWorthHistory(user.id, days);
  }

  @Get('current')
  async getCurrent(@CurrentUser() user: any) {
    return this.netWorthService.getCurrentNetWorth(user.id);
  }
}
