// AI Gateway configuration. Read-only, fail-closed.
//
// The gateway is a forward seam for the future TGP Brain. It does NOT call
// any upstream LLM in this PR — it only resolves whether a call would be
// permitted, what model identifier would be used, and which guardrails are
// pinned to that resolution.
//
// "Fail-closed" means: any uncertainty resolves to `enabled = false`. A
// missing flag, an unknown mode, an empty model id, all collapse to a
// disabled gateway. Callers must check `enabled` before doing anything
// that would constitute an outbound call.
//
// This file deliberately has zero dependency on the existing `ai/` module,
// the `proof/` module, NestJS, or the Prisma client so it can be imported
// from anywhere (controllers, scheduled jobs, tests) without dragging the
// runtime into the test sandbox.

export const AI_GATEWAY_MODES = ['disabled', 'shadow', 'live'] as const;
export type AIGatewayMode = (typeof AI_GATEWAY_MODES)[number];

// Pinned guardrails. Independent of provider so a model swap cannot soften
// the doctrine — the gateway resolution always carries these forward.
export interface PinnedGuardrails {
  readonly outputs_are_drafts: true;
  readonly cannot_mutate_proof: true;
  readonly cannot_mutate_money: true;
  readonly cannot_sign_off: true;
  readonly no_individual_securities: true;
  readonly no_personalised_tax_advice: true;
}

export const PINNED_GUARDRAILS: PinnedGuardrails = Object.freeze({
  outputs_are_drafts: true,
  cannot_mutate_proof: true,
  cannot_mutate_money: true,
  cannot_sign_off: true,
  no_individual_securities: true,
  no_personalised_tax_advice: true,
});

export interface AIGatewayConfig {
  readonly enabled: boolean;
  readonly mode: AIGatewayMode;
  readonly model_id: string | null;
  readonly prompt_version: string | null;
  readonly reason: string;
  readonly guardrails: PinnedGuardrails;
}

const DISABLED = (reason: string): AIGatewayConfig =>
  Object.freeze({
    enabled: false,
    mode: 'disabled',
    model_id: null,
    prompt_version: null,
    reason,
    guardrails: PINNED_GUARDRAILS,
  });

function parseMode(raw: string | undefined): AIGatewayMode | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return (AI_GATEWAY_MODES as readonly string[]).includes(v)
    ? (v as AIGatewayMode)
    : null;
}

function nonEmpty(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/**
 * Resolve the gateway config for the current process env.
 *
 * Inputs (all optional):
 *   - AI_GATEWAY_MODE: 'disabled' | 'shadow' | 'live'. Anything else → disabled.
 *   - AI_GATEWAY_MODEL_ID: free-form id. Required for shadow/live.
 *   - AI_GATEWAY_PROMPT_VERSION: free-form id. Required for shadow/live so
 *     drafts can be matched to a specific prompt revision in the audit log.
 *
 * Doctrine: if NODE_ENV=production and the mode is 'live', the resolver
 * additionally requires that the upstream provider key (PERPLEXITY_API_KEY)
 * is present. Missing → disabled. The gateway never reads the key value;
 * presence is checked so prod can't accidentally enable a "live" mode that
 * has no transport.
 */
export function resolveGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
): AIGatewayConfig {
  const mode = parseMode(env.AI_GATEWAY_MODE);
  if (mode === null) {
    return DISABLED('AI_GATEWAY_MODE is unset or unrecognised');
  }
  if (mode === 'disabled') {
    return DISABLED('AI_GATEWAY_MODE=disabled');
  }

  const modelId = nonEmpty(env.AI_GATEWAY_MODEL_ID);
  if (!modelId) {
    return DISABLED(
      `AI_GATEWAY_MODEL_ID required for mode=${mode}; falling closed`,
    );
  }

  const promptVersion = nonEmpty(env.AI_GATEWAY_PROMPT_VERSION);
  if (!promptVersion) {
    return DISABLED(
      `AI_GATEWAY_PROMPT_VERSION required for mode=${mode}; falling closed`,
    );
  }

  if (mode === 'live' && env.NODE_ENV === 'production') {
    if (!nonEmpty(env.PERPLEXITY_API_KEY)) {
      return DISABLED(
        'mode=live in production requires PERPLEXITY_API_KEY; falling closed',
      );
    }
  }

  return Object.freeze({
    enabled: true,
    mode,
    model_id: modelId,
    prompt_version: promptVersion,
    reason: `gateway resolved: mode=${mode} model=${modelId} prompt=${promptVersion}`,
    guardrails: PINNED_GUARDRAILS,
  });
}
