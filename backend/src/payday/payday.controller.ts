import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaydayService } from './payday.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  DeployPaycheckSchema,
  SavePaydayTemplateSchema,
} from '../common/validators/schemas';

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('api/payday')
@UseGuards(JwtAuthGuard)
export class PaydayController {
  constructor(private readonly paydayService: PaydayService) {}

  /**
   * POST /api/payday
   * Deploy a paycheck: apply allocations to the user's accounts.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async deployPaycheck(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = DeployPaycheckSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.paydayService.deployPaycheck(
      user.id,
      parsed.data.paycheck_amount,
      parsed.data.allocations,
    );
  }

  /**
   * GET /api/payday/templates
   * Return the user's saved allocation templates.
   */
  @Get('templates')
  async getTemplates(@CurrentUser() user: CurrentUser) {
    return this.paydayService.getTemplates(user.id);
  }

  /**
   * POST /api/payday/templates
   * Save a new allocation template.
   */
  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  async saveTemplate(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = SavePaydayTemplateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.paydayService.saveTemplate(user.id, parsed.data);
  }
}
