import {
  Controller, Post, Get, Body, Query,
  UseGuards, BadRequestException,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { EODService } from './eod.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubmitEODSchema } from '../common/validators/schemas';

@Controller('api/eod')
@UseGuards(JwtAuthGuard)
export class EODController {
  constructor(private readonly eodService: EODService) {}

  @Post()
  async submitEOD(@Body() body: any, @CurrentUser() user: any) {
    const parsed = SubmitEODSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.eodService.submitEOD(user.id, parsed.data as any);
  }

  @Get()
  async getHistory(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @CurrentUser() user: any,
  ) {
    return this.eodService.getEODHistory(user.id, days);
  }

  @Get('today')
  async getToday(@CurrentUser() user: any) {
    return this.eodService.getTodayEOD(user.id);
  }
}
