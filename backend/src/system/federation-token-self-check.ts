// Sprint A audit fix coach #13 — boot-time self-check for the
// cross-pillar federation token.
//
// The audit flagged that a misconfigured `FEDERATION_SERVICE_TOKEN`
// produces a silent degrade: federation calls return 503
// FEDERATION_DISABLED on the receive side, or `auth_unconfigured` on
// the send side, but the coach UX surfaces only a generic error.
// Surfacing the misconfig at boot in the Fly logs gives ops a loud
// signal to fix it before users hit the failure mode.
//
// We never throw — a missing token is acceptable in dev/preview and
// the federation receivers already 503 cleanly. The check is
// log-only.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

const MIN_TOKEN_LENGTH = 32;

@Injectable()
export class FederationTokenSelfCheck implements OnModuleInit {
  private readonly logger = new Logger('FederationTokenSelfCheck');

  onModuleInit(): void {
    this.runCheck();
  }

  /** Public for the unit test. */
  runCheck(): 'ok' | 'unset' | 'too_short' {
    const token = process.env.FEDERATION_SERVICE_TOKEN?.trim();
    if (!token) {
      this.logger.warn(
        'FEDERATION_SERVICE_TOKEN is unset — federation will return 503 ' +
          'FEDERATION_DISABLED. Cross-pillar PTM signals will not flow. Set with ' +
          'fly secrets set FEDERATION_SERVICE_TOKEN=$(openssl rand -hex 32) and deploy.',
      );
      return 'unset';
    }
    if (token.length < MIN_TOKEN_LENGTH) {
      this.logger.warn(
        `FEDERATION_SERVICE_TOKEN is too short (${token.length} chars; expected at least ${MIN_TOKEN_LENGTH}). ` +
          'Rotate the secret on both backends.',
      );
      return 'too_short';
    }
    this.logger.log(
      `federation token configured (${token.length} chars). Cross-pillar federation receive surface is enabled.`,
    );
    return 'ok';
  }
}
