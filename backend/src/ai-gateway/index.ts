// Public surface of the AI Gateway seam.
//
// Importers should pull from this barrel rather than the individual
// files so that internal reorganisation does not break callers. The
// gateway has no Nest module of its own in this PR — it is consumed
// directly. A `AIGatewayModule` will be added in the wiring PR alongside
// the transport implementation.

export {
  AI_GATEWAY_MODES,
  PINNED_GUARDRAILS,
  resolveGatewayConfig,
  type AIGatewayConfig,
  type AIGatewayMode,
  type PinnedGuardrails,
} from './gateway-config';

export {
  DRAFT_KINDS,
  PROVENANCE_SOURCES,
  AUTHORITY_BANDS,
  ProvenanceTagSchema,
  FinanceContextEntrySchema,
  FinanceSafePromptContextSchema,
  GatewayDraftRequestSchema,
  GatewayDraftResponseSchema,
  DraftAuditMetaSchema,
  DraftResponseStatus,
  type DraftKind,
  type ProvenanceSource,
  type AuthorityBand,
  type ProvenanceTag,
  type FinanceContextEntry,
  type FinanceSafePromptContext,
  type GatewayDraftRequest,
  type GatewayDraftResponse,
  type DraftAuditMeta,
  type DraftResponseStatusT,
} from './gateway-contracts';

export {
  PROOF_KIND_VALUES,
  PROOF_STATUS_VALUES,
  ProofProvenanceExportSchema,
  bandForStatus,
  correlationIdFor,
  countByBand,
  type ProofKindValue,
  type ProofStatusValue,
  type ProofProvenanceExport,
} from './proof-provenance-export';

export {
  AIGatewayClient,
  digestContext,
  type GatewayTransport,
} from './gateway-client';
