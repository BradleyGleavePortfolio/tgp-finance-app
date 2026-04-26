// Supabase client configuration for The Growth Project: Finance
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { secureStorage } from '../lib/secureStorage';

// Required so the OAuth WebBrowser session can complete and dismiss when
// Google redirects back to our deep link. Safe to call at module load.
WebBrowser.maybeCompleteAuthSession();

// SECURITY: previously these fell back to a hardcoded Supabase project URL + anon key,
// which meant every debug/preview build pointed at the production project by default.
// Require the env vars — fail loudly at module load if either is missing.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set. ' +
      'Add them to mobile/.env (or your Expo config) before running the app.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Tokens go to the OS keychain via expo-secure-store on native, with
    // AsyncStorage fallback on web (see lib/secureStorage.ts).
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Drive a native Google OAuth round-trip via Supabase.
 *
 * Returns the Google `provider_token` (Google access token) plus optional
 * `id_token` parsed from the redirect URL fragment. The caller is responsible
 * for trading these for a backend-issued JWT (see authStore.loginWithGoogle).
 *
 * Flow:
 *   1. Ask Supabase for a Google authorization URL (`skipBrowserRedirect`
 *      because RN has no `window.location.assign`).
 *   2. Open Google in an in-app browser bound to our deep-link scheme.
 *      `expo-web-browser` closes itself when Google redirects back.
 *   3. Parse `provider_token` + `provider_id_token` (or `id_token`) out of the
 *      URL fragment Supabase appends.
 *
 * Returns `null` if the user cancelled. Throws on any other failure.
 */
export async function getGoogleOAuthTokens(): Promise<
  { access_token: string; id_token?: string } | null
> {
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'email profile',
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No authorization URL returned from Supabase');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    showInRecents: true,
  });

  if (result.type !== 'success' || !result.url) {
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return null;
    }
    throw new Error(`Google sign-in did not complete (${result.type})`);
  }

  // Supabase implicit OAuth returns tokens in the URL fragment (#access_token=…)
  const fragmentIndex = result.url.indexOf('#');
  if (fragmentIndex === -1) {
    throw new Error('OAuth callback URL missing token fragment');
  }
  const fragment = result.url.slice(fragmentIndex + 1);
  const params = new URLSearchParams(fragment);
  // `provider_token` = Google access token (used as fallback by backend)
  // `provider_id_token` = Google ID token (preferred — backend verifies via
  // supabase.auth.signInWithIdToken). Some providers/proxies surface it as
  // plain `id_token`; accept either.
  const access_token = params.get('provider_token') || params.get('access_token');
  const id_token = params.get('provider_id_token') || params.get('id_token') || undefined;

  if (!access_token) {
    const errMsg = params.get('error_description') || params.get('error') || 'Missing tokens in callback';
    throw new Error(errMsg);
  }

  return { access_token, id_token };
}

/**
 * @deprecated Prefer `useAuthStore().loginWithGoogle()` which threads the
 * resulting tokens through our backend `/auth/google` endpoint and hydrates
 * the auth store. Kept only so callers don't break at type-check time.
 */
export async function signInWithGoogle(): Promise<void> {
  await getGoogleOAuthTokens();
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'tgp-finance://auth/reset-password',
  });
  if (error) throw error;
}
