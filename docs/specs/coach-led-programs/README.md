# Coach-Led Finance Programs — Spec Set

Draft / unmerged specifications for a coach-expansion suite on
The Growth Project: Finance — finance challenges, coach-led
regimens, content boards, opt-in leaderboards, profile avatars,
messaging extensions, entitlement tiers, and the consumer-finance
compliance boundary.

**No runtime code changes** in this spec PR. These documents are
the contract for the implementing PRs that follow. The
`README.md` §"Documentation rule — every PR updates a README"
gate applies: implementing PRs that diverge from these specs
require a same-PR amendment here.

## Read order

1. [`00-overview.md`](./00-overview.md) — why, when, where, who,
   what, how. The map. Read this first.
2. [`08-entitlements.md`](./08-entitlements.md) — the L1/L2/L3
   model + coach tiers. Every other doc cites this; read it
   second.
3. [`05-regimens.md`](./05-regimens.md) — multi-phase finance
   programs.
4. [`01-challenges.md`](./01-challenges.md) — savings / spending /
   debt-payoff challenges.
5. [`02-leaderboards.md`](./02-leaderboards.md) — opt-in,
   balance-redacted, coach-scoped boards.
6. [`04-content-boards.md`](./04-content-boards.md) — coach
   content board (PDFs, newsletters, videos, links).
7. [`03-profile-avatars.md`](./03-profile-avatars.md) — profile
   images.
8. [`07-messaging-progress.md`](./07-messaging-progress.md) —
   messaging extensions + the coach progress surface.
9. [`06-assignments.md`](./06-assignments.md) — the shared
   assignment contract across the three artefact-bearing modules.
10. [`09-compliance.md`](./09-compliance.md) — disclaimer, URL
    allowlist, outcome-guarantee filter, moderation. **Gates the
    spec PR's merge.**
11. [`10-rollout-and-ops.md`](./10-rollout-and-ops.md) — flags,
    cohorts, kill-switches, operator handoff.

## What this spec set deliberately does not do

- It is **not** a port of the fitness app's coach-expansion
  surface. See `00-overview.md` §1 ("Why not just port the
  fitness implementation").
- It does **not** modify any runtime code in this repo. Schema
  sketches, API tables, and DTO snippets are illustrative; the
  implementing PRs land them.
- It does **not** modify a `new-website/` surface. (None exists
  in this repo at the time of writing.)
- It does **not** propose a public web profile for coaches or
  clients. See `00-overview.md` §7.4.

## What every spec answers

The required structural sections are listed in `00-overview.md`
§4.1. Reviewers tick them when reading.
