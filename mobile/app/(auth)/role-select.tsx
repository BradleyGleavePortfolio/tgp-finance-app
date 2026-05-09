// Role selection — Student or Coach. Sprint A swap: the "I am a Coach"
// card no longer relies on the dev-only ENABLE_DEV_BACKDOOR path
// (which 403s in production). Instead the mobile client mints a signed
// token (see src/lib/coachSignupToken.ts) and posts it to
// /api/auth/coach-promote, which verifies the HMAC + freshness, audit-
// logs the attempt, and flips the role.
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
import { authApi } from '../../src/services/api';
import { errorMessage } from '../../src/lib/errorMessage';
import {
  getCoachSignupSecret,
  mintCoachSignupToken,
} from '../../src/lib/coachSignupToken';

export default function RoleSelectScreen() {
  const router = useRouter();
  const { selectRole, refreshUser, user, isLoading } = useAuthStore();
  const [coachSubmitting, setCoachSubmitting] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);

  // Dev fallback — only surfaced when no signup secret is configured.
  // Lets local dev keep using the old COACH_ACCESS_CODE backdoor while
  // a developer fills in EXPO_PUBLIC_COACH_SIGNUP_SECRET.
  const [showDevModal, setShowDevModal] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [devCodeError, setDevCodeError] = useState('');

  const handleStudentSelect = async () => {
    try {
      await selectRole('student');
      router.replace('/(onboarding)/quiz');
    } catch {
      Alert.alert('Error', 'Failed to select role. Please try again.');
    }
  };

  const handleCoachSelect = async () => {
    setCoachError(null);
    const secret = getCoachSignupSecret();
    if (!secret) {
      // Dev fallback path: production builds always ship the secret;
      // missing means a developer is running locally without one. Open
      // the access-code modal so they can use the dev backdoor.
      setShowDevModal(true);
      return;
    }
    if (!user?.id) {
      setCoachError('Please log in again to continue.');
      return;
    }
    setCoachSubmitting(true);
    try {
      const token = mintCoachSignupToken(user.id, secret);
      await authApi.coachPromote(token);
      // Refresh user so the role is current before navigating.
      await refreshUser();
      router.replace('/(onboarding)/quiz');
    } catch (err) {
      setCoachError(errorMessage(err, 'Could not enable coach mode. Please try again.'));
    } finally {
      setCoachSubmitting(false);
    }
  };

  const handleDevCodeSubmit = async () => {
    if (!devCode.trim()) {
      setDevCodeError('Please enter an access code.');
      return;
    }
    setDevCodeError('');
    setShowDevModal(false);
    try {
      await selectRole('coach', devCode);
      router.replace('/(onboarding)/quiz');
    } catch (err) {
      setDevCodeError(errorMessage(err, 'Invalid access code'));
      setShowDevModal(true);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Who Are You?</Text>
      <Text style={styles.subtitle}>Choose your role to get started</Text>

      <TouchableOpacity
        style={[styles.roleCard, styles.studentCard]}
        onPress={handleStudentSelect}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="I am a student"
      >
        <Text style={styles.roleIcon}>→</Text>
        <Text style={styles.roleTitle}>I'm a Student</Text>
        <Text style={styles.roleDesc}>
          Track my finances, build wealth, follow the priority waterfall
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.roleCard, styles.coachCard]}
        onPress={handleCoachSelect}
        disabled={coachSubmitting}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="I am a coach"
      >
        {coachSubmitting ? (
          <ActivityIndicator color={Colors.frostWhite} />
        ) : (
          <>
            <Text style={styles.roleIcon}>→</Text>
            <Text style={styles.roleTitle}>I'm a Coach</Text>
            <Text style={styles.roleDesc}>
              Manage clients, view all dashboards, run your practice
            </Text>
          </>
        )}
      </TouchableOpacity>

      {coachError ? (
        <Text style={styles.errorBanner} accessibilityLiveRegion="assertive">
          {coachError}
        </Text>
      ) : null}

      <Modal transparent animationType="slide" visible={showDevModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Coach Access Code</Text>
            <Text style={styles.modalDesc}>
              No coach signup secret is configured (dev only). Enter the legacy
              COACH_ACCESS_CODE to continue.
            </Text>

            <TextInput
              value={devCode}
              onChangeText={(t) => {
                setDevCode(t);
                setDevCodeError('');
              }}
              placeholder="Access code"
              placeholderTextColor={Colors.slateGray}
              style={styles.codeInput}
              keyboardType="default"
              maxLength={20}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />

            {devCodeError ? <Text style={styles.codeError}>{devCodeError}</Text> : null}

            <View style={styles.modalBtns}>
              <Button
                title="Cancel"
                onPress={() => {
                  setShowDevModal(false);
                  setDevCode('');
                  setDevCodeError('');
                }}
                variant="ghost"
              />
              <Button
                title="Verify"
                onPress={handleDevCodeSubmit}
                loading={isLoading}
                variant="primary"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundDeepNavy,
    padding: Spacing.xl,
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.displayMedium,
    color: Colors.frostWhite,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.slateGray,
    textAlign: 'center',
    marginBottom: Spacing.xxxl,
  },
  roleCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    padding: Spacing.xl,
    marginBottom: Spacing.base,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  studentCard: { borderColor: Colors.accentGold, backgroundColor: 'rgba(249,199,79,0.05)' },
  coachCard: { borderColor: Colors.profitGreen, backgroundColor: 'rgba(6,214,160,0.05)' },
  roleIcon: { fontSize: 48 },
  roleTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleMedium,
    color: Colors.frostWhite,
  },
  roleDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textAlign: 'center',
  },
  errorBanner: {
    marginTop: Spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.debtCrimson,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modal: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.accentGold,
    width: '100%',
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  modalDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  codeInput: {
    backgroundColor: Colors.backgroundDeepNavy,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    borderRadius: 2,
    padding: Spacing.base,
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.displaySmall,
    color: Colors.accentGold,
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: Spacing.sm,
  },
  codeError: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.debtCrimson,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  modalBtns: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
});
