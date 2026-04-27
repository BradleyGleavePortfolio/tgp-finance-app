// Email verification — polls backend login to detect verified state
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { supabase } from '../../src/services/supabase';
import { useAuthStore } from '../../src/stores/authStore';

const POLL_INTERVAL_MS = 5000;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, checkVerification, pendingVerification } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-poll every 5 seconds by attempting login via backend
  useEffect(() => {
    if (!pendingVerification) return;

    const poll = async () => {
      const verified = await checkVerification();
      if (verified) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        router.replace('/(auth)/role-select');
      }
    };

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pendingVerification]);

  const handleManualCheck = async () => {
    setChecking(true);
    setError('');
    try {
      const verified = await checkVerification();
      if (verified) {
        router.replace('/(auth)/role-select');
      } else {
        setError('Email not yet verified. Please check your inbox and click the link.');
      }
    } catch {
      setError('Unable to check verification status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    const email = pendingVerification?.email || user?.email;
    if (!email) return;
    try {
      await supabase.auth.resend({ type: 'signup', email });
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch {
      setError('Failed to resend verification email.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>VERIFY EMAIL</Text>
      <Text style={styles.title}>Check your email.</Text>
      <Text style={styles.description}>
        We sent a verification link to{'\n'}
        <Text style={styles.email}>{pendingVerification?.email || user?.email || 'your email'}</Text>
        {'\n\n'}
        Click the link in the email to verify your account, then return here.
      </Text>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {resent ? (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>Verification email resent!</Text>
        </View>
      ) : null}

      <Button
        title="I've verified — Continue"
        onPress={handleManualCheck}
        loading={checking}
        fullWidth
        size="lg"
        style={styles.btn}
      />

      <TouchableOpacity onPress={handleResend} style={styles.resendRow}>
        <Text style={styles.resendText}>Didn't receive it? <Text style={styles.resendLink}>Resend email</Text></Text>
      </TouchableOpacity>

      <Text style={styles.autoPoll}>Checking automatically every 5 seconds...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  eyebrow: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    color: Colors.slateGray,
    marginBottom: Spacing.lg,
  },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.displaySmall, color: Colors.frostWhite, marginBottom: Spacing.base, textAlign: 'center' },
  description: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xxl },
  email: { fontFamily: 'Inter_600SemiBold', color: Colors.accentGold },
  errorBanner: { backgroundColor: 'rgba(230,57,70,0.12)', borderRadius: 2, borderWidth: 1, borderColor: Colors.debtCrimson, padding: Spacing.md, marginBottom: Spacing.base, width: '100%' },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.debtCrimson, textAlign: 'center' },
  successBanner: { backgroundColor: 'rgba(0,200,83,0.12)', borderRadius: 2, borderWidth: 1, borderColor: Colors.profitGreen, padding: Spacing.md, marginBottom: Spacing.base, width: '100%' },
  successText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.profitGreen, textAlign: 'center' },
  btn: { marginBottom: Spacing.xl },
  resendRow: { marginBottom: Spacing.xl },
  resendText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  resendLink: { color: Colors.accentGold, fontFamily: 'Inter_600SemiBold' },
  autoPoll: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, textAlign: 'center' },
});
