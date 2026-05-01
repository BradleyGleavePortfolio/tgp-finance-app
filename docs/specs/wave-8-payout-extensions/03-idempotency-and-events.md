# 03 — Idempotency and event handling

> **Status:** draft, documentation-only.
>
> Every money write is idempotent twice over: once on the inbound
> request (`Idempotency-Key` header from the client), once on the
> outbound (`Idempotency-Key` to Stripe). Stripe webhooks land in an
> inbox; outbound side-effects ride an outbox. This spec defines all
> three.

## 0. Cross-repo dependencies

- Wave 5 (PR #109) declares `idempotency-key` format in the billing
  README. This spec defines the table + guard.
- PR #108 §03 (checkout) is the largest consumer; the runtime PR for
  checkout depends on `PR-W8-1` (idempotency module).

## 1. WHY two layers

A single layer is insufficient.

**Inbound** (client → us). The mobile app may retry a money-writing
request on flaky 4G. Without idempotency, a retry double-charges. We
adopt the standard `Idempotency-Key` HTTP header convention: client
generates a UUIDv4 before the request; same key + same body returns
the original response; same key + different body is an error.

**Outbound** (us → Stripe). Stripe webhooks retry up to three times
on non-2xx. Without idempotency on the *outbound* side, our handler
might call `stripe.refunds.create()` twice. Stripe's own
`Idempotency-Key` header on the outbound call protects us.

**Inbox / outbox**. Stripe webhooks must be processed exactly once
even when Stripe retries. We dedupe by Stripe's `event.id` in an
inbox table. Side-effects scheduled inside a webhook handler ride an
outbox so a transactional outbox pattern guarantees no orphaned
side-effect on a crash.

## 2. Inbound `Idempotency-Key`

### Header convention

```
POST  /api/v1/payouts/...
Headers:
  Authorization: Bearer ...
  Content-Type: application/json
  Idempotency-Key: <UUIDv4>     ← required on every money-writing POST
```

### Guard behaviour

`IdempotencyGuard` runs **before** the controller body executes.

```
on request:
  if no Idempotency-Key header:
    return 400 IDEMPOTENCY_KEY_MISSING

  if not UUIDv4:
    return 400 IDEMPOTENCY_KEY_FORMAT_INVALID

  body_hash = sha256(canonicalise(body))

  row = SELECT * FROM idempotency_keys WHERE key = ? AND user_id = ?
  if row exists:
    if row.body_hash == body_hash:
      return row.recorded_response
    else:
      return 409 IDEMPOTENCY_KEY_REUSE_MISMATCH

  INSERT INTO idempotency_keys (key, user_id, body_hash, status='in_flight', created_at=now())
    on conflict (key, user_id) do nothing returning *

  if no row inserted:  -- another request won the race
    poll the row until status != 'in_flight'  (max 5s)
    return row.recorded_response

  -- proceed to controller
  result = controller.handle(req)

  UPDATE idempotency_keys SET status='completed', recorded_response=result
    WHERE key=? AND user_id=?
  return result
```

The `(key, user_id)` UNIQUE constraint races safely. The 5-second
poll is the longest a request waits on a duplicate; it covers a
slow refund cascade.

### Schema

```
table  idempotency_keys
  id                       uuid          PK
  key                      text          NOT NULL  -- the client's UUIDv4
  user_id                  uuid          NOT NULL  -- scoped per user
  endpoint                 text          NOT NULL  -- e.g. POST /payouts/refunds
  body_hash                text          NOT NULL  -- sha256 hex
  status                   text          'in_flight' | 'completed' | 'errored'
  recorded_response        jsonb         NULL      -- the 200 body to replay
  http_status              int           NULL
  created_at               timestamptz   NOT NULL DEFAULT now()
  completed_at             timestamptz   NULL

  UNIQUE(key, user_id)
```

`recorded_response` excludes `Set-Cookie` and any non-deterministic
headers. The response body is canonicalised before hashing.

### TTL

Keys older than **24 hours** are eligible for sweep by a daily job.
Sweeping removes only `completed` rows; `errored` and `in_flight`
rows are retained for 30 days for forensics. (`in_flight` rows older
than 5 minutes are flipped to `errored` by the same job — that is
the safety net for a crashed request.)

### Required-on endpoints

The `IdempotencyGuard` is mounted on every controller in
`backend/src/payouts/`. The doctrine pin
`payouts-idempotency.spec.ts` asserts every controller has the guard
applied; a controller without it fails CI.

Non-money endpoints in `payouts/` (e.g. `GET /connect/status`)
**also** carry the guard but the guard is permissive on idempotent
HTTP verbs (GET, HEAD, OPTIONS) — the row is not inserted.

## 3. Stripe webhook inbox

### Why an inbox

Stripe webhooks have at-least-once delivery. The same `event.id`
may arrive twice (e.g. our 200 was lost in flight). A naive handler
processes the same event twice → double ledger insertion. The inbox
dedupes on `event.id`.

### Schema

```
table  inbox
  id                       uuid          PK
  source                   text          NOT NULL  -- 'stripe' v1
  event_id                 text          NOT NULL  -- stripe event.id
  event_type               text          NOT NULL  -- e.g. payment_intent.succeeded
  payload_jsonb            jsonb         NOT NULL  -- full event for replay
  received_at              timestamptz   NOT NULL DEFAULT now()
  status                   text          'received' | 'processing' | 'processed' | 'errored'
  processed_at             timestamptz   NULL
  error_message            text          NULL
  attempt_count            int           NOT NULL DEFAULT 0

  UNIQUE(source, event_id)
```

### Handler shape

```
@Post('/webhooks/stripe')
async stripeWebhook(...):
  // 1. Verify signature
  if !stripe.verifySignature(req): return 400

  // 2. Dedupe via inbox
  insertResult = INSERT INTO inbox (source, event_id, event_type, payload_jsonb)
                 VALUES ('stripe', evt.id, evt.type, evt)
                 ON CONFLICT (source, event_id) DO NOTHING
                 RETURNING id, status
  if insertResult is null:
    // already received; check status
    row = SELECT * FROM inbox WHERE source='stripe' AND event_id=?
    if row.status in ('processed','errored'):
      return 200  -- Stripe stops retrying
    if row.status == 'processing':
      return 202  -- ask Stripe to retry; we're working on it

  // 3. Mark processing
  UPDATE inbox SET status='processing', attempt_count=attempt_count+1 WHERE id=?

  try:
    handler = router.routeFor(evt.type)
    handler(evt)  // may write ledger, may schedule outbox rows
    UPDATE inbox SET status='processed', processed_at=now()
    return 200
  catch (err):
    UPDATE inbox SET status='errored', error_message=err.message
    return 500  -- Stripe retries
```

### Subscribed events

| Event | Handler |
|---|---|
| `payment_intent.succeeded` | post checkout ledger entries; transition parent_transaction `pending → posted` |
| `payment_intent.payment_failed` | transition `pending → voided` |
| `charge.refunded` | run refund cascade |
| `charge.dispute.created` | transition `posted → disputed`; chargeback hold |
| `charge.dispute.closed` | transition `disputed → chargeback_lost` or `chargeback_won` |
| `transfer.created` | post `sub_coach_share` ledger pair (Flow B) |
| `transfer.reversed` | reverse the pair |
| `payout.paid` | informational; logs a payout-ledger marker for reconciliation |
| `payout.failed` | OWNER alert |
| `account.updated` | Connect KYC state machine (`01-connect-onboarding.md` §5) |
| `account.application.deauthorized` | Connect dissolution |

Adding a new event subscription is a documentation update +
migration (handler registration is in code but the **list** lives
here).

## 4. Outbox

### Why an outbox

Inside a webhook handler we may need to call Stripe (e.g. to
refund a sibling charge after a dispute). If our process crashes
between the ledger insert and the Stripe call, we leak inconsistent
state. A transactional outbox pattern fixes this:

1. The handler inserts the ledger row(s) **and** an outbox row in
   the same Postgres transaction.
2. A separate `OutboxDrainJob` reads outbox rows in
   `pending` and dispatches them to Stripe.
3. The drain job uses `Idempotency-Key` on the outbound Stripe call
   so a retry is safe.

### Schema

```
table  outbox
  id                       uuid          PK
  task_kind                text          'stripe_refund_create' | 'stripe_transfer_create' | 'stripe_transfer_reversal' | 'email_send' | 'push_notify' | 'audit_emit'
  payload_jsonb            jsonb         NOT NULL
  status                   text          'pending' | 'in_flight' | 'completed' | 'errored'
  attempt_count            int           NOT NULL DEFAULT 0
  next_attempt_at          timestamptz   NOT NULL DEFAULT now()
  last_error               text          NULL
  idempotency_key          text          NOT NULL  -- carried to Stripe
  created_at               timestamptz   NOT NULL DEFAULT now()
  completed_at             timestamptz   NULL

  INDEX (status, next_attempt_at)
```

### Drain semantics

- Backoff: exponential with jitter; max 8 attempts; after 8, status
  `errored` and OWNER queue alert fires.
- Concurrency: the drain job claims rows with `SELECT ... FOR
  UPDATE SKIP LOCKED LIMIT 50`.
- Idempotency on Stripe: the outbox row's `idempotency_key` is
  re-used on every retry — Stripe's idempotency engine ensures the
  side-effect is at-most-once.

## 5. Outbound `Idempotency-Key` to Stripe

The runtime PR's Stripe client wrapper requires an
`Idempotency-Key` parameter on every API call that creates a side
effect (`charges.create`, `refunds.create`, `transfers.create`,
`transfers.createReversal`, etc).

The key is:

- For checkout: the parent_transaction_id of the pending row.
- For refund: the parent_transaction_id of the source + suffix
  `:refund:<refund_id>`.
- For transfer: the parent_transaction_id + suffix `:transfer:<n>`
  (n is the index when multiple transfers per transaction).
- For Connect onboarding link refresh: `<user_id>:onboarding:<rotation_n>`.

A doctrine pin asserts every Stripe-side-effect call site supplies a
key.

## 6. Privacy / security

| Surface | Notes |
|---|---|
| `idempotency_keys.recorded_response` | Carries the 200 body — may include amounts. **Encrypted at rest** by Postgres TDE; not exposed to non-OWNER reads; redacted in PostHog. |
| `inbox.payload_jsonb` | Full Stripe event; includes amounts. Same protection. |
| `outbox.payload_jsonb` | Same. |
| Webhook signature | Verified with `STRIPE_WEBHOOK_SECRET`; any failure returns 400 and is **not** inserted into the inbox. |

A signature failure logs `event_id_redacted: true` plus the IP, and
fires a metrics counter. After **5** signature failures from one IP
in 1 minute, the IP is rate-limited at the WAF (Fly's existing
rate limiter).

## 7. State-transition table — outbox row

| From | To | Trigger |
|---|---|---|
| (none) | `pending` | Handler inserts in same Tx as ledger row. |
| `pending` | `in_flight` | Drain job claims the row (`FOR UPDATE SKIP LOCKED`). |
| `in_flight` | `completed` | Stripe call returns 2xx. |
| `in_flight` | `errored` | Stripe call returns 4xx (validation) or 5xx after max retries. |
| `errored` | `pending` | OWNER admin manual replay. |
| `errored` | (deleted) | OWNER admin manual cancel with reason ≥ 20 chars. |

## 8. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | Client retries with the same key but different body | guard returns 409 | clear error code documented in OpenAPI (`IDEMPOTENCY_KEY_REUSE_MISMATCH`) |
| 2 | Two requests with the same key arrive simultaneously | UNIQUE race; loser polls the winner's row | 5-second poll covers most cases; longer than that returns 504 IDEMPOTENCY_LOCK_TIMEOUT |
| 3 | Stripe webhook signature is invalid | 400 returned, IP rate-limited | logged; OWNER alert on 100+ failures/hr |
| 4 | Stripe replays the same event twice | inbox UNIQUE catches; second handler returns 200 with no-op | idempotency on the side effect (outbox key) covers any work done before the second arrival |
| 5 | Outbox row stuck in `in_flight` due to crashed worker | next drain tick reaps `in_flight` rows older than 60s back to `pending` | reaper logic in the drain job; OWNER alert on > 10 reaped/hr |
| 6 | A handler crashes between ledger insert and outbox insert | impossible — same Tx | the runtime PR enforces a single transaction; CI test asserts via a fault-injection harness |
| 7 | Stripe rejects an outbound `Idempotency-Key` as duplicate but with different params | Stripe returns `idempotency_error` | drain job promotes to `errored`; OWNER queue alert; manual reconcile required |

## 9. Acceptance criteria

- [ ] `idempotency_keys`, `inbox`, `outbox` tables exist with the
  shapes above; migration is additive only.
- [ ] `IdempotencyGuard` is mounted on every controller in
  `payouts/`; doctrine pin asserts.
- [ ] Stripe webhook handler is replay-safe (proven by a test that
  re-fires the same `event.id` and asserts a single ledger row).
- [ ] OutboxDrainJob is in place; backoff config is documented in
  `10-rollout-and-ops.md` §6.
- [ ] No `recorded_response` body is logged in PostHog; doctrine pin
  asserts (greps the analytics service).
- [ ] All five effects in §3.5 are subscribed in the runtime
  `Stripe.Webhook.constructEvent` switch.

## 10. Out-of-scope (explicit)

- Cross-region replication of the inbox/outbox.
- Encrypted-at-application-layer payloads (Postgres TDE only in v1).
- A separate "saga" pattern. The outbox is sufficient for the
  side-effect set we have.
- Lambda-style at-most-once delivery semantics. We are at-least-once
  + idempotent.
