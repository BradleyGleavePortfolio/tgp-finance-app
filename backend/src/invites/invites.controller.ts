import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InvitesService } from './invites.service';

const AttachSchema = z.object({
  invite_code: z.string().min(1).max(64),
});

@Controller('api/invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  /**
   * Preview a coach code before signup. Public so the mobile signup form can
   * render "You'll be coached by Alice" before the user creates an account.
   * Only exposes safe fields (coach name + the code itself).
   */
  @Public()
  @Get('preview')
  async preview(@Query('code') code?: string) {
    if (!code) {
      throw new BadRequestException({ error: 'code query param required', code: 'CODE_REQUIRED' });
    }
    return this.invitesService.previewByCode(code);
  }

  /**
   * Attach the calling user to a coach. Requires an authenticated session
   * (Google OAuth users land here after Supabase creates them but before they
   * have a coach_id).
   */
  @Post('attach')
  @UseGuards(JwtAuthGuard)
  async attach(@Body() body: any, @CurrentUser() user: any) {
    const parsed = AttachSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.invitesService.attachByCode(user.id, parsed.data.invite_code);
  }

  /**
   * Coach (or owner) fetches their own invite code + share path. RoleGuard
   * lets owners through automatically.
   */
  @Get('my-code')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('coach')
  async myCode(@CurrentUser() user: any) {
    return this.invitesService.getMyInvite(user.id);
  }
}
