import { Controller, Get, Query, UseGuards, ParseFloatPipe, DefaultValuePipe } from '@nestjs/common';
import { CostLivingService } from './costliving.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('api/costliving')
@UseGuards(JwtAuthGuard)
export class CostLivingController {
  constructor(private readonly costLivingService: CostLivingService) {}

  @Get('countries')
  async getCountries() {
    return this.costLivingService.getCountries();
  }

  @Get('compare')
  async compare(
    @Query('from') from: string = 'Austin',
    @Query('to') to: string,
    @Query('income', new DefaultValuePipe(5000), ParseFloatPipe) income: number,
  ) {
    return this.costLivingService.compareLocations(from || 'Austin', to, income);
  }
}
