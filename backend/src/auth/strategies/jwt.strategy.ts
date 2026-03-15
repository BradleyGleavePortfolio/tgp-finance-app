import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      // Extract JWT from Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Supabase JWTs are signed with the JWT_SECRET (service role) or SUPABASE_JWT_SECRET
      secretOrKey:
        config.get<string>('JWT_SECRET') ||
        config.get<string>('SUPABASE_ANON_KEY') ||
        'fallback_secret',
    });
  }

  async validate(payload: any) {
    // payload.sub is the Supabase user ID (UUID)
    const supabaseId = payload.sub;

    if (!supabaseId) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { supabase_id: supabaseId },
      select: {
        id: true,
        supabase_id: true,
        email: true,
        name: true,
        role: true,
        coach_id: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
