// identityTitle — UX Psychology Report #3: Identity Reinforcement
// Pure resolver that maps user context → motivational identity title.
//
// Inputs:
//   primaryGoal    — user's declared primary goal string (from FinancialProfile.primary_goal)
//   streak         — current EOD streak in days
//   weeksSinceJoin — how many weeks have passed since the user joined
//   isOnTrack      — whether the user's current priority is on track (heroStatus === 'on_track')
//   isFoundingMember — whether the user is a founding member (rank ≤ 1000)
//
// Returns one of five identity titles (string).

export type IdentityTitleInput = {
  primaryGoal?: string | null;
  streak?: number | null;
  weeksSinceJoin?: number | null;
  isOnTrack?: boolean;
  isFoundingMember?: boolean;
};

/**
 * Title resolution priority (first match wins):
 * 1. "Day-One Founder"  — founding member AND active (streak ≥ 1 or isOnTrack)
 * 2. "Comeback Saver"   — joined more than 2 weeks ago but streak reset to 0 or 1
 *                         (returned after a gap)
 * 3. "Debt Crusher"     — primary goal contains "debt" or "payoff"
 * 4. "Future Builder"   — primary goal contains "sav" | "invest" | "build" | "wealth"
 * 5. "Money Architect"  — default fallback
 */
export function resolveIdentityTitle(input: IdentityTitleInput): string {
  const {
    primaryGoal = '',
    streak = 0,
    weeksSinceJoin = 0,
    isOnTrack = false,
    isFoundingMember = false,
  } = input;

  const goal = (primaryGoal ?? '').toLowerCase();
  const safeStreak = streak ?? 0;
  const safeWeeks = weeksSinceJoin ?? 0;

  // 1. Day-One Founder — founding member who is still engaged
  if (isFoundingMember && (safeStreak >= 1 || isOnTrack)) {
    return 'Day-One Founder';
  }

  // 2. Comeback Saver — joined more than 2 weeks ago, streak is 0 or 1
  //    (indicates a gap followed by a return)
  if (safeWeeks > 2 && safeStreak <= 1) {
    return 'Comeback Saver';
  }

  // 3. Debt Crusher — debt payoff goal
  if (goal.includes('debt') || goal.includes('payoff') || goal.includes('pay off')) {
    return 'Debt Crusher';
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
