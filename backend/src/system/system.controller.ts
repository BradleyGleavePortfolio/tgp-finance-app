/**
 * SystemController — public trust-meta endpoint
 * UX Psychology Report #2: "Trust as Emotion"
 *
 * GET /system/trust-meta (no auth required)
 * Returns security, encryption, and data-control metadata to surface
 * in the Trust Center and trust-cue components in the mobile app.
 */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

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
}
