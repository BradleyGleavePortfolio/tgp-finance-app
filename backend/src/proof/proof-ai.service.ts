import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ProofArtifact, ProofAIDraft, ProofAuditAction, ProofStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toN } from '../common/money';
import {
  AUTHORITATIVE_STATUSES,
  NON_AUTHORITATIVE_STATUSES,
  ProofService,
} from './proof.service';

// Hard guardrails for the proof AI surface.
//
// What this service IS allowed to do:
//   - Read artifacts and produce a summary in plain text.
//   - Flag missing data ("no proof of net_worth_milestone in 60 days").
//   - Flag stale data (existing artifacts past staleness threshold).
//   - Flag contradictions between artifacts (claimed amount vs. EOD-derived
//     balance, two artifacts of the same kind on the same day with
//     different numbers).
//   - Draft a coach/admin note text.
//
// What this service is NEVER allowed to do (enforced below):
//   - Mutate `ProofArtifact.status`.
//   - Write a `ProofSignoff` row.
//   - Mutate `ProofArtifact.claimed_amount` or any money field anywhere.
//   - Trigger payouts, notifications, or external side-effects.
//   - Provide investment advice, recommend specific securities, or tell a
//     student what to do with their money. Output is descriptive, not
//     prescriptive.
//
// All output funnels through `ProofAIDraft` rows. A coach/admin must
// explicitly accept a draft before any state changes — and that acceptance
// goes through `ProofService.signoff`, not through this service.
//
// The model itself is not called from this scaffold. The contract is the
// guardrail; the model wiring is intentionally deferred (see README "live
// vs scaffolded"). Callers pass a precomputed `draft_text` for now, which
// keeps the surface testable without burning AI quota or pinning a model
// in tests.

export type ProofAIDraftKind =
  | 'summary'
  | 'missing_data_flag'
  | 'stale_data_flag'
  | 'contradiction_flag'
  | 'coach_note_draft'
  | 'admin_note_draft';

const ALLOWED_DRAFT_KINDS: readonly ProofAIDraftKind[] = [
  'summary',
  'missing_data_flag',
  'stale_data_flag',
  'contradiction_flag',
  'coach_note_draft',
  'admin_note_draft',
];

// Phrases whose presence in a generated draft indicates the model has
// strayed into prescriptive financial-advice territory. The guard rejects
// the draft outright rather than try to rewrite — a future TGP Brain that
// needs prescriptive copy must produce it through a different surface
// with its own audit trail. List is conservative on purpose; false
// positives are fine, false negatives are not.
const FORBIDDEN_PHRASES: RegExp[] = [
  /\byou should (?:buy|sell|invest|withdraw|liquidate|trade|short|leverage)\b/i,
  /\bi recommend (?:buying|selling|investing|moving|withdrawing)\b/i,
  /\bguaranteed return\b/i,
  /\brisk[- ]free (?:profit|return)\b/i,
  /\b(?:put|move|allocate) (?:your|the) (?:money|funds|portfolio) into\b/i,
  /\bthis (?:stock|ticker|coin|fund) will\b/i,
];

export interface ProofAIDraftRequest {
  artifact_id: string;
  draft_kind: ProofAIDraftKind;
  draft_text: string;
  model_label: string;     // e.g. "perplexity:sonar-pro"
  prompt_version: string;  // e.g. "proof-summary@v1"
}

@Injectable()
export class ProofAIService {
  private readonly logger = new Logger(ProofAIService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proofService: ProofService,
  ) {}

  // Persists an AI-generated draft against an artifact after running it
  // through the guardrails. Returns the stored row (unmodified text).
  async persistDraft(
    request: ProofAIDraftRequest,
    actorUserId?: string,
  ): Promise<ProofAIDraft> {
    if (!ALLOWED_DRAFT_KINDS.includes(request.draft_kind)) {
      throw new BadRequestException(
        `unknown ai draft kind: ${request.draft_kind}`,
      );
    }
    this.assertSafeDraftText(request.draft_text);
    if (!request.model_label.trim() || !request.prompt_version.trim()) {
      throw new BadRequestException('model_label and prompt_version are required');
    }

    const artifact = await this.prisma.proofArtifact.findUnique({
      where: { id: request.artifact_id },
    });
    if (!artifact) {
      throw new BadRequestException('proof artifact not found');
    }
    if (artifact.status === ProofStatus.flagged_abuse) {
      throw new BadRequestException(
        'AI drafts are not allowed against artifacts flagged for abuse',
      );
    }

    const draft = await this.prisma.proofAIDraft.create({
      data: {
        artifact_id: request.artifact_id,
        draft_kind: request.draft_kind,
        model_label: request.model_label,
        prompt_version: request.prompt_version,
        draft_text: request.draft_text,
      },
    });

    await this.proofService.audit(
      artifact.id,
      { user_id: actorUserId ?? 'system', role: 'ai' },
      ProofAuditAction.ai_draft_generated,
      {
        draft_id: draft.id,
        draft_kind: request.draft_kind,
        model_label: request.model_label,
        prompt_version: request.prompt_version,
      },
    );

    return draft;
  }

