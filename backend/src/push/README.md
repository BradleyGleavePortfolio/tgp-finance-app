# Push

Outbound push notifications via Expo's push service. The module owns
two pieces:

- `PushSenderService` — token lookup, preference gating, dedupe via
  `push_logs`, batched submit through `expo-server-sdk`, receipt
  polling, `DeviceNotRegistered` token pruning.
- `PushSchedulerService` — scheduled cron jobs. Today: the EOD
  reminder cron that respects per-user `NotificationPreferences.timezone`
  and `eod_reminder_time`.

## Files

- `push-sender.service.ts` — never throws. Returns a `PushSendResult`
  describing why each call sent / skipped.
- `push-scheduler.service.ts` — `@Cron(...)` handlers. In-process
  scheduler from `@nestjs/schedule`.
- `push.types.ts` — `PushType`, `PushPayload`, dedupe constants
  (`DAILY_DEDUPE_TYPES`, `EVENT_DEDUPE_KEYS`, `PREF_FIELD_BY_TYPE`).
- `push.module.ts`.

## Push types and dedupe rules

`PushType` is a closed enum and each type has an associated dedupe
strategy plus a `NotificationPreferences` field that gates it:

| Type | Dedupe | Pref field |
|------|--------|------------|
| `eod_reminder` | once per local day per user | `eod_reminder_enabled` |
| `net_worth_milestone` | event-id (`milestone_key`) | `milestone_alerts` |
| `priority_levelup` | event-id (`priority_index`) | `priority_levelup_alerts` |
| `future_self_letter` | once per user (key fixed) | `future_self_letter_enabled` |
| `spending_dna` | once per `month` value | `spending_dna_alerts` |

Daily dedupe checks `push_logs` for any row of the same `type` whose
`sent_at` falls inside the user's local day window. Event dedupe
looks for `data.<key> = <value>` in any prior `push_logs` row of the
same type. The `(user_id, type, sent_at)` index makes both checks
constant-cost.

## Preference gating

Every send checks the corresponding `NotificationPreferences` boolean
before doing anything else. A `false` flag → log a `skipped:
disabled` row to `push_logs` and return — the audit row exists either
way, so a coach asking "did Alice get her reminder yesterday" has a
single table to read.

## Token & receipt handling

- Sender pulls `expo_push_token` from the user's notification prefs
  row. No token → `skipped: no_token`.
- Submits via `expo.sendPushNotificationsAsync` in chunks. Receipts
  are polled with `expo.getPushNotificationReceiptsAsync`.
- A `DeviceNotRegistered` receipt → set the user's
  `expo_push_token = null` so subsequent sends skip cleanly.

## Scheduler

The EOD reminder cron evaluates each user with a stored token + the
toggle on, computes `now-in-their-timezone == reminder_time`, and
fires via `PushSenderService.send`. The dedupe layer is what keeps
the cron safe — running it every minute is fine because daily dedupe
guarantees one send per user per day.

## Single-VM assumption (operational caveat)

The scheduler is in-process. Today we run a single Fly.io VM, so
this is fine. Scaling out to N VMs would fire the cron N times. The
fix is one of:

1. Run the scheduler on a separate "worker" Fly.io machine pinned to
   one instance.
2. Move scheduling to a centralized scheduler (Fly cron, GitHub
   Actions, or a database-backed lock + cron-runner).
3. Add a `pg_advisory_lock` around the cron tick body so only one
   VM owns it at a time.

Pick one before scaling out — until then, the dedupe layer covers
us at the cost of N-1 extra DB lookups per tick.

## Security & tenancy

- The sender is internal — there is no public route to fire a push
  on behalf of another user. Hooks call `pushSender.send(userId,
  type, payload)` directly.
- Push payloads never include monetary amounts beyond the user's own
  values (and only ever in their own notification). The accountability
  partner widget has no push hook by design.

## Environment variables

| Key | Effect |
|-----|--------|
| `EXPO_ACCESS_TOKEN` | Optional. Enables enhanced rate limits + push security on paid Expo tiers. SDK works fine without it for our volume. |

## Failure modes

`PushSenderService` returns a result object instead of throwing:

```ts
{
  sent: boolean,
  reason?: 'no_token' | 'disabled' | 'duplicate' | 'expo_error' | 'invalid_token',
  ticket?: ExpoPushTicket
}
```

A failure during a hook (e.g. milestone unlock during EOD submit)
must never roll back the underlying transaction. Hooks are wrapped in
`.catch(...)` log-and-continue.

## Tests

- `backend/test/push-sender.service.spec.ts` — token gating,
  preference gating, daily dedupe, event dedupe, `DeviceNotRegistered`
  pruning.
- `backend/test/push-scheduler.service.spec.ts` — timezone + reminder-
  time matching, ticking with multiple users.

## Operations

- The `push_logs` table grows append-only. Today we do not prune;
  the `(user_id, type, sent_at)` index keeps lookups cheap. If/when
  the table gets unwieldy, drop rows older than 90 days — dedupe
  windows are all shorter than that.
- Rotating Expo credentials: update `EXPO_ACCESS_TOKEN` and redeploy.
  No in-process cache to flush.
