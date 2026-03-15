import {
  Controller, Post, Get, Delete, Body, Param, UseGuards, BadRequestException,
} from '@nestjs/common';
import { WhatIfService } from './whatif.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RunWhatIfSchema, SaveWhatIfSchema } from '../common/validators/schemas';

@Controller('api/whatif')
@UseGuards(JwtAuthGuard)
export class WhatIfController {
  constructor(private readonly whatIfService: WhatIfService) {}

  @Post('run')
  async runScenario(@Body() body: any, @CurrentUser() user: any) {
    const parsed = RunWhatIfSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.whatIfService.runScenario(user.id, parsed.data.scenario_type, parsed.data.parameters);
  }

  @Get('saved')
  async getSaved(@CurrentUser() user: any) {
    return this.whatIfService.getSavedScenarios(user.id);
  }

  @Post('save')
  async saveScenario(@Body() body: any, @CurrentUser() user: any) {
    const parsed = SaveWhatIfSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.whatIfService.saveScenario(user.id, parsed.data);
  }

  @Delete(':id')
  async deleteScenario(@Param('id') id: string, @CurrentUser() user: any) {
    return this.whatIfService.deleteScenario(user.id, id);
  }
}
