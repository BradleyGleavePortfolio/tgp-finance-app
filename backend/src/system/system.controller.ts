/**
 * SystemController — public ops + trust surface.
 *
 * - GET /system/trust-meta    — security/encryption metadata for the mobile
 *                               Trust Center (UX Psychology Report #2).
 * - GET /system/release-info  — build/runtime metadata for the mobile splash,
 *                               the coach console, and on-call. Lets a human
 *                               or a tool answer "what's actually running?"
 *                               without shelling into Fly.
 *
 * Both endpoints are intentionally @Public so the mobile app and the console
 * can read them before authentication. Neither returns secrets.
 */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { buildReleaseInfo } from './release-info';

@ApiTags('system')
@Controller('system')
export class SystemController {
  @Public()
  @Get('trust-meta')
  @ApiOperation({ summary: 'Trust Center metadata (UX Psychology Report #2).' })
  trustMeta() {
    return {
      lastSecurityUpdate: '2026-04-25T20:00:00Z',
      encryptionLevel: 'tls1.3 + at-rest aes-256',
      dataResidency: 'us-east',
      auditPolicyVersion: 'v1.0',
      dataExportSupported: true,
      accountDeletionSupported: true,
      readOnlyAccountAccess: true,
    };
  }

  @Public()
  @Get('release-info')
  @ApiOperation({ summary: 'Build/runtime release metadata for splash, console, and on-call.' })
  releaseInfo() {
    return buildReleaseInfo();
  }
}
