import {
  Controller, Post, Get, Put, Body, Query, Param,
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
  async submitEOD(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = SubmitEODSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.eodService.submitEOD(user.id, parsed.data);
  }

  @Get('history')
  async getHistoryByLimit(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @CurrentUser() user: CurrentUser,
  ) {
    return this.eodService.getEODHistoryByLimit(user.id, limit);
  }

  @Get()
  async getHistory(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @CurrentUser() user: CurrentUser,
  ) {
    return this.eodService.getEODHistory(user.id, days);
  }

  @Get('today')
  async getToday(@CurrentUser() user: CurrentUser) {
    return this.eodService.getTodayEOD(user.id);
  }

  @Put(':id')
  async updateEOD(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUser,
  ) {
    const parsed = SubmitEODSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.eodService.updateEOD(id, user.id, parsed.data);
  }
}