  // Mark a draft accepted/dismissed/edited by a human reviewer.
  // Does NOT change artifact status — that flows through ProofService.signoff.
  async resolveDraft(
    draftId: string,
    reviewer: { user_id: string; role: 'coach' | 'admin' | 'owner' },
    action: 'accepted' | 'dismissed' | 'edited',
  ): Promise<ProofAIDraft> {
    if (
      reviewer.role !== 'coach' &&
      reviewer.role !== 'admin' &&
      reviewer.role !== 'owner'
    ) {
      throw new ForbiddenException('only coach, admin, or owner can resolve a draft');
    }
    const updated = await this.prisma.proofAIDraft.update({
      where: { id: draftId },
      data: {
        resolved_by_id: reviewer.user_id,
        resolved_action: action,
        resolved_at: new Date(),
      },
    });
    await this.proofService.audit(
      updated.artifact_id,
      reviewer,
      ProofAuditAction.ai_draft_dismissed,
      { draft_id: draftId, resolved_action: action },
    );
    return updated;
  }

  // Build the read-only context an AI model would consume. Pure function:
  // no model call, no DB write. Exposes only the artifact set and a few
  // derived signals; the AI is never given the user's raw account numbers
  // beyond the snapshot already on the artifact, and never given any token
  // capable of mutating state.
  buildContext(
    subject: { user_id: string; name: string },
    artifacts: ProofArtifact[],
  ): {
    subject: { user_id: string; name: string };
    authoritative_count: number;
    pending_count: number;
    flagged_count: number;
    stale_count: number;
    by_kind: Record<string, number>;
    artifacts: Array<{
      id: string;
      kind: string;
      status: string;
      claim_label: string;
      claimed_amount: number | null;
      currency: string;
      occurred_at: string;
      is_authoritative: boolean;
    }>;
  } {
    const summary = {
      subject,
      authoritative_count: 0,
      pending_count: 0,
      flagged_count: 0,
      stale_count: 0,
      by_kind: {} as Record<string, number>,
      artifacts: [] as Array<{
        id: string;
        kind: string;
        status: string;
        claim_label: string;
        claimed_amount: number | null;
        currency: string;
        occurred_at: string;
        is_authoritative: boolean;
      }>,
    };

    for (const a of artifacts) {
      summary.by_kind[a.kind] = (summary.by_kind[a.kind] ?? 0) + 1;
      const isAuthoritative = AUTHORITATIVE_STATUSES.includes(a.status);
      if (isAuthoritative) summary.authoritative_count += 1;
      if (a.status === ProofStatus.pending_review) summary.pending_count += 1;
      if (
        a.status === ProofStatus.flagged_abuse ||
        a.status === ProofStatus.disputed
      ) {
        summary.flagged_count += 1;
      }
      if (a.status === ProofStatus.stale) summary.stale_count += 1;

      summary.artifacts.push({
        id: a.id,
        kind: a.kind,
        status: a.status,
        claim_label: a.claim_label,
        claimed_amount: a.claimed_amount == null ? null : toN(a.claimed_amount),
        currency: a.currency,
        occurred_at: a.occurred_at.toISOString().slice(0, 10),
        is_authoritative: isAuthoritative,
      });
    }

    return summary;
  }

  // Flag obvious contradictions between artifacts of the same kind on the
  // same `occurred_at` date. Pure function; doesn't write the flag —
  // callers persist via `persistDraft({ draft_kind: 'contradiction_flag' })`.
  detectAmountContradictions(
    artifacts: ProofArtifact[],
  ): Array<{ kind: string; occurred_at: string; ids: string[]; amounts: string[] }> {
    const groups = new Map<string, ProofArtifact[]>();
    for (const a of artifacts) {
      if (a.claimed_amount == null) continue;
      // Skip non-authoritative-eligible statuses to avoid noisy flags.
      if (NON_AUTHORITATIVE_STATUSES.includes(a.status)) continue;
      const dayKey =
        a.kind + '|' + a.occurred_at.toISOString().slice(0, 10);
      const list = groups.get(dayKey) ?? [];
      list.push(a);
      groups.set(dayKey, list);
    }

    const out: Array<{
      kind: string;
      occurred_at: string;
      ids: string[];
      amounts: string[];
    }> = [];
    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      const distinct = new Set(list.map((a) => a.claimed_amount!.toString()));
      if (distinct.size <= 1) continue;
      const [kind, day] = key.split('|');
      out.push({
        kind,
        occurred_at: day,
        ids: list.map((a) => a.id),
        amounts: list.map((a) => a.claimed_amount!.toString()),
      });
    }
    return out;
  }

  // Throws if `text` looks like prescriptive financial advice. Exported via
  // the service surface for tests that lock the guardrail behaviour.
  assertSafeDraftText(text: string): void {
    if (!text || text.trim().length === 0) {
      throw new BadRequestException('draft_text cannot be empty');
    }
    if (text.length > 4000) {
      throw new BadRequestException('draft_text exceeds 4000 chars');
    }
    for (const re of FORBIDDEN_PHRASES) {
      if (re.test(text)) {
        throw new BadRequestException(
          'draft_text contains prescriptive financial-advice language and cannot be persisted',
        );
      }
    }
  }
}
