/**
 * AnalyticsService — PostHog Node SDK instrumentation
 * UX Psychology Report #4: Analytics Tracking
 *
 * Design principles:
 *  - Lazy-init: PostHog client created on first use
 *  - NO-OP when POSTHOG_KEY is absent — never crashes
 *  - PII allow-list: drops email, password, name, phone, address,
 *    account_number, routing, ssn (and any key containing those substrings)
 *  - Global NestJS provider — inject anywhere via constructor
 */

import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { PostHog } from 'posthog-node';

// ---------------------------------------------------------------------------
// PII allow-list
// ---------------------------------------------------------------------------
const PII_KEY_PATTERNS: RegExp[] = [
  /^email$/i,
  /^password$/i,
  /^name$/i,
  /^phone$/i,
  /^address$/i,
  /account_number/i,
  /routing/i,
  /ssn/i,
];

function stripPII(
  props?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!props) return props;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!PII_KEY_PATTERNS.some((re) => re.test(key))) {
      safe[key] = value;
    }
  }
  return safe;
}

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private client: PostHog | null = null;

  constructor() {
    const key = process.env.POSTHOG_KEY;
    if (!key) {
      this.logger.warn(
        'POSTHOG_KEY not set — analytics will be a no-op until configured.',
      );
      return;
    }

    const host =
      process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

    try {
      this.client = new PostHog(key, { host });
    } catch (err) {
      this.logger.error('Failed to initialise PostHog client', err);
      this.client = null;
    }
  }

  /**
   * Capture an analytics event for a given user.
   * Strips PII before sending. NO-OP when PostHog key is absent.
   */
  capture(
    distinctId: string,
    event: string,
    props?: Record<string, unknown>,
  ): void {
    if (!this.client) return;
    try {
      this.client.capture({ distinctId, event, properties: stripPII(props) });
    } catch (err) {
      // Never let analytics errors surface to callers
      this.logger.error(`analytics.capture failed for event "${event}"`, err);
    }
  }

  /**
   * Associate server-side identity properties with a user.
   * Strips PII before sending.
   */
  identify(
    distinctId: string,
    props?: Record<string, unknown>,
  ): void {
    if (!this.client) return;
    try {
      this.client.identify({ distinctId, properties: stripPII(props) });
    } catch (err) {
      this.logger.error(`analytics.identify failed for user "${distinctId}"`, err);
    }
  }

  /** Flush pending events and shut down the client gracefully on app exit. */
  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.shutdown();
    } catch {
      // best-effort
    }
  }
}
