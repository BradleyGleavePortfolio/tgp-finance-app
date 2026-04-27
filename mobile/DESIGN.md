# Mobile Design Doctrine — Quiet Luxury

This document is the source of truth for what The Growth Project: Finance
mobile app looks and reads like. It is enforced; deviations are bugs.

It is the next step after the Wave 1–4 luxury rewrites
(`luxury/wave1-subtraction`, `luxury/wave2-design-system`,
`luxury/wave3-hero-rewrite`, `luxury/wave4-copy-pass`). Wave 5 is the
cleanup pass that turns those rewrites into a permanent rule set.

For colour, type, spacing, motion, and shadow tokens, see
`src/theme/tokens.ts`. This document covers the *rules* for using them.

---

## 1. Palette is bone, ink, and oxblood. Nothing else.

The app has three colours that carry meaning:

- `colors.bone` (`#F5EFE4`) — primary background.
- `colors.ink` (`#1A1A18`) — primary type.
- `colors.oxblood` (`#4A0404`) — the single accent. Used for the one
  thing on a screen that should attract the eye.

Supporting neutrals (`cream`, `charcoal`, `stone`, `camel`) exist for
hairlines, secondary surfaces, and meta type. The hero screen may use
`colors.navy` as a background (Wave 3); nothing else does.

`mutedGold` exists for the founding-member badge typography only. It is
never a fill, never a button, never a stroke on a card.

### Forbidden

- Adding any new colour to the palette.
- Re-introducing `accentGold`, `profitGreen`, `debtCrimson`,
  `investmentTeal`, `amberWarning`, or `deepGoldPressed` as semantic
  colours. They remain in `tokens.ts` only as legacy aliases that point
  at `oxblood`; they may not be referenced in new code. Treat any new
  reference to them as a regression.
- Multi-accent UI. A screen has exactly one oxblood accent at a time —
  the one thing the user should look at.
- Gradients, glows, shimmer, neon, or any colour that is not in the
  token file.

If you reach for a second accent, the answer is hierarchy (size,
weight, whitespace) — not a new colour.

---

## 2. No emoji in product surfaces.

Emoji are visual noise borrowed from chat apps. The luxury register has
none of them.

This rule applies to **all** product UI — headings, buttons, empty
states, push titles and bodies, in-app toasts, coach copy, trust
content, role-select, verify-email, mood selector, future-letter,
spending-dna, accountability, community, the chat bubble error path.

What replaces them:

- An eyebrow line (small uppercase Inter caption) above the heading.
- A serif headline.
- One short sentence of body copy.
- The one CTA in oxblood.

For categorical icons (account type, trust pillar), use a single
hairline from `react-native-vector-icons/Ionicons` in `colors.charcoal`
or `colors.stone`. Never a coloured glyph.

### Examples of what is removed

- 🛡 / 👁 / 🔒 / 📅 / 🌍 / 📋 / 📥 / 🗑 / 👤 in Trust Center.
- 📋 / ⚠ / 🚨 / 📚 / 👥 in the Coach tab.
- 🏦 / 💹 / ✅ in the Accounts tab.
- 👨‍💼 in role-select.
- 📧 in verify-email.
- 📬 in future-letter.
- 🧬 in spending-dna.
- 🤝 / 👥 / ✓ in accountability.
- 🔥 / 👏 in community reactions.
- The 1–5 emoji scale in the mood selector (already numeric since
  Wave 1 — keep it numeric).

### One narrowly-scoped exception

`✓` and `✕` and `★` may appear at small sizes inside neutral chips
where they function as glyphs, not decoration (e.g. checkmark on a
completed milestone, dismiss on a pill). They render in `colors.ink` or
`colors.stone`, never in colour.

---

## 3. No placeholders, fakes, lorem, or TODO copy in shipped UI.

Every string the user sees is real, considered, and final.

### Forbidden in committed code

- `TODO`, `FIXME`, `XXX`, `HACK`, `TBD` in source files. Move them to
  the issue tracker. README files describing genuinely unfinished
  modules may use the word `TODO` in prose, but never as a marker
  embedded in code that ships.
