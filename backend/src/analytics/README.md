# Analytics

Thin wrapper around `posthog-node`. Provides a fire-and-forget
`capture(userId, event, props)` and `identify(userId, traits)` API.

## Files

- `analytics.service.ts` — initializes the PostHog client, exposes
  `capture` / `identify`. Best-effort: every method swallows failures
  so a transient PostHog outage cannot break a user-facing request.
- `analytics.module.ts` — global module so any service can inject
  `AnalyticsService`.

## Conventions

- Call sites wrap analytics in `try/catch`. The service itself also
  swallows failures, so a double-guard is just defense in depth.
- Event names are snake_case. Today's set: `user_registered`,
  `eod_submitted`, `milestone_unlocked`, `priority_levelup`,
  `whatif_run`, `coach_note_created`, plus screen views from the
  mobile client.
- Identify on every login + every role change so funnel analysis sees
  the latest role.

## Security & tenancy

- The client is server-side; the writeable PostHog key never reaches
  the mobile app.
- We never relay PII beyond what's required to identify the user
  (uuid, email-on-register, role). Money values are aggregated to
  `net_worth_bucket` etc. before send when included; raw balances are
  not analytics-safe.

## Environment variables

| Key | Effect |
|-----|--------|
| `POSTHOG_KEY` | Without it, every `capture` / `identify` is a no-op. |
| `POSTHOG_HOST` | Optional; defaults to PostHog Cloud. |

## Failure modes

- Missing key → both methods are no-ops; no warning spam.
- Network error during capture → swallowed; the originating request
  is unaffected.
- Process exits before the in-memory queue flushes → events are
  dropped. Acceptable for product analytics; if/when we ever need
  guaranteed delivery, switch to the batched API with `flush()` on
  shutdown.

## Tests

Adapter-level — there is no logic to unit test beyond "swallowed
failure." End-to-end coverage happens in PostHog itself.

## Operations

- Rotating keys: update env, redeploy. No in-process cache.
- High-cardinality property keys (e.g. raw `account_id`) explode the
  PostHog event schema. Bucket or hash before sending.
