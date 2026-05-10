import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { InsightsFederationService } from './insights-federation.service';
import { ServiceTokenGuard } from './service-token.guard';
import { FinanceInsightsSummary } from './insights-federation.types';

/**
 * InsightsFederationController
 *
 * Cross-app insights federation surface consumed by
 * `growth-project-backend`'s Holistic Insights v1 engine (Sprint B-3).
 *
 * Auth: shared-secret bearer (`FEDERATION_SERVICE_TOKEN`) via
 * `ServiceTokenGuard`. Same posture as `/api/admin/federation/*` — the
 * route is marked `@Public()` so the user JWT guard does not also try
 * to validate a Supabase session that the fitness backend does not have.
 *
 * Read-only GETs only. Returns numeric weekly series in a shape the
 * backend client expects verbatim; never PII beyond the email already
 * present in the URL.
 */
@Controller('api/federation/insights')
@Public()
@UseGuards(ServiceTokenGuard)
export class InsightsFederationController {
  constructor(private readonly svc: InsightsFederationService) {}

  @Get('finance-summary')
  async financeSummary(
    @Query('email') emailRaw?: string,
    @Query('window_days') windowDaysRaw?: string,
  ): Promise<FinanceInsightsSummary> {
    const email = (emailRaw ?? '').trim();
    if (!email || email.length > 254 || !looksLikeEmail(email)) {
      throw new BadRequestException({
        error: 'email is required and must be a valid email under 254 chars',
        code: 'INVALID_EMAIL',
      });
    }
    const parsed = parseInt(windowDaysRaw ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 7 || parsed > 365) {
      throw new BadRequestException({
        error: 'window_days must be an integer between 7 and 365',
        code: 'INVALID_WINDOW_DAYS',
      });
    }
    return this.svc.getFinanceSummary(email, parsed);
  }
}

// Cheap email-shape check. The backend already validates more
// thoroughly upstream; we want to fail fast on obviously-bad inputs
// rather than do a database lookup for "asdf".
function looksLikeEmail(s: string): boolean {
  const at = s.indexOf('@');
  if (at <= 0 || at === s.length - 1) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (local.length === 0 || domain.length === 0) return false;
  if (!domain.includes('.')) return false;
  return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(s);
}
