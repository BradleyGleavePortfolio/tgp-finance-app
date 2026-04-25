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
import { z } from 'zod';

// ── Validation schemas ────────────────────────────────────────────────────────

const AllocationSchema = z.object({
  account_id: z.string().uuid('account_id must be a valid UUID'),
  amount: z.number().positive('Allocation amount must be positive'),
  percentage: z.number().min(0).max(100).optional(),
});

const DeployPaycheckSchema = z.object({
  paycheck_amount: z.number().positive('paycheck_amount must be positive'),
  allocations: z
    .array(AllocationSchema)
    .min(1, 'At least one allocation is required'),
});

const SaveTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  allocations: z.array(
    z.object({
      account_id: z.string().uuid(),
      percentage: z.number().min(0).max(100),
    }),
  ).min(1),
});

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
  async deployPaycheck(@Body() body: any, @CurrentUser() user: any) {
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
  async getTemplates(@CurrentUser() user: any) {
    return this.paydayService.getTemplates(user.id);
  }

  /**
   * POST /api/payday/templates
   * Save a new allocation template.
   */
  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  async saveTemplate(@Body() body: any, @CurrentUser() user: any) {
    const parsed = SaveTemplateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.paydayService.saveTemplate(user.id, parsed.data);
  }
}