- Lorem ipsum, sample text, "Your text here", "Coming soon",
  "Placeholder", or stand-in numbers.
- Hard-coded fake values (e.g. mocked `1234.56` as a UI label) in any
  screen rendered to a real user. Mocks belong in tests and storybook,
  not in app code.
- Dead `console.log`, commented-out blocks, or `// removed` tombstones
  outside of `tokens.ts` (which keeps a documented set for grep
  safety).

`TextInput` `placeholder=` props are not "placeholder copy" in this
doctrine — they are real UX hints and remain. The rule is about
content, not about `placeholder` as an attribute name.

---

## 4. No gamification. Acknowledgement, not applause.

The app does not clap, fire, confetti, or cheer. We are quiet.

- Community wins use a single neutral acknowledgement (`Acknowledge` /
  count). The legacy `fire` and `clap` reaction kinds remain in the
  database for backward compatibility (`backend/prisma/schema.prisma`
  → `ReactionKind`), but the UI only ever sends `fire` as the neutral
  kind under a non-emoji label, and only one count is shown. Schema
  migration is intentionally deferred — the values are inert at the
  surface.
- No streak fireworks, no level-up confetti, no "🎉" toasts. The
  `Milestone Achieved.` push is a period, not an exclamation.
- Mood selector is 1–5 numeric with text labels (`Stressed`, `Neutral`,
  `Okay`, `Good`, `Strong`). It is not faces.

If a future feature needs a celebration, the velvet motion tokens in
`tokens.ts` are the only sanctioned tool — a slow fade-in, not a burst.

---

## 5. Voice — quiet, declarative, editorial.

The register is the same as a private bank statement, not a coaching
funnel.

### Forbidden voice

- Direct-response copy: "build real wealth", "ambitious men in their
  20s and 30s", "are you serious about", "don't miss out", any
  imperative aimed at conversion.
- Hype: "amazing", "incredible", "🚀", em-dash-and-exclamation
  combinations.
- Apology and qualifier hedging: "we're working on", "soon", "for
  now". If a feature isn't ready, ship the empty state with a real
  sentence; otherwise do not surface the feature.

### Preferred voice

- Statement of fact: "Daily check-in. Two minutes." over "Don't break
  your streak — check in now!"
- A complete sentence ending in a period.
- Numbers, not adjectives. "$1,240" over "a meaningful amount".

### Push copy specifically

Push titles are nominal phrases, not commands. Push bodies are one
short sentence, declarative, ending in a period. Never include emoji.

---

## 6. Geometry — nearly square, never round.

- Buttons: `radius.sm` (0).
- Inputs: `radius.md` (2).
- Cards: `radius.lg` (4).
- `radius.pill` (999) is for small status chips and tier badges only —
  never a primary surface, never a CTA.
- Shadow opacity is capped at `0.08`. There is no glow. Shadow colour
  is `colors.ink`, not pure black.

---

## 7. Typography — Cormorant for display, Inter for body, weight 400.

- Display and headings use `typography.families.serif` (Cormorant
  Garamond) at weight `400`. The single biggest amateur tell is a
  bold serif; do not use one.
- Body and UI use `typography.families.regular` / `medium` (Inter).
- Mono is reserved for numeric display (balances, projections).
- Eyebrow lines (small uppercase `caption` / `eyebrow` scale) replace
  emoji as the visual "this is the section" marker.

---

## 8. Motion — velvet, not confetti.

- Default transition is `motion.duration.base` (`400ms`) on the
  decel curve `[0.16, 1, 0.3, 1]`.
- `slow` (`800ms`) for content reveals.
- `deliberate` (`1200ms`) for hero / scene changes.
- No spring physics, no bounce, no shimmer. Those tokens are gone from
  the system.

---

## Enforcement

- New code that adds emoji, gradients, second accents, fake values, or
  `TODO`/`FIXME` markers should fail review on doctrine grounds.
- The legacy colour aliases in `tokens.ts` exist only so historic
  screens compile. New references are not allowed; existing ones are
  paid down screen-by-screen.
- When in doubt, subtract.
