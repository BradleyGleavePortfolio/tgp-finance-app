// identityTitle — UX Psychology Report #3: Identity Reinforcement
// Pure resolver that maps user context → motivational identity title.
//
// Inputs:
//   primaryGoal      — user's declared primary goal string (from FinancialProfile.primary_goal)
//   weeksSinceJoin   — how many weeks have passed since the user joined
//   isOnTrack        — whether the user's current priority is on track (heroStatus === 'on_track')
//   isFoundingMember — whether the user is a founding member (rank ≤ 1000)
//
// Doctrine: streaks are not part of the data model, so the resolver no longer
// reads a streak signal. "Day-One Founder" now keys on `isOnTrack` only.
//
// Returns one of five identity titles (string).

export type IdentityTitleInput = {
  primaryGoal?: string | null;
  weeksSinceJoin?: number | null;
  isOnTrack?: boolean;
  isFoundingMember?: boolean;
};

/**
 * Title resolution priority (first match wins):
 * 1. "Day-One Founder"  — founding member AND on track
 * 2. "Comeback Saver"   — joined more than 2 weeks ago (returned after a gap)
 * 3. "The Debt Plan"    — primary goal contains "debt" or "payoff"
 * 4. "Future Builder"   — primary goal contains "sav" | "invest" | "build" | "wealth"
 * 5. "Money Architect"  — default fallback
 */
export function resolveIdentityTitle(input: IdentityTitleInput): string {
  const {
    primaryGoal = '',
    weeksSinceJoin = 0,
    isOnTrack = false,
    isFoundingMember = false,
  } = input;

  const goal = (primaryGoal ?? '').toLowerCase();
  const safeWeeks = weeksSinceJoin ?? 0;

  // 1. Day-One Founder — founding member who is still on track
  if (isFoundingMember && isOnTrack) {
    return 'Day-One Founder';
  }

  // 2. Comeback Saver — joined more than 2 weeks ago and not currently on track
  if (safeWeeks > 2 && !isOnTrack) {
    return 'Comeback Saver';
  }

  // 3. The Debt Plan — debt payoff goal
  if (goal.includes('debt') || goal.includes('payoff') || goal.includes('pay off')) {
    return 'The Debt Plan';
  }

  // 4. Future Builder — savings / invest / wealth-building goal
  if (
    goal.includes('sav') ||
    goal.includes('invest') ||
    goal.includes('build') ||
    goal.includes('wealth')
  ) {
    return 'Future Builder';
  }

  // 5. Default
  return 'Money Architect';
}
