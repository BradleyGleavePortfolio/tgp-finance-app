// Login screen — email/password + Google Sign-In
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
import { sendPasswordResetEmail } from '../../src/services/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' });

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

  const handleForgotPassword = async () => {
    if (!email) {
      setFieldErrors({ ...fieldErrors, email: 'Enter your email to reset password' });
      return;
    }
    try {
      await sendPasswordResetEmail(email);
      setResetSent(true);
    } catch {}
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

        <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotRow}>
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

        <TouchableOpacity style={styles.googleBtn} activeOpacity={0.8}>
          <Text style={styles.googleText}>Continue with Google</Text>
        </TouchableOpacity>

        <View style={styles.signupRow}>
          <Text style={styles.signupText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
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
