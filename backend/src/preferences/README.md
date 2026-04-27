# Preferences

UI personalization preferences: home-screen module order,
notification cadence, motivational tone, currency, first day of week.
Stored in `UserPreferences` and surfaced as a single read + partial
patch endpoint.

## Files

- `preferences.controller.ts` — `/users/me/preferences` GET / PATCH.
- `preferences.service.ts` — get-with-default + partial update.
- `dto/update-preferences.dto.ts` — class-validator DTO.
- `preferences.module.ts`.

## Stored fields and defaults

| Field | Default | Allowed values |
|-------|---------|----------------|
| `home_modules` | `["hero","milestone","trustcues","secondary"]` | Module keys; UI ignores unknown. |
| `notification_cadence` | `"weekly"` | `daily`, `weekly`, `off` |
| `motivational_tone` | `"direct"` | `gentle`, `direct`, `drill` |
| `currency` | `"USD"` | `USD`, `EUR`, `GBP`, `CAD`, `AUD` |
| `first_day_of_week` | `1` | `0` (Sun), `1` (Mon), `6` (Sat) |

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/users/me/preferences` | Returns the row, falling back to `DEFAULT_PREFS` for users with no row yet. |
| PATCH | `/users/me/preferences` | Partial update; only the supplied fields are written. |

## Security & tenancy

JWT-gated. Operates on `request.user.id` only. There is no cross-user
preferences view.

## Environment variables

None unique to this module.

## Failure modes

- Unknown enum values are rejected by the DTO at validation time.
- A patch with an unrecognized field is silently ignored — extra keys
  do not error so the mobile app can ship a new preference key
  before the backend migration adds the column.

## Tests

Direct service tests are a near-term TODO. The shape is small and
the read path is mostly a default-merge, so a value-table test would
be enough.

## Operations

- The `currency` field is **display only** — money values flowing
  through the API are always USD. Multi-currency display in the UI
  uses a static conversion table; nothing in the ledger
  re-denominates.
- Adding a new module key: do it on the mobile side first (the home
  screen ignores unknown keys), then add it to the default array
  here so new accounts pick it up automatically.
