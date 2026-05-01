import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProofArtifact,
  ProofAuditAction,
  ProofKind,
  ProofSource,
  ProofStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AbuseFlagInput,
  CorrectAmountInput,
  STALENESS_THRESHOLD_DAYS,
  SignoffProofInput,
  SubmitProofInput,
} from './contracts';

// Statuses that mean "this artifact should not flow into client-facing
// aggregates." Exported because the dashboards/coach summary code consumes
// this list to filter, and we don't want two copies drifting apart.
export const NON_AUTHORITATIVE_STATUSES: ProofStatus[] = [
  ProofStatus.pending_review,
  ProofStatus.coach_rejected,
  ProofStatus.disputed,
  ProofStatus.flagged_abuse,
  ProofStatus.stale,
  ProofStatus.superseded,
];

// Statuses that mean "human review has approved this." Used by the AI
// summarizer to know what it may treat as ground truth in a draft.
export const AUTHORITATIVE_STATUSES: ProofStatus[] = [
  ProofStatus.coach_signed_off,
  ProofStatus.admin_reviewed,
];

interface ActorContext {
  user_id: string;
  role: 'student' | 'coach' | 'admin' | 'owner' | 'system' | 'ai';
}

@Injectable()
export class ProofService {
  private readonly logger = new Logger(ProofService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---- Submission ----------------------------------------------------------

  async submit(
    subjectUserId: string,
    actor: ActorContext,
    input: SubmitProofInput,
  ): Promise<ProofArtifact> {
    if (actor.role === 'student' && actor.user_id !== subjectUserId) {
      throw new ForbiddenException('students can only submit proof for themselves');
    }

    // The contracts layer already enforced kind <-> amount <-> source. The
    // service only needs to coerce types and write.
    const data: Prisma.ProofArtifactCreateInput = {
      user: { connect: { id: subjectUserId } },
      kind: input.kind as ProofKind,
      source: input.source_metadata.source as ProofSource,
      claim_label: input.claim_label,
      claimed_amount:
        input.claimed_amount == null ? null : input.claimed_amount,
      currency: input.currency,
      occurred_at: new Date(input.occurred_at + 'T00:00:00.000Z'),
      source_metadata: input.source_metadata as unknown as Prisma.InputJsonValue,
      user_note: input.user_note ?? null,
    };

    const artifact = await this.prisma.proofArtifact.create({ data });
    await this.audit(artifact.id, actor, ProofAuditAction.submitted, {
      kind: artifact.kind,
      source: artifact.source,
    });
    return artifact;
  }

  // ---- Reviewer actions ----------------------------------------------------

  async signoff(
    artifactId: string,
    reviewer: ActorContext,
    input: SignoffProofInput,
  ): Promise<ProofArtifact> {
    if (reviewer.role !== 'coach' && reviewer.role !== 'admin' && reviewer.role !== 'owner') {
      throw new ForbiddenException('only coach, admin, or owner can sign off');
    }
    const artifact = await this.requireArtifact(artifactId);
    if (artifact.status === ProofStatus.flagged_abuse) {
      throw new BadRequestException(
        'cannot sign off on an artifact flagged for abuse — clear the flag first',
      );
    }

    const auditAction: ProofAuditAction =
      input.decision === ProofStatus.coach_signed_off
        ? ProofAuditAction.coach_signoff
        : input.decision === ProofStatus.coach_rejected
          ? ProofAuditAction.coach_rejection
          : input.decision === ProofStatus.admin_reviewed
            ? ProofAuditAction.admin_review
            : ProofAuditAction.dispute_opened;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.proofSignoff.create({
        data: {
          artifact_id: artifact.id,
          reviewer_id: reviewer.user_id,
          reviewer_role: reviewer.role,
          decision: input.decision as ProofStatus,
          note: input.note ?? null,
        },
      });

      return tx.proofArtifact.update({
        where: { id: artifact.id },
        data: {
          status: input.decision as ProofStatus,
          reviewer_id: reviewer.user_id,
          reviewed_at: new Date(),
          dispute_reason:
            input.decision === ProofStatus.disputed ? input.reason ?? null : null,
        },
      });
    });

