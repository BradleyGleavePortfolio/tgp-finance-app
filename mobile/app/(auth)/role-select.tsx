// Role selection — Coach (backdoor code) or Student
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
export default function RoleSelectScreen() {
  const router = useRouter();
  const { selectRole, isLoading } = useAuthStore();
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [codeError, setCodeError] = useState('');

  const handleStudentSelect = async () => {
    try {
      await selectRole('student');
      router.replace('/(onboarding)/quiz');
    } catch {
      Alert.alert('Error', 'Failed to select role. Please try again.');
    }
  };

  const handleCoachCodeSubmit = async () => {
    if (!accessCode.trim()) {
      setCodeError('Please enter an access code.');
      return;
    }
    setCodeError('');
    setShowCodeModal(false);
    try {
      await selectRole('coach', accessCode);
      router.replace('/(onboarding)/quiz');
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Invalid access code';
      setCodeError(message);
      setShowCodeModal(true);
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
      >
        <Text style={styles.roleIcon}>🎯</Text>
        <Text style={styles.roleTitle}>I'm a Student</Text>
        <Text style={styles.roleDesc}>Track my finances, build wealth, follow the priority waterfall</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.roleCard, styles.coachCard]}
        onPress={() => setShowCodeModal(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.roleIcon}>👨‍💼</Text>
        <Text style={styles.roleTitle}>I'm a Coach</Text>
        <Text style={styles.roleDesc}>Manage students, view all dashboards, coach your clients</Text>
      </TouchableOpacity>

      {/* Coach access code modal */}
      <Modal transparent animationType="slide" visible={showCodeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Coach Access Code</Text>
            <Text style={styles.modalDesc}>Enter your coach access code to continue.</Text>

            <TextInput
              value={accessCode}
              onChangeText={(t) => { setAccessCode(t); setCodeError(''); }}
              placeholder="Access code"
              placeholderTextColor={Colors.slateGray}
              style={styles.codeInput}
              keyboardType="default"
              maxLength={20}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />

            {codeError ? <Text style={styles.codeError}>{codeError}</Text> : null}

            <View style={styles.modalBtns}>
              <Button title="Cancel" onPress={() => { setShowCodeModal(false); setAccessCode(''); setCodeError(''); }} variant="ghost" />
              <Button title="Verify" onPress={handleCoachCodeSubmit} loading={isLoading} variant="primary" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy, padding: Spacing.xl, justifyContent: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.displayMedium, color: Colors.frostWhite, textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, textAlign: 'center', marginBottom: Spacing.xxxl },
  roleCard: { borderRadius: BorderRadius.xl, borderWidth: 1.5, padding: Spacing.xl, marginBottom: Spacing.base, alignItems: 'center', gap: Spacing.sm },
  studentCard: { borderColor: Colors.accentGold, backgroundColor: 'rgba(249,199,79,0.05)' },
  coachCard: { borderColor: Colors.profitGreen, backgroundColor: 'rgba(6,214,160,0.05)' },
  roleIcon: { fontSize: 48 },
  roleTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleMedium, color: Colors.frostWhite },
  roleDesc: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  modal: { backgroundColor: Colors.cardSurfaceNavy, borderRadius: BorderRadius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.accentGold, width: '100%' },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleSmall, color: Colors.frostWhite, textAlign: 'center', marginBottom: Spacing.sm },
  modalDesc: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, textAlign: 'center', marginBottom: Spacing.xl },
  codeInput: { backgroundColor: Colors.backgroundDeepNavy, borderWidth: 1, borderColor: Colors.graphiteBorder, borderRadius: 12, padding: Spacing.base, fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.displaySmall, color: Colors.accentGold, textAlign: 'center', letterSpacing: 8, marginBottom: Spacing.sm },
  codeError: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.debtCrimson, textAlign: 'center', marginBottom: Spacing.md },
  modalBtns: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
});
