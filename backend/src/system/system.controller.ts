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
  @ApiOperation({ summary: 'Trust Center metadata.' })
  trustMeta() {
    // Truthfulness rule: only assert capabilities the backend actually
    // implements end-to-end. Self-serve export and deletion are not yet
    // implemented (no background job, no scheduled-deletion column on the
    // user record), so we surface them as concierge-handled and direct the
    // mobile client to the support contact instead of pretending the
    // requests will be processed automatically.
    const supportContactEmail =
      process.env.SUPPORT_CONTACT_EMAIL || 'support@thegrowthproject.courses';

    return {
      lastSecurityUpdate: '2026-04-25T20:00:00Z',
      encryptionLevel: 'tls1.3 + at-rest aes-256',
      dataResidency: 'us-east',
      auditPolicyVersion: 'v1.0',
      dataExportSupported: false,
      accountDeletionSupported: false,
      readOnlyAccountAccess: true,
      supportContactEmail,
      dataControlsMode: 'concierge' as const,
    };
  }

  @Public()
  @Get('release-info')
  @ApiOperation({ summary: 'Build/runtime release metadata for splash, console, and on-call.' })
  releaseInfo() {
    return buildReleaseInfo();
  }
}
