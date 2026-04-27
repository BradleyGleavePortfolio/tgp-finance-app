# Common

Shared building blocks used by every feature module: decorators,
filters, interceptors, validators, and the money-conversion helper.

## Layout

```
common/
  decorators/
    current-user.decorator.ts   @CurrentUser() — pulls the request user
    public.decorator.ts         @Public() — opts a route out of JWT auth
    roles.decorator.ts          @Roles('coach', 'owner', ...)
  filters/
    http-exception.filter.ts    Structured error envelope, no stack traces in prod
  interceptors/
    transform.interceptor.ts    Wraps responses in { data, success, timestamp }
    decimal-to-number.interceptor.ts
                                Converts Prisma.Decimal → Number on outbound
  validators/
    schemas.ts                  Zod schemas shared between mobile and backend
  money.ts                      toN() / toNullableN() — Decimal → Number coercion
```

## Decorators

- **`@Public()`** writes the `isPublic` metadata. The global
  `JwtAuthGuard`, `TenantGuard`, and `ClientCoachLinkedGuard` all
  honor it. Use sparingly — a missing `@Public` is a failure of
  intention, not auth (auth is the default).
- **`@CurrentUser()`** is a parameter decorator that returns the
  hydrated `request.user` (shape defined in `current-user.decorator
  .ts`). Always prefer this over `req.user` casts inside handlers.
- **`@Roles(...)`** writes the `roles` metadata that `RoleGuard`
  reads. OWNER short-circuits to `true` regardless of the listed
  roles, so you don't need to add `'owner'` to every list — it's
  there implicitly.

## Filters / interceptors

- **`HttpExceptionFilter`** — every error response goes through here.
  Serializes to `{ error, code, statusCode }` (no stack trace in
  production). Custom errors thrown anywhere in the codebase that
  follow the `{ error, code }` shape are passed through verbatim.
- **`DecimalToNumberInterceptor`** — runs **before**
  `TransformInterceptor` so the envelope wrap sees plain numbers.
  Walks the response payload and replaces every `Prisma.Decimal`
  with its `.toNumber()` value. Money columns are
  `DECIMAL(14, 2)` ≈ $99T max, well inside JS Number precision
  (2^53 ≈ 9 quadrillion). Lossless. Specifically does not touch
  `Date`, `Buffer`, or any object whose prototype isn't
  `Object.prototype` — those would be mangled by a recursive walk.
- **`TransformInterceptor`** — wraps successful responses in
  `{ data: <body>, success: true, timestamp: <ISO> }`. The mobile
  API client unwraps in its single response interceptor, so
  consumers see the original body.

## Validators

`validators/schemas.ts` exports the Zod schemas shared by the mobile
client (typed off the same imports) and the backend controllers. Add
new schemas here when both ends need the same shape; one-off
backend-only validation can live inline (see `admin.controller.ts`'s
`PromoteSchema`).

## Money helpers

`money.ts` exports two small functions:

```ts
toN(value)         // Prisma.Decimal | number | string | null/undefined → number
toNullableN(value) // same, but returns null for null/undefined
```

Use `toN` whenever you mix Prisma `Decimal` outputs into arithmetic.
The naive code path (`a.balance + 100`) coerces to string and
silently corrupts the result. The reason `toN` exists is to make the
Decimal → Number coercion deliberate and greppable.

## Security & tenancy

The decorators and guards in this folder + `auth/guards/` are the
entire access-control surface. If you find yourself reaching for a
new guard, either extend `OwnsStudentGuard` (for "coach owns target")
or wrap an existing one — don't bypass the global chain.

## Environment variables

None unique to this folder. The interceptors read no config.

## Failure modes

- **`HttpExceptionFilter` swallowing an unexpected error shape** — if
  a service throws a plain `Error` instead of an `HttpException`,
  the filter returns 500 with a generic message. Always throw the
  Nest `HttpException` subclasses (`BadRequestException`,
  `ForbiddenException`, etc.) with the `{ error, code }` payload.
- **`TransformInterceptor` envelope leaking on raw responses** —
  endpoints that need to return a non-JSON response (e.g. file
  download) should return a `StreamableFile` and the interceptor
  passes them through.

## Tests

- `backend/test/transform.interceptor.spec.ts` — envelope shape +
  passthrough for `StreamableFile`.
- `backend/test/decimal-to-number.interceptor.spec.ts` — recursive
  walk + Date / Buffer skip + array handling.
- `backend/test/scope.spec.ts` — `scopeToCoach` (lives in `auth/`
  but is the shared list-query filter).

## Operations

- A change to the response envelope is a contract break with the
  mobile client. `mobile/src/services/api.ts` does the unwrap; both
  sides have to ship together if you ever change the envelope keys.
- Adding a new error code: prefer reusing existing ones
  (`VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`,
  `RATE_LIMITED`, ...). New codes should be added to the mobile
  `services/api.ts` error map so the UI surfaces friendly copy.
