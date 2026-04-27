# Notifications

CRUD over `NotificationPreferences`. The push pipeline (`push/`) is
gated by these flags — every send checks the corresponding boolean
before doing anything else, so flipping a flag here is the canonical
opt-out.

## Files

- `notifications.controller.ts` — `/api/notifications/preferences`
  GET / PUT.
- `notifications.service.ts` — get-or-default + upsert.
- `notifications.module.ts`.

## Stored fields

`NotificationPreferences` carries one row per user keyed by `user_id`:

| Field | Default | Used by |
|-------|---------|---------|
| `eod_reminder_enabled` | `true` | `push.eod_reminder` cron |
| `eod_reminder_time` | `'20:00'` | scheduler match |
| `streak_alerts_enabled` | `true` | `push.streak_at_risk` |
| `milestone_alerts` | `true` | `push.net_worth_milestone` |
| `coach_messages` | `true` | (reserved for messaging push) |
| `red_flag_alerts` | `true` | (reserved for behavioral push) |
| `future_self_letter_enabled` | `true` | `push.future_self_letter` |
| `priority_levelup_alerts` | `true` | `push.priority_levelup` |
| `spending_dna_alerts` | `true` | `push.spending_dna` |
| `timezone` | `'America/Los_Angeles'` | scheduler local-time math |
| `expo_push_token` | null | Expo token; cleared on `DeviceNotRegistered` |

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/notifications/preferences` | Returns the row, defaulting any unset fields to the schema defaults. |
| PUT | `/api/notifications/preferences` | Upserts. Accepts a partial body. |

## Security & tenancy

JWT-gated. Operates on `request.user.id`. The `expo_push_token` field
is set by the mobile app on first foreground after a successful Expo
permission grant.

## Environment variables

None unique to this module.

## Failure modes

- Updating with an invalid timezone string is accepted today; the
  cron's `Intl.DateTimeFormat` invocation will silently fall back to
  UTC, which means the reminder fires at 8pm UTC for any user with a
  bad timezone string. The mobile UI presents a known-good list, so
  this is theoretical.
- `expo_push_token` collisions across users (same device used by two
  accounts) are not deduplicated server-side. The most recent setter
  wins for that device.

## Tests

Push-side specs (`push-sender.service.spec.ts`,
`push-scheduler.service.spec.ts`) exercise these flags as inputs.
Direct tests on the CRUD path are folded into the EOD spec because
the EOD flow updates the row's `last_eod_date` neighbor on
`FinancialProfile`, not here.

## Operations

- A single user can disable every notification by setting all flags
  off; we don't separately surface "do not disturb." Mass-disable
  during incidents: update the column directly with a SQL UPDATE
  rather than rolling a code change.
- Adding a new push type means adding a new flag here, a new entry in
  `push.types.ts::PREF_FIELD_BY_TYPE`, and a Prisma migration adding
  the column with a sensible default. Default to `true` only if the
  push is opt-out by product policy; otherwise default to `false` and
  let the mobile app prompt for opt-in.
