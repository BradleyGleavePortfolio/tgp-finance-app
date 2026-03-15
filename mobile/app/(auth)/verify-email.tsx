// Email verification — auto-polls every 5 seconds
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing } from '../../src/theme/finance';
import { supabase } from '../../src/services/supabase';
import { useAuthStore } from '../../src/stores/authStore';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  // Auto-poll every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.email_confirmed_at) {
        clearInterval(interval);
        router.replace('/(auth)/role-select');
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualCheck = async () => {
    setChecking(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.email_confirmed_at) {
        router.replace('/(auth)/role-select');
      } else {
        setError('Email not yet verified. Please check your inbox and click the link.');
      }
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (!user?.email) return;
    await supabase.auth.resend({ type: 'signup', email: user.email });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📧</Text>
      <Text style={styles.title}>Check Your Email</Text>
      <Text style={styles.description}>
        We sent a verification link to{'\n'}
        <Text style={styles.email}>{user?.email || 'your email'}</Text>
        {'\n\n'}
        Click the link in the email to verify your account, then return here.
      </Text>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
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
  icon: { fontSize: 64, marginBottom: Spacing.xl },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.displaySmall, color: Colors.frostWhite, marginBottom: Spacing.base, textAlign: 'center' },
  description: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xxl },
  email: { fontFamily: 'Inter_600SemiBold', color: Colors.accentGold },
  errorBanner: { backgroundColor: 'rgba(230,57,70,0.12)', borderRadius: 8, borderWidth: 1, borderColor: Colors.debtCrimson, padding: Spacing.md, marginBottom: Spacing.base, width: '100%' },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.debtCrimson, textAlign: 'center' },
  btn: { marginBottom: Spacing.xl },
  resendRow: { marginBottom: Spacing.xl },
  resendText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  resendLink: { color: Colors.accentGold, fontFamily: 'Inter_600SemiBold' },
  autoPoll: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, textAlign: 'center' },
});
