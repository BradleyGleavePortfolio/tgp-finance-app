# Cost of Living

Provides cost-of-living data for the relocation what-if scenarios.
Reads `data/cost_of_living_2026.json` (checked into git as the
fallback) and optionally calls Numbeo's API to keep it fresh.

## Files

- `costliving.controller.ts` — `/api/costliving/*` lookup endpoints.
- `costliving.service.ts` — JSON loader + Numbeo wrapper.
- `costliving.module.ts`.

## Data source order

1. Bundled `data/cost_of_living_2026.json` — always available.
2. Numbeo API — used when `NUMBEO_API_KEY` is set and the bundled
   row is older than the configured staleness window. The API call
   is cached in process and the result is merged over the bundled
   row.

The bundled JSON is the *floor*. We don't delete entries from it —
removing a row would silently drop the relocation scenario for that
location.

## Security & tenancy

Read-only public-ish data. JWT-gated like the rest of the API; no
PII passes through these endpoints.

## Environment variables

| Key | Effect |
|-----|--------|
| `NUMBEO_API_KEY` | Optional. Enables live data overlay. |

## Failure modes

- Missing JSON file → empty array; relocation scenarios degrade to
  base-case projections without country/city deltas. Logs a warning
  on boot.
- Numbeo rate-limit / 5xx → treat as cache miss; bundled row is
  served.

## Operations

- Refresh cadence: the JSON file is the source of truth in production.
  Update it via PR with a fresh export; Numbeo's overlay is for dev
  freshness, not production data integrity.
