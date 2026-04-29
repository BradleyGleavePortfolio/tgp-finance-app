// UX Psychology Report #4: Preference-Controlled Personalization
// Fetch, cache, and mutate user preferences with optimistic updates.
import { useCallback, useEffect, useRef, useState } from 'react';
import { preferencesApi } from '../services/api';
import { UserPreferences, DEFAULT_PREFERENCES } from '../types/preferences';

interface UsePreferencesResult {
  prefs: UserPreferences;
  isLoading: boolean;
  error: string | null;
  update: (patch: Partial<UserPreferences>) => Promise<void>;
  refresh: () => Promise<void>;
}

// Module-level cache so prefs are shared across screens without a full store
let _cache: UserPreferences | null = null;
let _inflightPromise: Promise<UserPreferences> | null = null;

// The preferences endpoint may return either a flat payload or a `{ data }`
// envelope. Narrow to the flat shape before spreading into DEFAULT_PREFERENCES.
function unwrapPrefsBody(
  body: import('../services/api').PreferencesResponseBody,
): Partial<UserPreferences> {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: Partial<UserPreferences> }).data ?? {};
  }
  return body ?? {};
}

async function fetchFromServer(): Promise<UserPreferences> {
  if (_inflightPromise) return _inflightPromise;
  _inflightPromise = preferencesApi
    .get()
    .then((r) => {
      const merged: UserPreferences = { ...DEFAULT_PREFERENCES, ...unwrapPrefsBody(r.data) };
      _cache = merged;
      return merged;
    })
    .finally(() => {
      _inflightPromise = null;
    });
  return _inflightPromise;
}

export function usePreferences(): UsePreferencesResult {
  const [prefs, setPrefs] = useState<UserPreferences>(_cache ?? DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(!_cache);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchFromServer();
      if (mounted.current) setPrefs(data);
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Failed to load preferences');
      }
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Use cached value immediately if available, but still refresh in background
    if (_cache) {
      setPrefs(_cache);
      setIsLoading(false);
    } else {
      load();
    }
  }, [load]);

  const update = useCallback(async (patch: Partial<UserPreferences>) => {
    // Optimistic update
    const prev = prefs;
    const next = { ...prev, ...patch };
    setPrefs(next);
    _cache = next;
    try {
      const r = await preferencesApi.patch(patch);
      const merged: UserPreferences = { ...DEFAULT_PREFERENCES, ...unwrapPrefsBody(r.data) };
      _cache = merged;
      if (mounted.current) setPrefs(merged);
    } catch (e) {
      // Rollback on failure
      _cache = prev;
      if (mounted.current) {
        setPrefs(prev);
        setError(e instanceof Error ? e.message : 'Failed to save preference');
      }
    }
  }, [prefs]);

  const refresh = useCallback(async () => {
    _cache = null;
    await load();
  }, [load]);

  return { prefs, isLoading, error, update, refresh };
}
