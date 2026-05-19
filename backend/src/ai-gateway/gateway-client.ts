// AI Gateway client.
//
// This is the seam where a future TGP Brain wires in. In this PR the
// client validates the request, applies the fail-closed config, and
// returns a structured `unavailable` envelope. There is NO outbound
// network call, NO upstream SDK import, and NO model wiring. A
// subsequent PR (gated on backend gateway availability) replaces the
// `unavailable` branch with the real call without changing the public
// surface.
//
// Why a class with an injectable transport rather than a function: the
// future model wiring will want a transport with rate-limit, timeout,
// and Sentry instrumentation. Defining the seam as a class now means
// the wiring PR is a one-liner constructor swap and not a refactor of
// every caller.

import { createHash } from 'crypto';

import {
  type AIGatewayConfig,
  resolveGatewayConfig,
} from './gateway-config';
import {
  GatewayDraftRequestSchema,
  GatewayDraftResponseSchema,
  type GatewayDraftRequest,
  type GatewayDraftResponse,
} from './gateway-contracts';

// Transport seam. The gateway client owns request validation, audit
// metadata, and the fail-closed envelope; the transport owns the actual
// upstream call. In this PR no concrete transport ships — `null` means
// "fall closed", which is the default the future wiring PR can override
// without changing any caller.
export interface GatewayTransport {
  /**
   * Generate draft text for a validated request. The transport MUST
   * either return non-empty text or throw — `null`/empty triggers a
   * fail-closed `unavailable` envelope from the client.
   *
   * The transport receives a frozen request and the resolved config.
   * It MUST NOT mutate the request and MUST NOT widen guardrails.
   */
  generate(
    request: Readonly<GatewayDraftRequest>,
    config: Readonly<AIGatewayConfig>,
  ): Promise<string>;
}

/**
 * Pure helper: deterministic SHA-256 over the canonical JSON of a
 * gateway request's context block. The digest goes into `audit.context_digest`
 * so an audit row can prove which context produced a draft without
 * storing the context payload itself (which contains money values and
 * may be re-derivable from internal state).
 *
 * Canonicalisation: object keys are sorted recursively so two structurally-
 * equal contexts always digest to the same hash, regardless of insertion
 * order. Arrays preserve order — they are positionally meaningful.
 */
export function digestContext(request: GatewayDraftRequest): string {
  const canonical = canonicalJson(request.context);
  return createHash('sha256').update(canonical).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') +
    '}'
  );
}

function unavailable(
  request: GatewayDraftRequest,
  config: AIGatewayConfig,
  reason: string,
): GatewayDraftResponse {
  const audit = {
    model_id: config.model_id,
    prompt_version: config.prompt_version,
    gateway_mode: config.mode,
    idempotency_key: request.idempotency_key,
    created_at: new Date().toISOString(),
    context_digest: digestContext(request),
  };
  // Validate via the schema so a future shape change here can't silently
  // emit a malformed audit row.
  return GatewayDraftResponseSchema.parse({
    status: 'unavailable',
    draft_text: null,
    reason,
    audit,
  });
}

export class AIGatewayClient {
  constructor(
    private readonly transport: GatewayTransport | null = null,
    private readonly resolveConfig: (
      env?: NodeJS.ProcessEnv,
    ) => AIGatewayConfig = resolveGatewayConfig,
  ) {}

  /**
   * Produce a draft for the given request. Always returns an envelope —
   * never throws on guardrail or config failures. Throws only on
   * programmer errors (e.g. a malformed request that fails Zod parsing).
   */
  async draft(input: GatewayDraftRequest): Promise<GatewayDraftResponse> {
    // Re-parse at the seam so a caller that bypassed validation upstream
    // still gets a typed, frozen request here. Throws on invalid input
    // — that IS a programmer error and must surface to the caller.
    const request = Object.freeze(GatewayDraftRequestSchema.parse(input));

    const config = this.resolveConfig();

    if (!config.enabled) {
      return unavailable(
        request,
        config,
        `gateway disabled: ${config.reason}`,
      );
    }

    if (!this.transport) {
      return unavailable(
        request,
        config,
        'gateway enabled but no transport wired; pending backend gateway integration',
      );
    }

    let text: string;
    try {
      text = await this.transport.generate(request, config);
    } catch (err: any) {
      // Never echo upstream error details to the caller. The audit row
      // gets the generic reason; observability picks up the real error
      // upstream of the gateway.
      const reason =
        typeof err?.message === 'string' && err.message.length < 200
          ? `transport error: ${err.message}`
          : 'transport error';
      return unavailable(request, config, reason);
    }

    if (!text || text.trim().length === 0) {
      return unavailable(request, config, 'transport returned empty draft');
    }

    const audit = {
      model_id: config.model_id,
      prompt_version: config.prompt_version,
      gateway_mode: config.mode,
      idempotency_key: request.idempotency_key,
      created_at: new Date().toISOString(),
      context_digest: digestContext(request),
    };

    return GatewayDraftResponseSchema.parse({
      status: 'draft_generated',
      draft_text: text,
      reason: `draft generated under ${config.mode} mode`,
      audit,
    });
  }
}
