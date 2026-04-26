// Registration screen with password strength meter
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
import { track, identify } from '../../src/lib/analytics';

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score += 25;
  if (/[0-9]/.test(password)) score += 25;
  if (/[^a-zA-Z0-9]/.test(password)) score += 25;
  if (password.length >= 12) score += 25;

  if (score <= 25) return { score, label: 'Weak', color: Colors.debtCrimson };
  if (score <= 50) return { score, label: 'Fair', color: Colors.amberWarning };
  if (score <= 75) return { score, label: 'Good', color: Colors.accentGold };
  return { score, label: 'Strong', color: Colors.profitGreen };
}

export default function RegisterScreen() {
  const router = useRouter();
  const { register, isLoading, error, clearError } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [referral, setReferral] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const strength = getPasswordStrength(password);

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Full name is required';
    if (!email || !email.includes('@')) errors.email = 'Valid email required';
    if (password.length < 8) errors.password = 'Minimum 8 characters';
    if (!/[0-9]/.test(password)) errors.password = 'Must contain at least 1 number';
    if (!/[^a-zA-Z0-9]/.test(password)) errors.password = 'Must contain at least 1 special character';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    clearError();
    if (!validate()) return;
    try {
      await register({ name, email, password, phone: phone || undefined, referral_code: referral || undefined });
      // Track sign-up (user id not yet available — identify after verification)
      track('signed_up', { has_referral: !!referral });
      // Navigate to email verification screen
      router.replace('/(auth)/verify-email');
    } catch {
      // Intentional: authStore.register surfaces the failure via setError; UI reads it from state.
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
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join The Growth Project: Finance</Text>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Input
          label="Full Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          leftIcon="person-outline"
          error={fieldErrors.name}
          placeholder="John Smith"
        />

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
          leftIcon="lock-closed-outline"
          error={fieldErrors.password}
          placeholder="Min 8 chars, 1 number, 1 special"
        />

        {password.length > 0 && (
          <View style={styles.strengthRow}>
            <ProgressBar progress={strength.score} height={4} variant="savings" />
            <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
          </View>
        )}

        <Input
          label="Phone (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          leftIcon="call-outline"
          placeholder="+1 (555) 000-0000"
        />

        <Input
          label="Referral Code (optional)"
          value={referral}
          onChangeText={setReferral}
          autoCapitalize="characters"
          leftIcon="gift-outline"
          placeholder="Enter referral code"
        />

        <Button
          title="Create Account"
          onPress={handleRegister}
          loading={isLoading}
          fullWidth
          size="lg"
          style={styles.btn}
        />

        <View style={styles.loginRow}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="link"
            accessibilityLabel="Go back to log in"
          >
            <Text style={styles.loginLink}>Log in →</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.terms}>
          By creating an account you agree to our Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  content: { flexGrow: 1, padding: Spacing.xl, paddingTop: Spacing.section },
  back: { marginBottom: Spacing.xl },
  backText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.displaySmall, color: Colors.frostWhite, marginBottom: Spacing.sm },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, marginBottom: Spacing.xxl },
  errorBanner: {
    backgroundColor: 'rgba(230,57,70,0.12)', borderRadius: 8, borderWidth: 1,
    borderColor: Colors.debtCrimson, padding: Spacing.md, marginBottom: Spacing.base,
  },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.debtCrimson, textAlign: 'center' },
  strengthRow: { marginTop: -Spacing.sm, marginBottom: Spacing.base, gap: Spacing.xs },
  strengthLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.microLabel, textAlign: 'right' },
  btn: { marginTop: Spacing.base, marginBottom: Spacing.xl },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: Spacing.xl },
  loginText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  loginLink: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.accentGold },
  terms: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, textAlign: 'center', lineHeight: 16 },
});
