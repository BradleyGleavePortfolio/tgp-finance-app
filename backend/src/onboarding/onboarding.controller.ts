import { Controller, Get, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubmitQuizSchema } from '../common/validators/schemas';

@Controller('api/onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('quiz')
  async submitQuiz(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = SubmitQuizSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.onboardingService.submitQuiz(user.id, parsed.data.answers);
  }

  @Get('status')
  async getStatus(@CurrentUser() user: CurrentUser) {
    return this.onboardingService.getStatus(user.id);
  }
}
