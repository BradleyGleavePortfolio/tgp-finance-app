import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket, ExpoPushReceiptId } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import {
  PushType,
  PushPayload,
  PushSendResult,
  DAILY_DEDUPE_TYPES,
  EVENT_DEDUPE_KEYS,
  PREF_FIELD_BY_TYPE,
} from './push.types';

// Thin wrapper around expo-server-sdk. Responsibilities:
//   * Look up token + preference gate for the target user
//   * Dedupe via PushLog (daily or event-id, depending on type)
//   * Batch into Expo chunks and submit
//   * Poll receipts and prune DeviceNotRegistered tokens
//   * Write an audit row to push_logs for every attempt (sent OR skipped-by-error)
//
// Never throws to the caller — a failed push should NOT take down the hook that
// triggered it (milestone unlock, EOD submit, cron tick). We return a result
// object and log details.
@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);
  private readonly expo: Expo;

  constructor(private readonly prisma: PrismaService) {
    // EXPO_ACCESS_TOKEN is optional — used for enhanced rate limits + push
    // security on paid Expo tiers. The SDK works without it for most apps.
    this.expo = new Expo({
      accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
    });
  }

  /**
   * Send a push to a user, respecting preferences and dedupe.
   * Safe to call from cron handlers, service hooks, and controllers.
   * Never throws.
   */
  async send(
    userId: string,
    type: PushType,
    payload: PushPayload,
    opts: { bypassDedupe?: boolean } = {},
  ): Promise<PushSendResult> {
    try {
      const prefs = await this.prisma.notificationPreferences.findUnique({
        where: { user_id: userId },
      });

      if (!prefs) {
        return { sent: false, reason: 'no_preferences_row' };
      }

      const prefField = PREF_FIELD_BY_TYPE[type];
      if (prefField && (prefs as any)[prefField] === false) {
        return { sent: false, reason: 'preference_off' };
      }

      const token = prefs.expo_push_token;
      if (!token) {
        return { sent: false, reason: 'no_token' };
      }

      if (!Expo.isExpoPushToken(token)) {
        this.logger.warn(`invalid expo token format for user ${userId}; clearing`);
        await this.clearToken(userId);
        return { sent: false, reason: 'invalid_token_format' };
      }

      if (!opts.bypassDedupe && (await this.isDuplicate(userId, type, payload.data))) {
        return { sent: false, reason: 'duplicate' };
      }

      const message: ExpoPushMessage = {
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: 'default',
        priority: 'high',
      };

      const tickets = await this.submitBatched([message]);
      const ticket = tickets[0];

      if (ticket && ticket.status === 'error') {
        const err = ticket.details?.error;
        await this.recordLog(userId, type, payload, `ticket_error:${err ?? ticket.message}`);
        if (err === 'DeviceNotRegistered') {
          await this.clearToken(userId);
        }
        return { sent: false, reason: `ticket_error:${err ?? 'unknown'}` };
      }

      await this.recordLog(userId, type, payload, undefined);

      // Fire-and-forget receipt polling: even a "ok" ticket can resolve to an
      // error receipt a few seconds later (e.g. silently invalidated token).
      // We don't block the caller on it.
      if (ticket && ticket.status === 'ok' && ticket.id) {
        this.pollReceiptSafely(userId, ticket.id).catch(() => undefined);
      }

      return { sent: true };
    } catch (e) {
      this.logger.error(`push.send failed for ${userId}/${type}: ${(e as Error).message}`);
      await this.recordLog(userId, type, payload, `exception:${(e as Error).message}`).catch(
        () => undefined,
      );
      return { sent: false, reason: 'exception' };
    }
  }

  /** Send a batch of messages, respecting Expo's 100-per-request limit. */
  private async submitBatched(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];
    for (const chunk of chunks) {
      const batch = await this.expo.sendPushNotificationsAsync(chunk);
      tickets.push(...batch);
    }
    return tickets;
  }

  /** Delivery-receipt polling. Clears tokens for DeviceNotRegistered. */
  private async pollReceiptSafely(userId: string, ticketId: ExpoPushReceiptId): Promise<void> {
    // Expo recommends waiting ~15 minutes before polling; for our flow we
    // accept best-effort polling at 30s so integration tests can exercise
    // the path. Production behaviour: if receipt isn't ready we just bail
    // and the next send will be best-effort too.
    await new Promise((r) => setTimeout(r, 30_000));
    try {
      const chunks = this.expo.chunkPushNotificationReceiptIds([ticketId]);
      for (const chunk of chunks) {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
        for (const [, receipt] of Object.entries(receipts)) {
          if (receipt.status === 'error') {
            const err = receipt.details?.error;
            this.logger.warn(`receipt error for ${userId}: ${err}`);
            if (err === 'DeviceNotRegistered') {
              await this.clearToken(userId);
            }
          }
        }
      }
    } catch (e) {
      this.logger.warn(`receipt poll failed for ${userId}: ${(e as Error).message}`);
    }
  }

  private async clearToken(userId: string): Promise<void> {
    try {
      await this.prisma.notificationPreferences.update({
        where: { user_id: userId },
        data: { expo_push_token: null },
      });
    } catch (e) {
      this.logger.warn(`failed to clear token for ${userId}: ${(e as Error).message}`);
    }
  }

  private async isDuplicate(
    userId: string,
    type: PushType,
    data: Record<string, unknown> | undefined,
  ): Promise<boolean> {
    if (DAILY_DEDUPE_TYPES.includes(type)) {
      // UTC calendar day — our cron runs hourly UTC so this is consistent.
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const existing = await this.prisma.pushLog.findFirst({
        where: { user_id: userId, type, sent_at: { gte: startOfDay }, error: null },
      });
      return Boolean(existing);
    }

    const eventKey = EVENT_DEDUPE_KEYS[type];
    if (eventKey && data && data[eventKey] !== undefined) {
      // We use Prisma's JSONB path filter via raw string_contains; simple and
      // portable. An ever-increasing `sent_at` comparison isn't needed — once
      // sent for this (user, type, event_id), never send again.
      const existing = await this.prisma.pushLog.findFirst({
        where: {
          user_id: userId,
          type,
          error: null,
          data: { path: [eventKey], equals: data[eventKey] as any },
        },
      });
      return Boolean(existing);
    }

    return false;
  }

  private async recordLog(
    userId: string,
    type: PushType,
    payload: PushPayload,
    error: string | undefined,
  ): Promise<void> {
    await this.prisma.pushLog.create({
      data: {
        user_id: userId,
        type,
        title: payload.title,
        body: payload.body,
        data: (payload.data as any) ?? undefined,
        error: error ?? null,
      },
    });
  }
}
