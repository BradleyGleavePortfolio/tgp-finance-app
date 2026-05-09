import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AIIntent } from './ai-intent';

export interface CacheLookupResult {
  response_text: string;
  model: string;
  source: 'exact' | 'recent';
}

/**
 * Server-side last-known-good cache for AI responses. Read by
 * AICircuitBreakerService when the breaker is OPEN; written on every
 * successful upstream response (fire-and-forget, never blocks the hot path).
 *
 * Read-path priority:
 *   1) (intent, context_hash) exact hit  — same input we've seen before
 *   2) (intent, last_used_at desc)       — most recent good response for
 *                                          the intent, even if context differs
 *   3) caller falls through to AI_FALLBACK_RESPONSES
 *
 * The exact-hit path is preferred because it tends to be on-topic. The
 * "most recent for intent" fallback is preferred over the static string
 * because it was at least produced by the real model recently.
 *
 * Hashing is intentionally one-way (sha256). The cache stores the raw
 * response_text so we can replay it, but never the input that produced it.
 * This keeps the cache out of the per-user PII surface — two users with
 * different incomes asking the same generic question hit the same row.
 */
@Injectable()
export class AIResponseCacheService {
  private readonly logger = new Logger(AIResponseCacheService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a deterministic context hash. Inputs are JSON-canonicalised — keys
   * sorted, whitespace stripped — so semantically-equal contexts collide on
   * the same hash regardless of object key order.
   */
  hashContext(parts: Record<string, unknown>): string {
    const canonical = canonicalJson(parts);
    return createHash('sha256').update(canonical).digest('hex');
  }

  async lookup(intent: AIIntent, contextHash: string): Promise<CacheLookupResult | null> {
    // Try exact match first.
    const exact = await this.prisma.aiResponseCache.findUnique({
      where: { intent_context_hash: { intent, context_hash: contextHash } },
    });
    if (exact) {
      // Touch last_used_at so the recent-fallback ordering reflects active rows.
      // Fire-and-forget — the read path must not block on this.
      this.touch(exact.id).catch((err) => {
        this.logger.warn(`cache touch failed for ${exact.id}: ${err?.message ?? err}`);
      });
      return {
        response_text: exact.response_text,
        model: exact.model,
        source: 'exact',
      };
    }

    // Fall back to the most recent successful response for this intent.
    const recent = await this.prisma.aiResponseCache.findFirst({
      where: { intent },
      orderBy: { last_used_at: 'desc' },
    });
    if (recent) {
      return {
        response_text: recent.response_text,
        model: recent.model,
        source: 'recent',
      };
    }
    return null;
  }

  /**
   * Persist a successful upstream response. Called fire-and-forget by the
   * breaker — errors are logged at warn level and never propagate.
   *
   * Uses upsert because two concurrent requests for the same context_hash
   * would otherwise race the unique index and one would 23505. Upsert turns
   * that race into a harmless last-write-wins.
   */
  async store(intent: AIIntent, contextHash: string, responseText: string, model: string): Promise<void> {
    try {
      const now = new Date();
      await this.prisma.aiResponseCache.upsert({
        where: { intent_context_hash: { intent, context_hash: contextHash } },
        update: { response_text: responseText, model, last_used_at: now },
        create: {
          intent,
          context_hash: contextHash,
          response_text: responseText,
          model,
          last_used_at: now,
        },
      });
    } catch (err) {
      this.logger.warn(
        `ai_response_cache store failed for intent=${intent}: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  private async touch(id: string): Promise<void> {
    await this.prisma.aiResponseCache.update({
      where: { id },
      data: { last_used_at: new Date() },
    });
  }
}

/**
 * Canonical JSON: keys sorted recursively. We use this rather than a third-
 * party canonicaliser because the surface is small (plain objects, strings,
 * numbers, booleans, null, arrays) and the dependency would be noise.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') +
    '}'
  );
}
