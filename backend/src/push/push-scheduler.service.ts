import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PushSenderService } from './push-sender.service';
import { PushType } from './push.types';

// Each cron runs hourly in UTC; the handler filters to users whose local time
// sits inside the per-type target window (±30 min). This lets a single cron
// process cover all timezones without spamming off-hours users.
//
// Fly.io note: the NestJS Schedule module runs inside the same Node process
// as the web server. With `min_machines_running = 1` in fly.toml the cron
// fires on the singleton `app` process. If the service ever scales to >1
// machine, move these crons behind a lock (e.g. a `scheduler_leases` table)
// or a dedicated process group. Not required for current deploy footprint.

const WINDOW_MIN = 30; // ±30 min on either side of the target hour

@Injectable()
export class PushSchedulerService {
  private readonly logger = new Logger(PushSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushSender: PushSenderService,
  ) {}

  // ── EOD reminder — target 21:00 user-local (±30 min) ───────────────────
  @Cron(CronExpression.EVERY_HOUR)
  async tickEodReminder(): Promise<void> {
    await this.runForType('eod_reminder', 21, async (profile, _user, localNow) => {
      // Skip if user already logged EOD today (user-local day).
      if (this.loggedTodayLocal(profile, localNow)) return null;
      return {
        title: 'Time for your daily check-in',
        body: 'Drop your balances before bed — streak day ' +
          ((profile.streak_days ?? 0) + 1) +
          ' is waiting.',
        data: { screen: 'EODFlow' },
      };
    });
  }

  // ── Streak at risk — target 19:00 user-local (±30 min) ─────────────────
  @Cron(CronExpression.EVERY_HOUR)
  async tickStreakAtRisk(): Promise<void> {
    await this.runForType('streak_at_risk', 19, async (profile, _user, localNow) => {
      if ((profile.streak_days ?? 0) < 3) return null;
      if (this.loggedTodayLocal(profile, localNow)) return null;
      return {
        title: `${profile.streak_days}-day streak ends today.`,
        body: 'Today’s check-in has not been logged. Two hours remain.',
        data: { screen: 'EODFlow', streak_days: profile.streak_days },
      };
    });
  }

  // ── Future-self letter — target 08:00 user-local (±30 min) ─────────────
  @Cron(CronExpression.EVERY_HOUR)
  async tickFutureSelfLetter(): Promise<void> {
    await this.runForType('future_self_letter', 8, async (profile, user) => {
      // Deliver only when account is at least 90 days old AND a letter exists.
      if (!profile.future_self_letter) return null;
      const ageMs = Date.now() - new Date(user.created_at).getTime();
      const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
      if (ageMs < NINETY_DAYS) return null;
      return {
        title: 'A letter from your past self',
        body: "It's been 90 days. Your past self left you a message.",
        data: { screen: 'FutureSelfLetter', letter: profile.future_self_letter },
      };
    });
  }

  // ── Spending DNA weekly — Sundays 18:00 user-local (±30 min) ───────────
  @Cron(CronExpression.EVERY_HOUR)
  async tickSpendingDna(): Promise<void> {
    await this.runForType('spending_dna', 18, async (_profile, _user, localNow) => {
      if (localNow.getUTCDay() !== 0 /* Sunday in user-local */) return null;
      return {
        title: 'Your weekly Spending DNA is ready',
        body: 'See where the money went — and one lever to pull next week.',
        data: { screen: 'SpendingDNA' },
      };
    });
  }

