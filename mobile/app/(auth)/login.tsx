// Login screen — email/password + Google Sign-In
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
import { sendPasswordResetEmail, signInWithGoogle } from '../../src/services/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' });
  const [googleLoading, setGoogleLoading] = useState(false);

  // GOOGLE_OAUTH_SETUP_REQUIRED:
  // Before Google Sign-In will work you must:
  //  1. Enable the Google provider in your Supabase dashboard under Authentication → Providers
  //  2. Create a Google Cloud OAuth 2.0 client ID at console.cloud.google.com and add the
  //     Supabase callback URL as an authorised redirect URI
  //  3. Set the Google Client ID + Secret in the Supabase Google provider settings
  // The sign-in button is rendered but will show an error alert if Supabase isn't configured.
  const GOOGLE_OAUTH_CONFIGURED = !!process.env.EXPO_PUBLIC_SUPABASE_URL; // will always be true if Supabase is set up; Google sub-config is inside Supabase dashboard

  const validate = () => {
    const errors = { email: '', password: '' };
    if (!email || !email.includes('@')) errors.email = 'Enter a valid email address';
    if (!password) errors.password = 'Password is required';
    setFieldErrors(errors);
    return !errors.email && !errors.password;
  };

  const handleLogin = async () => {
    clearError();
    if (!validate()) return;
    try {
      await login(email, password);
      // Navigate to index which will route based on auth/onboarding state
      router.replace('/');
    } catch {
      // Error shown from store
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // signInWithGoogle() opens a browser/WebView via Supabase OAuth.
      // The redirect back to tgp-finance://auth/callback will be handled by
      // the deep-link listener in app/_layout.tsx (or expo-router).
      // If the Supabase Google provider is not configured, signInWithOAuth
      // will throw an error which we catch and show to the user.
    } catch (err: any) {
      const msg = err?.message || 'Google Sign-In failed. Please try again.';
      // Surface a clear message if the Google provider is not configured
      const isConfigError =
        msg.toLowerCase().includes('provider') ||
        msg.toLowerCase().includes('not enabled') ||
        msg.toLowerCase().includes('oauth');
      Alert.alert(
        'Google Sign-In',
        isConfigError
          ? 'Google Sign-In is not yet configured. Please enable the Google provider in your Supabase project settings and set up a Google Cloud OAuth client.'
          : msg,
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setFieldErrors({ ...fieldErrors, email: 'Enter your email to reset password' });
      return;
    }
    try {
      await sendPasswordResetEmail(email);
      setResetSent(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send reset email. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logo}>
          <Text style={styles.logoText}>TGP</Text>
          <Text style={styles.logoSub}>Finance</Text>
        </View>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to your command center</Text>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {resetSent && (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>Password reset email sent. Check your inbox.</Text>
          </View>
        )}

        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          leftIcon="mail-outline"
          error={fieldErrors.email}
          placeholder="your@email.com"
        />

        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureToggle
          autoComplete="password"
          leftIcon="lock-closed-outline"
          error={fieldErrors.password}
          placeholder="Your password"
        />

        <TouchableOpacity
          onPress={handleForgotPassword}
          style={styles.forgotRow}
          accessibilityRole="button"
          accessibilityLabel="Forgot password"
          accessibilityHint="Sends a password reset email to the address you entered above"
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <Button
          title="Log In"
          onPress={handleLogin}
          loading={isLoading}
          fullWidth
          size="lg"
          style={styles.loginBtn}
        />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.googleBtn, googleLoading && { opacity: 0.6 }]}
          activeOpacity={0.8}
          onPress={handleGoogleSignIn}
          disabled={googleLoading}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          accessibilityHint="Sign in using your Google account. Requires Google OAuth to be configured in Supabase."
        >
          <Text style={styles.googleText}>{googleLoading ? 'Signing in...' : 'Continue with Google'}</Text>
        </TouchableOpacity>

        <View style={styles.signupRow}>
          <Text style={styles.signupText}>Don't have an account? </Text>
          <TouchableOpacity
            onPress={() => router.push('/(auth)/register')}
            accessibilityRole="link"
            accessibilityLabel="Create a new account"
          >
            <Text style={styles.signupLink}>Create account →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundDeepNavy,
  },
  content: {
    flexGrow: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    paddingTop: Spacing.section,
  },
  logo: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  logoText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    color: Colors.accentGold,
    letterSpacing: 4,
  },
  logoSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    letterSpacing: 6,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.displaySmall,
    color: Colors.frostWhite,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  errorBanner: {
    backgroundColor: 'rgba(230,57,70,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.debtCrimson,
    padding: Spacing.md,
    marginBottom: Spacing.base,
  },
  errorBannerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.debtCrimson,
    textAlign: 'center',
  },
  successBanner: {
    backgroundColor: 'rgba(6,214,160,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.profitGreen,
    padding: Spacing.md,
    marginBottom: Spacing.base,
  },
  successText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.profitGreen,
    textAlign: 'center',
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: -Spacing.sm,
    marginBottom: Spacing.base,
  },
  forgotText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.accentGold,
  },
  loginBtn: {
    marginBottom: Spacing.xl,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.graphiteBorder,
  },
  dividerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  googleBtn: {
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    backgroundColor: Colors.cardSurfaceNavy,
  },
  googleText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  signupLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySmall,
    color: Colors.accentGold,
  },
});
