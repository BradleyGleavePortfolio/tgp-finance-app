// Simple event emitter for auth state changes.
//
// Lets the api.ts axios layer signal a forced sign-out without importing the
// authStore directly (which would create a circular dependency:
//   api.ts -> signOut.ts -> authStore.ts -> api.ts).
//
// RootNavigator subscribes once at mount and runs the central signOut helper
// when the 'logout' event fires. Screens can subscribe to the same events for
// e.g. invalidating local state after a forced logout.

type AuthListener = () => void;

let listeners: AuthListener[] = [];
const namedListeners: Record<string, AuthListener[]> = {};

export const authEvents = {
  onAuthChange: (fn: AuthListener) => {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },
  on: (event: string, fn: AuthListener) => {
    if (!namedListeners[event]) namedListeners[event] = [];
    namedListeners[event].push(fn);
    return () => {
      namedListeners[event] = (namedListeners[event] || []).filter((l) => l !== fn);
    };
  },
  off: (event: string, fn: AuthListener) => {
    if (!namedListeners[event]) return;
    namedListeners[event] = namedListeners[event].filter((l) => l !== fn);
  },
  emit: (event?: string) => {
    listeners.forEach((fn) => fn());
    if (event && namedListeners[event]) {
      namedListeners[event].forEach((fn) => fn());
    }
  },
};
