// Single-flight refresh coordinator.
//
// Problem this solves: when N requests hit 401 simultaneously (e.g. the
// dashboard parallel-loads accounts + networth + milestones + priorities),
// a bare `isRefreshing` flag lets only the first trigger a refresh — the
// rest fall through to the logout path. This helper ensures exactly one
// refresh call is in flight; other callers await the same promise.
//
// Backported verbatim from growth-project-mobile (fitness app) where it
// has been in production since the security/critical-fixes-round-1 series.
//
// Mirror of the implementation under api.ts; kept here for unit testability
// and to avoid circular imports with the axios instance.

type RefreshFn = () => Promise<string>;

let refreshPromise: Promise<string> | null = null;

export function coalesceRefresh(run: RefreshFn): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = run().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

// Test-only: reset internal state between tests.
export function __resetRefreshQueueForTests(): void {
  refreshPromise = null;
}
