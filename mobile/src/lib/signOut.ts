// Central sign-out helper — every "Log out" code path in the app must go
// through this so no store holds the previous user's data. Historically each
// Zustand store kept its own cache (networth, accounts, chat, milestones,
// priority, profile, whatif, eod, coach) and none of them were reset on logout,
// which leaked the previous user's data onto shared devices. Every store now
// exposes a `reset()`; this fan-out calls all of them plus the auth logout.

import { secureStorage } from './secureStorage';
import { useAuthStore } from '../stores/authStore';
import { useAccountsStore } from '../stores/accountsStore';
import { useChatStore } from '../stores/chatStore';
import { useCoachStore } from '../stores/coachStore';
import { useEODStore } from '../stores/eodStore';
import { useMilestonesStore } from '../stores/milestonesStore';
import { useNetWorthStore } from '../stores/networthStore';
import { usePriorityStore } from '../stores/priorityStore';
import { useProfileStore } from '../stores/profileStore';
import { useWhatIfStore } from '../stores/whatifStore';
import { reset as analyticsReset } from './analytics';

export async function signOut(): Promise<void> {
  // Kick off the API-side logout. The auth store owns the network call + token
  // cleanup (including SecureStore wipe). Swallow errors — signing out locally
  // should never be blocked by a backend hiccup.
  try {
    await useAuthStore.getState().logout();
  } catch {
    // best-effort: we still reset state below
  }

  // Belt-and-suspenders: clear any leftover quiz/token state in case logout()
  // did not run to completion.
  try {
    await secureStorage.removeItem('auth_token');
  } catch {
    // ignore
  }

  // Reset analytics identity so the next session starts clean
  analyticsReset();

  // Reset every slice of client state so no previous-user data lingers.
  useAuthStore.getState().reset();
  useAccountsStore.getState().reset();
  useChatStore.getState().reset();
  useCoachStore.getState().reset();
  useEODStore.getState().reset();
  useMilestonesStore.getState().reset();
  useNetWorthStore.getState().reset();
  usePriorityStore.getState().reset();
  useProfileStore.getState().reset();
  useWhatIfStore.getState().reset();
}
