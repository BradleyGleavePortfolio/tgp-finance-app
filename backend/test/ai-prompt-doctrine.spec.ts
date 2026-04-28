import { buildFinanceCoachSystemPrompt } from '../src/ai/ai.service';

describe('buildFinanceCoachSystemPrompt — quiet-luxury doctrine', () => {
  const context = {
    profile: { name: 'A', primary_goal: 'reduce debt' },
    financials: { net_worth: 100, total_debt: 0, total_assets: 100 },
  };

  // Regex covers the BMP emoji blocks plus the supplementary planes commonly
  // used for finance/coaching glyphs. Keep this in lockstep with
  // mobile/DESIGN.md §2 — emoji must not appear in any user-facing surface,
  // and the system prompt is the closest backend gets to one.
  const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

  it('contains no emoji in the system prompt', () => {
    const prompt = buildFinanceCoachSystemPrompt(context);
    expect(EMOJI_RE.test(prompt)).toBe(false);
  });

  it('does not use the legacy gendered audience framing or hype', () => {
    const prompt = buildFinanceCoachSystemPrompt(context);

    // The previous prompt opened with "ambitious men in their 20s and 30s"
    // and described the assistant as "FP — high-performance business
    // coach". The rewrite removes both the audience framing and the
    // persona label. We assert on the opening sentence only — the rule
    // block elsewhere may reference these phrases as forbidden examples.
    const openingLine = prompt.split('\n').find((l) => l.trim().length > 0) || '';
    expect(openingLine).not.toMatch(/FP\b/);
    expect(openingLine).not.toMatch(/ambitious/i);
    expect(openingLine).not.toMatch(/high[- ]performance/i);

    // 15 few-shot example dialogues are gone — the rewrite uses five
    // short illustrative replies, not a sales-funnel demonstration set.
    expect(prompt).not.toMatch(/15 FEW-SHOT/);
  });

  it('embeds explicit voice rules that match the design doctrine', () => {
    const prompt = buildFinanceCoachSystemPrompt(context);

    expect(prompt).toMatch(/declarative/i);
    expect(prompt).toMatch(/no hype/i);
    expect(prompt).toMatch(/no emoji/i);
    expect(prompt).toMatch(/general education/i);
    expect(prompt).toMatch(/fee-only fiduciary/i);
  });

  it('serialises the user context block so the model can read it', () => {
    const prompt = buildFinanceCoachSystemPrompt(context);
    expect(prompt).toContain('reduce debt');
    expect(prompt).toContain('USER CONTEXT');
  });
});
