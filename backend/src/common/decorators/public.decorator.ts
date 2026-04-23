import { SetMetadata } from '@nestjs/common';

// SECURITY: mark an endpoint as intentionally unauthenticated. TenantGuard checks for this
// metadata and skips the auth requirement when present. Use sparingly — only for
// endpoints that must not require a JWT (e.g. /health, /api/auth/register, /api/auth/login).
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
