// Sprint A audit fix CR-2 — finance password-reset deep-link handler.
//
// Supabase's resetPasswordForEmail with a custom redirectTo
// (tgp-finance://auth/reset-password) sends the user a recovery email.
// When the user taps the link, the app opens with the recovery URL
// containing the access_token + refresh_token as URL-fragment params
// (Supabase's standard implicit-flow shape: `#access_token=...&
// refresh_token=...&type=recovery&...`).
//
// This screen owns the in-app half of that round trip. It:
//   1. Reads the fragment that the root `_layout.tsx` deep-link handler
//      forwarded to us via expo-router params.
//   2. Calls supabase.auth.setSession({access_token, refresh_token})
//      to attach the recovery session.
//   3. Renders a "set new password" form. On submit it calls
//      supabase.auth.updateUser({password}).
//   4. On success, signs out (so the temporary recovery session does
//      not leak into the regular app shell) and routes back to
//      `/auth/login` with a success banner.
//
// Failure modes:
//   - Fragment missing or malformed -> "This password-reset link is
//     no longer valid" + button back to login.
//   - setSession returns an error -> same copy as above.
//   - updateUser returns an error -> inline error under the input.
//
// The `Alert.alert` pattern used elsewhere in auth is replaced here
// (and in login.tsx for the request side, per audit M-4) with inline
// error text matching the other field-level error pattern in the
// finance auth surface.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { supabase } from '../../src/services/supabase';
import { safeAuthError } from '../../src/lib/authErrors';
import { parseRecoveryFragment } from '../../src/lib/parseRecoveryFragment';

const MIN_PASSWORD_LEN = 8;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string }>();

  const [sessionAttached, setSessionAttached] = useState<'pending' | 'ok' | 'invalid'>('pending');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const tokens = useMemo(() => parseRecoveryFragment(params.url ?? null), [params.url]);

  useEffect(() => {
    let alive = true;
    if (!tokens) {
      setSessionAttached('invalid');
      setTopError(
        'This password-reset link is no longer valid. Request a new one from the login screen.',
      );
      return () => {
        alive = false;
      };
    }
    supabase.auth
      .setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
      .then(({ error }) => {
        if (!alive) return;
        if (error) {
          setSessionAttached('invalid');
          setTopError(
            'This password-reset link is no longer valid. Request a new one from the login screen.',
          );
          return;
        }
        setSessionAttached('ok');
      })
      .catch(() => {
        if (!alive) return;
        setSessionAttached('invalid');
        setTopError(
          'This password-reset link is no longer valid. Request a new one from the login screen.',
        );
      });
    return () => {
      alive = false;
    };
  }, [tokens]);

  const validate = useCallback((): boolean => {
    if (password.length < MIN_PASSWORD_LEN) {
      setFieldError(`Use at least ${MIN_PASSWORD_LEN} characters.`);
      return false;
    }
    if (password !== confirm) {
      setFieldError('Passwords do not match.');
      return false;
    }
    setFieldError(null);
    return true;
  }, [password, confirm]);

  const handleSubmit = useCallback(async () => {
    if (sessionAttached !== 'ok') return;
    if (!validate()) return;

    setSubmitting(true);
    setTopError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setFieldError(safeAuthError(error));
        return;
      }
      // Clear the recovery session so the next cold start does not
      // land the user in the app with the temporary token still
      // attached. The user signs in again with the new password.
      await supabase.auth.signOut();
      setSuccess(true);
    } catch (err) {
      setFieldError(safeAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }, [password, sessionAttached, validate]);

  const handleBackToLogin = useCallback(() => {
    router.replace('/(auth)/login');
  }, [router]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logo}>
          <Text style={styles.logoText}>TGP</Text>
        </View>

        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>
          Enter a new password for your account. You will be signed back in after.
        </Text>

        {topError ? (
          <Text style={styles.topError} accessibilityLiveRegion="assertive">
            {topError}
          </Text>
        ) : null}

        {success ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>
              Password updated. Sign in with your new password to continue.
            </Text>
            <Button title="Back to sign in" onPress={handleBackToLogin} fullWidth size="lg" />
          </View>
        ) : (
          <>
            <Input
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              secureToggle
              autoCapitalize="none"
              autoComplete="password-new"
              leftIcon="lock-closed-outline"
              placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
              editable={sessionAttached === 'ok' && !submitting}
              error={fieldError ?? undefined}
            />
            <Input
              label="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              secureToggle
              autoCapitalize="none"
              autoComplete="password-new"
              leftIcon="lock-closed-outline"
              placeholder="Re-enter the new password"
              editable={sessionAttached === 'ok' && !submitting}
            />

            <Button
              title="Update password"
              onPress={handleSubmit}
              loading={submitting}
              disabled={sessionAttached !== 'ok'}
              fullWidth
              size="lg"
              style={styles.submitBtn}
            />

            <Pressable
              onPress={handleBackToLogin}
              style={styles.backLink}
              accessibilityRole="button"
              accessibilityLabel="Back to sign in"
            >
              <Text style={styles.backLinkText}>Back to sign in</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['2xl'],
    paddingBottom: Spacing['2xl'],
  },
  logo: { alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.lg },
  logoText: {
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 36,
    letterSpacing: 4,
    color: Colors.frostWhite,
  },
  title: {
    ...Typography.h2,
    color: Colors.frostWhite,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.slateGray,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  topError: {
    ...Typography.body,
    color: Colors.debtCrimson,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  successBox: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.profitGreen,
    borderRadius: 4,
    gap: Spacing.md,
  },
  successText: {
    ...Typography.body,
    color: Colors.frostWhite,
    textAlign: 'center',
  },
  submitBtn: { marginTop: Spacing.lg },
  backLink: { alignSelf: 'center', marginTop: Spacing.md, paddingVertical: 8 },
  backLinkText: {
    ...Typography.body,
    color: Colors.slateGray,
    textDecorationLine: 'underline',
  },
});