  // ── Spending DNA stress alert — daily 09:00 user-local (±30 min) ─────────
  // MVP rule: fire when the user has logged 3+ EODs with mood=1 (Stressed)
  // in the last 7 days. Uses the same `spending_dna` push type / preference
  // field (`spending_dna_alerts`) so the user's opt-out covers both.
  // DAILY_DEDUPE_TYPES dedupes this per calendar day, preventing duplicate
  // sends if both this cron and the Sunday cron fire on the same day.
  @Cron(CronExpression.EVERY_HOUR)
  async tickSpendingDnaAlerts(): Promise<void> {
    await this.runForType('spending_dna', 9, async (_profile, user) => {
      // Count stressed EODs (mood = 1) in the last 7 days.
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const stressedCount = await this.prisma.eODSubmission.count({
        where: {
          user_id: user.id,
          mood: 1,
          submission_date: { gte: sevenDaysAgo },
        },
      });
      if (stressedCount < 3) return null;
      return {
        title: 'Your spending pattern looks unusual',
        body: `You've logged ${stressedCount} stressed check-ins this week. See your Spending DNA for patterns.`,
        data: { screen: 'SpendingDNA', trigger: 'stress_pattern', stressed_count: stressedCount },
      };
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────

  /**
   * Generic iteration over opted-in users. Calls `build` with the user's
   * profile + user + localNow, and fires a push if build returns a payload.
   */
  private async runForType(
    type: PushType,
    targetHourLocal: number,
    build: (
      profile: any,
      user: { id: string; created_at: Date },
      localNow: Date,
    ) => Promise<{ title: string; body: string; data?: Record<string, unknown> } | null>,
  ): Promise<void> {
    try {
      // Hot-path: only fetch users who have a token AND preference on.
      // All other types are scoped further in the per-user callbacks.
      const prefFieldByType: Record<string, string> = {
        eod_reminder: 'eod_reminder_enabled',
        streak_at_risk: 'streak_alerts_enabled',
        future_self_letter: 'future_self_letter_enabled',
        spending_dna: 'spending_dna_alerts',
      };
      const prefField = prefFieldByType[type];

      const candidates = await this.prisma.notificationPreferences.findMany({
        where: {
          expo_push_token: { not: null },
          [prefField]: true,
        },
        select: {
          user_id: true,
          timezone: true,
        },
      });

      for (const c of candidates) {
        if (!this.inLocalWindow(c.timezone, targetHourLocal)) continue;

        const [profile, user] = await Promise.all([
          this.prisma.financialProfile.findUnique({ where: { user_id: c.user_id } }),
          this.prisma.user.findUnique({
            where: { id: c.user_id },
            select: { id: true, created_at: true },
          }),
        ]);
        if (!user) continue;

        const localNow = this.localNow(c.timezone);
        const payload = await build(profile ?? ({} as any), user, localNow);
        if (!payload) continue;

        await this.pushSender.send(c.user_id, type, payload);
      }
    } catch (e) {
      this.logger.error(`scheduler tick for ${type} failed: ${(e as Error).message}`);
    }
  }

  /** True if `now` is within ±WINDOW_MIN of `targetHour` in the given tz. */
  private inLocalWindow(tz: string | null | undefined, targetHour: number): boolean {
    const local = this.localNow(tz);
    const localMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const targetMinutes = targetHour * 60;
    return Math.abs(localMinutes - targetMinutes) <= WINDOW_MIN;
  }

  /**
   * Returns a Date whose UTC fields match the given IANA timezone's local
   * wall-clock. We only read getUTCHours/Minutes/Day from the returned value,
   * so treating the shifted Date as if it were UTC is safe here.
   */
  private localNow(tz: string | null | undefined): Date {
    const zone = tz || 'UTC';
    try {
      const now = new Date();
      // Intl gives us the wall-clock in `zone`; we re-assemble into a Date
      // so getUTCHours() etc. return those local components.
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        weekday: 'short',
      }).formatToParts(now);
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
      const hour = get('hour') === 24 ? 0 : get('hour'); // Intl can emit 24 for midnight
      return new Date(
        Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second')),
      );
    } catch {
      return new Date();
    }
  }

  /**
   * True if the user's last EOD falls on their current local calendar day.
   * `last_eod_date` is stored as a DATE — we treat the db-supplied Y/M/D as
   * the user's local day-of-record (matches how EOD writes it).
   */
  private loggedTodayLocal(profile: any, localNow: Date): boolean {
    if (!profile?.last_eod_date) return false;
    const last = new Date(profile.last_eod_date);
    return (
      last.getUTCFullYear() === localNow.getUTCFullYear() &&
      last.getUTCMonth() === localNow.getUTCMonth() &&
      last.getUTCDate() === localNow.getUTCDate()
    );
  }
}