    await this.audit(updated.id, reviewer, auditAction, {
      decision: input.decision,
    });
    return updated;
  }

  async flagAbuse(
    artifactId: string,
    actor: ActorContext,
    input: AbuseFlagInput,
  ): Promise<ProofArtifact> {
    if (actor.role !== 'coach' && actor.role !== 'admin' && actor.role !== 'owner') {
      throw new ForbiddenException('only coach, admin, or owner can flag abuse');
    }
    await this.requireArtifact(artifactId);

    const updated = await this.prisma.proofArtifact.update({
      where: { id: artifactId },
      data: {
        status: ProofStatus.flagged_abuse,
        abuse_flag_reason: input.reason,
      },
    });
    await this.audit(updated.id, actor, ProofAuditAction.abuse_flag_raised, {
      reason: input.reason,
    });
    return updated;
  }

  async clearAbuseFlag(
    artifactId: string,
    actor: ActorContext,
    targetStatus: ProofStatus = ProofStatus.pending_review,
  ): Promise<ProofArtifact> {
    if (actor.role !== 'admin' && actor.role !== 'owner') {
      throw new ForbiddenException('only admin or owner can clear an abuse flag');
    }
    if (
      targetStatus !== ProofStatus.pending_review &&
      targetStatus !== ProofStatus.coach_signed_off &&
      targetStatus !== ProofStatus.admin_reviewed
    ) {
      throw new BadRequestException(
        'targetStatus must be pending_review, coach_signed_off, or admin_reviewed',
      );
    }
    const artifact = await this.requireArtifact(artifactId);
    if (artifact.status !== ProofStatus.flagged_abuse) {
      throw new BadRequestException('artifact is not currently flagged for abuse');
    }

    const updated = await this.prisma.proofArtifact.update({
      where: { id: artifactId },
      data: {
        status: targetStatus,
        abuse_flag_reason: null,
      },
    });
    await this.audit(updated.id, actor, ProofAuditAction.abuse_flag_cleared, {
      target_status: targetStatus,
    });
    return updated;
  }

  // ---- Amount corrections --------------------------------------------------

  async correctAmount(
    artifactId: string,
    actor: ActorContext,
    input: CorrectAmountInput,
  ): Promise<ProofArtifact> {
    if (actor.role !== 'coach' && actor.role !== 'admin' && actor.role !== 'owner') {
      throw new ForbiddenException('only coach, admin, or owner can correct amounts');
    }
    const artifact = await this.requireArtifact(artifactId);
    if (artifact.claimed_amount == null) {
      throw new BadRequestException(
        'cannot correct amount on an artifact that does not carry an amount',
      );
    }
    const previous = artifact.claimed_amount;

    const updated = await this.prisma.proofArtifact.update({
      where: { id: artifactId },
      data: { claimed_amount: input.corrected_amount },
    });
    await this.audit(updated.id, actor, ProofAuditAction.amount_corrected, {
      previous_amount: previous?.toString() ?? null,
      corrected_amount: input.corrected_amount.toString(),
      reason: input.reason,
    });
    return updated;
  }

  // ---- Staleness sweep -----------------------------------------------------

  // Marks artifacts whose `occurred_at` is older than the per-kind threshold
  // as `stale`. Idempotent — already-stale artifacts are left alone.
  // Authoritatively-reviewed artifacts (coach_signed_off / admin_reviewed)
  // are NOT auto-marked stale by this sweep; staleness for those is a
  // signal to the AI flagger, not a status change. The sweep is kept narrow
  // on purpose so it cannot regress a human signoff into `stale`.
  async markStaleArtifacts(now: Date = new Date()): Promise<number> {
    const candidates = await this.prisma.proofArtifact.findMany({
      where: {
        status: { in: [ProofStatus.pending_review] },
      },
      select: { id: true, kind: true, occurred_at: true },
    });

    let marked = 0;
    for (const a of candidates) {
      const thresholdDays = STALENESS_THRESHOLD_DAYS[a.kind] ?? null;
      if (thresholdDays == null) continue;
      const ageDays = Math.floor(
        (now.getTime() - a.occurred_at.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (ageDays <= thresholdDays) continue;

      await this.prisma.proofArtifact.update({
        where: { id: a.id },
        data: { status: ProofStatus.stale, stale_after_days: thresholdDays },
      });
      await this.audit(
        a.id,
        { user_id: 'system', role: 'system' },
        ProofAuditAction.marked_stale,
        { age_days: ageDays, threshold_days: thresholdDays },
      );
      marked += 1;
    }
    return marked;
  }

  // ---- Reads ---------------------------------------------------------------

  async listForUser(userId: string): Promise<ProofArtifact[]> {
    return this.prisma.proofArtifact.findMany({
      where: { user_id: userId },
      orderBy: [{ occurred_at: 'desc' }, { submitted_at: 'desc' }],
    });
  }

  async listForReviewQueue(reviewerId?: string): Promise<ProofArtifact[]> {
    return this.prisma.proofArtifact.findMany({
      where: {
        status: ProofStatus.pending_review,
        ...(reviewerId ? { reviewer_id: reviewerId } : {}),
      },
      orderBy: { submitted_at: 'asc' },
    });
  }

  async getWithTrail(artifactId: string) {
    const artifact = await this.prisma.proofArtifact.findUnique({
      where: { id: artifactId },
      include: {
        signoffs: { orderBy: { created_at: 'asc' } },
        audit_log: { orderBy: { created_at: 'asc' } },
        ai_drafts: { orderBy: { created_at: 'desc' } },
      },
    });
    if (!artifact) {
      throw new NotFoundException('proof artifact not found');
    }
    return artifact;
  }

  // ---- Internal ------------------------------------------------------------

  private async requireArtifact(id: string): Promise<ProofArtifact> {
    const a = await this.prisma.proofArtifact.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('proof artifact not found');
    return a;
  }

  // Audit logger. Public so the AI service can write its own
  // `ai_draft_generated` / `ai_draft_dismissed` events without bypassing the
  // shared write path.
  async audit(
    artifactId: string,
    actor: ActorContext,
    action: ProofAuditAction,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.proofAuditLog.create({
        data: {
          artifact_id: artifactId,
          actor_id:
            actor.role === 'system' || actor.role === 'ai' ? null : actor.user_id,
          actor_role: actor.role,
          action,
          detail: (detail ?? null) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Audit writes are best-effort: a failed audit row must not bubble up
      // and undo the action it was meant to record. Logged for ops review.
      this.logger.error(
        `failed to write proof audit log for artifact=${artifactId} action=${action}`,
        err as Error,
      );
    }
  }
}
