import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { ProjectionsService } from './projections.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RunProjectionSchema } from '../common/validators/schemas';

@Controller('api/projections')
@UseGuards(JwtAuthGuard)
export class ProjectionsController {
  constructor(private readonly projectionsService: ProjectionsService) {}

  @Post('run')
  async runProjection(@Body() body: any, @CurrentUser() user: any) {
    const parsed = RunProjectionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.projectionsService.runProjection(user.id, parsed.data);
  }
}
