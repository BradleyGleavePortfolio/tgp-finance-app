// Sprint A audit fix CR-3 — client-side messages.
//
// The coach side already has a full read+write surface
// (coach.controller.ts /api/coach/clients/:id/messages). The audit
// found that a coach could send messages but the client had no
// in-app way to read them, and the notification-preferences toggle
// even advertised a feature that did not exist for the client.
//
// This service is the client-side mirror. The thread the client sees
// is the same `thread_key`-grouped CoachMessage rows. The client can
// only see and reply to their own thread (their currently-assigned
// coach), so tenancy is the (clientId, coach_id) link on the User
// row.

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_BODY_LENGTH = 4000;

/**
 * Build a deterministic thread_key for a client/coach pair. Mirrors the
 * helper in coach/coach.service.ts so server-rendered messages line up
 * regardless of which side the read happened on.
 */
function threadKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export interface ThreadMessage {
  id: string;
  body: string;
  from_coach: boolean;
  read_at: Date | null;
  created_at: Date;
}

export interface ThreadResponse {
  thread_key: string | null;
  has_coach: boolean;
  coach_name: string | null;
  messages: ThreadMessage[];
  next_cursor: string | null;
}

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Look up the client's currently-assigned coach. Returns null when
   * the client has no coach yet — caller handles that as a typed
   * empty response rather than 404.
   */
  private async resolveCoach(
    clientId: string,
  ): Promise<{ coach_id: string; coach_name: string } | null> {
    const me = await this.prisma.user.findUnique({
      where: { id: clientId },
      select: {
        coach_id: true,
        coach: { select: { id: true, name: true, role: true } },
      },
    });
    if (!me?.coach || !me.coach_id) return null;
    if (me.coach.role !== 'coach' && me.coach.role !== 'owner') {
      // Defensive: a stale coach_id pointing at a demoted user. Treat
      // as unassigned rather than letting the client message a non-coach.
      return null;
    }
    return { coach_id: me.coach.id, coach_name: me.coach.name };
  }

  /**
   * GET /api/messages — fetch the client's thread with their coach,
   * oldest first, capped at `limit`. Optional `before` cursor (ISO
   * created_at string) lets the mobile app paginate back through
   * older messages.
   *
   * Marks unread inbound messages as read on fetch — same convention
   * the coach side uses on its own thread fetch.
   */
  async getThread(
    clientId: string,
    opts: { limit?: number; before?: string } = {},
  ): Promise<ThreadResponse> {
    const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const coach = await this.resolveCoach(clientId);
    if (!coach) {
      return {
        thread_key: null,
        has_coach: false,
        coach_name: null,
        messages: [],
        next_cursor: null,
      };
    }

    const tk = threadKey(clientId, coach.coach_id);
    const beforeDate = opts.before ? new Date(opts.before) : null;
    const validBefore = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;

    // Fetch up to `limit + 1` so we can compute next_cursor without a
    // second round trip. Order desc to use the (thread_key, created_at)
    // index when paginating "before"; we reverse client-side so the
    // mobile UI receives oldest -> newest.
    const rows = await this.prisma.coachMessage.findMany({
      where: {
        thread_key: tk,
        ...(validBefore ? { created_at: { lt: validBefore } } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    page.reverse();

    const messages: ThreadMessage[] = page.map((m) => ({
      id: m.id,
      body: m.body,
      from_coach: m.sender_id === coach.coach_id,
      read_at: m.read_at,
      created_at: m.created_at,
    }));

    // next_cursor is the oldest created_at the caller has now; passing
    // it back as `before` returns the page just before it.
    const nextCursor = hasMore && page.length > 0 ? page[0].created_at.toISOString() : null;

    // Mark inbound (coach-authored) unread messages as read in this
    // thread. Best effort — we never let a read-mark failure shadow a
    // successful fetch.
    await this.prisma.coachMessage
      .updateMany({
        where: { thread_key: tk, recipient_id: clientId, read_at: null },
        data: { read_at: new Date() },
      })
      .catch(() => undefined);

    return {
      thread_key: tk,
      has_coach: true,
      coach_name: coach.coach_name,
      messages,
      next_cursor: nextCursor,
    };
  }

  /**
   * GET /api/messages/unread-count — drives the tab-bar badge on the
   * mobile app. Returns 0 when the client has no coach.
   */
  async unreadCount(clientId: string): Promise<{ count: number }> {
    const coach = await this.resolveCoach(clientId);
    if (!coach) return { count: 0 };
    const count = await this.prisma.coachMessage.count({
      where: {
        thread_key: threadKey(clientId, coach.coach_id),
        recipient_id: clientId,
        read_at: null,
      },
    });
    return { count };
  }

  /**
   * POST /api/messages — client sends a message to their coach. The
   * coach side sees the message in its existing thread view. Body is
   * trimmed and validated; we return the saved row.
   */
  async send(
    clientId: string,
    rawBody: unknown,
  ): Promise<ThreadMessage> {
    if (typeof rawBody !== 'string') {
      throw new ForbiddenException({
        error: 'Message body must be a string',
        code: 'INVALID_BODY',
      });
    }
    const body = rawBody.trim();
    if (body.length === 0) {
      throw new ForbiddenException({
        error: 'Message body cannot be empty',
        code: 'EMPTY_BODY',
      });
    }
    if (body.length > MAX_BODY_LENGTH) {
      throw new ForbiddenException({
        error: `Message body exceeds the ${MAX_BODY_LENGTH}-character limit`,
        code: 'BODY_TOO_LONG',
      });
    }
    const coach = await this.resolveCoach(clientId);
    if (!coach) {
      throw new NotFoundException({
        error: 'No coach is assigned to your account yet',
        code: 'NO_COACH',
      });
    }
    const row = await this.prisma.coachMessage.create({
      data: {
        thread_key: threadKey(clientId, coach.coach_id),
        sender_id: clientId,
        recipient_id: coach.coach_id,
        body,
      },
    });
    return {
      id: row.id,
      body: row.body,
      from_coach: false,
      read_at: row.read_at,
      created_at: row.created_at,
    };
  }

  /**
   * POST /api/messages/read — explicit mark-as-read sweep. Called by
   * the mobile app on screen focus and after a push notification tap.
   * Idempotent.
   */
  async markRead(clientId: string): Promise<{ marked: number }> {
    const coach = await this.resolveCoach(clientId);
    if (!coach) return { marked: 0 };
    const result = await this.prisma.coachMessage.updateMany({
      where: {
        thread_key: threadKey(clientId, coach.coach_id),
        recipient_id: clientId,
        read_at: null,
      },
      data: { read_at: new Date() },
    });
    return { marked: result.count };
  }
}
