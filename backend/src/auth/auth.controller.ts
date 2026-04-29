import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import {
  RegisterSchema,
  LoginSchema,
  GoogleAuthSchema,
  SelectRoleSchema,
  VerifyEmailSchema,
} from '../common/validators/schemas';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown) {
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.authService.register(parsed.data);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() body: unknown) {
    const parsed = VerifyEmailSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'Token required', code: 'VALIDATION_ERROR' });
    }
    return this.authService.verifyEmail(parsed.data.token, parsed.data.type);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown) {
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.authService.login(parsed.data.email, parsed.data.password);
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleAuth(@Body() body: unknown) {
    const parsed = GoogleAuthSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'Access token required', code: 'VALIDATION_ERROR' });
    }
    return this.authService.googleAuth(parsed.data.access_token, parsed.data.id_token);
  }

  @Post('select-role')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async selectRole(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = SelectRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.authService.selectRole(user.id, parsed.data.role, parsed.data.coach_access_code);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: CurrentUser) {
    return this.authService.logout(user.id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: CurrentUser) {
    return this.authService.getMe(user.id);
  }
}
