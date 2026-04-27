# Theme

Tokens, theme provider, and the back-compat surface for Wave 1–4
luxury rewrites.

## Files

- `tokens.ts` — canonical token system: bone/oxblood palette,
  Cormorant + Inter type, low-radius geometry, opacity-capped shadows,
  velvet motion. Source of truth.
- `finance.ts` — re-exports the tokens under the legacy capitalised
  names (`Colors`, `Typography`, `Spacing`, `BorderRadius`) so existing
  screens compile without touching every import. New code prefers the
  lowercase named exports from `tokens.ts`.
- `ThemeProvider.tsx` — runtime provider. The system is a single light
  theme; the provider exists for `StatusBar` and SafeArea wiring.

## Doctrine

The rules for *how* these tokens are applied — palette discipline, no
emoji, no placeholders, no gamification, the voice register, motion,
geometry — live in `mobile/DESIGN.md`. If you are about to add a
colour, an emoji, a TODO marker, or a confetti animation, read that
file first.

The short version:

- One accent per screen, and that accent is `colors.oxblood`.
- Legacy aliases in `tokens.ts` (`accentGold`, `profitGreen`,
  `debtCrimson`, `investmentTeal`, `amberWarning`) are paid-down
  back-compat. They all point at oxblood; they may not be referenced
  in new code.
- No emoji in product surfaces. Eyebrow + serif heading + body + one
  CTA replaces them.
- No `TODO` / `FIXME` / fake values / lorem in shipped UI.
- The `WinReaction.kind` enum (`fire`, `clap`) survives in the
  database for migration safety, but the UI exposes a single neutral
  acknowledgement — never the words "fire" or "clap" and never an
  emoji.
- Voice is editorial and quiet: a bank statement, not a funnel.

## Failure modes

- Importing `Colors.accentGold` in new code — replace with
  `colors.oxblood` and verify against `DESIGN.md` rule 1.
- Coloured glyphs or emoji in any screen listed in `DESIGN.md` §2 —
  replace with an `Ionicons` outline glyph in `colors.charcoal` /
  `colors.stone`, or with an eyebrow caption.
- Raw hex literals in screens. The token file is exhaustive; anything
  not there shouldn't be on the screen.
