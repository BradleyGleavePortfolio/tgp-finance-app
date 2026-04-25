// Account detail + balance history
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { useAccountsStore } from '../../src/stores/accountsStore';
import { formatCurrency, formatDate, formatAPR } from '../../src/utils/formatters';
import { ACCOUNT_TYPE_LABELS } from '../../src/utils/constants';
import type { AccountBalanceLog } from '../../src/types';

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { accounts, deleteAccount, updateAccount, getAccountHistory } = useAccountsStore();
  const [history, setHistory] = useState<AccountBalanceLog[]>([]);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editInstitution, setEditInstitution] = useState('');
  const [editBalance, setEditBalance] = useState('');
  const [editApr, setEditApr] = useState('');
  const [editMinPayment, setEditMinPayment] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const account = accounts.find(a => a.id === id);

  useEffect(() => {
    if (id) {
      // Read-only fetch: if it fails the screen just shows no history rows — the account view itself still renders.
      getAccountHistory(id, 30).then(setHistory).catch(() => {});
    }
  }, [id]);

  if (!account) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.notFound}>Account not found</Text>
      </SafeAreaView>
    );
  }

  const openEditModal = () => {
    if (!account) return;
    setEditName(account.name || '');
    setEditInstitution(account.institution || '');
    setEditBalance(String(account.balance ?? ''));
    setEditApr(account.apr_percent != null ? String(account.apr_percent) : '');
    setEditMinPayment(account.minimum_payment != null ? String(account.minimum_payment) : '');
    setEditNotes((account as any).notes || '');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!account) return;
    const balanceNum = parseFloat(editBalance);
    if (isNaN(balanceNum)) {
      Alert.alert('Invalid balance', 'Please enter a valid number for balance.');
      return;
    }
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: editName.trim() || account.name,
        balance: balanceNum,
      };
      if (editInstitution.trim()) payload.institution = editInstitution.trim();
      if (editApr.trim()) {
        const apr = parseFloat(editApr);
        if (!isNaN(apr)) payload.apr_percent = apr;
      }
      if (editMinPayment.trim()) {
        const mp = parseFloat(editMinPayment);
        if (!isNaN(mp)) payload.minimum_payment = mp;
      }
      if (editNotes.trim()) payload.notes = editNotes.trim();
      await updateAccount(account.id, payload as any);
      setEditModalVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Account', `Are you sure you want to delete "${account.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteAccount(account.id);
        router.back();
      }},
    ]);
  };

  const balanceColor = account.is_debt ? Colors.debtCrimson : Colors.profitGreen;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{account.name}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={openEditModal}
            accessibilityRole="button"
            accessibilityLabel="Edit account"
            style={styles.editBtn}
          >
            <Ionicons name="pencil-outline" size={18} color={Colors.accentGold} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            accessibilityHint="Prompts for confirmation before deleting this account"
          >
            <Text style={styles.deleteBtn}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Balance hero */}
        <Card style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{account.is_debt ? 'AMOUNT OWED' : 'CURRENT BALANCE'}</Text>
          <Text style={[styles.balance, { color: balanceColor }]}>
            {account.is_debt ? '-' : ''}{formatCurrency(account.balance)}
          </Text>
          {account.institution && <Text style={styles.institution}>{account.institution}</Text>}
          <Text style={styles.type}>{ACCOUNT_TYPE_LABELS[account.account_type]}</Text>
          {account.apr_percent && <Text style={styles.apr}>{formatAPR(account.apr_percent)}</Text>}
          {account.minimum_payment && (
            <Text style={styles.minimum}>Min payment: {formatCurrency(account.minimum_payment)}/mo</Text>
          )}
        </Card>

        {/* Balance history */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Balance History (30 days)</Text>
            {history.slice(0, 10).map((log) => {
              const change = log.balance - (account.balance);
              return (
                <View key={log.id} style={styles.historyRow}>
                  <Text style={styles.historyDate}>{formatDate(log.date, 'short')}</Text>
                  <Text style={[styles.historyBalance, { color: balanceColor }]}>
                    {formatCurrency(log.balance)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {account.is_debt && (
          <Button
            title="Run What-If: Pay This Off"
            onPress={() => router.push('/whatif/pay_off_debt_early')}
            variant="outline"
            fullWidth
            style={styles.whatifBtn}
          />
        )}
      </ScrollView>

      {/* Edit Account Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Account</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={Colors.slateGray} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Account name"
                placeholderTextColor={Colors.slateGray}
                autoCapitalize="words"
              />

              <Text style={styles.fieldLabel}>Institution</Text>
              <TextInput
                style={styles.textInput}
                value={editInstitution}
                onChangeText={setEditInstitution}
                placeholder="e.g. Chase, Vanguard"
                placeholderTextColor={Colors.slateGray}
                autoCapitalize="words"
              />

              <Text style={styles.fieldLabel}>Balance ($)</Text>
              <TextInput
                style={styles.textInput}
                value={editBalance}
                onChangeText={setEditBalance}
                placeholder="0.00"
                placeholderTextColor={Colors.slateGray}
                keyboardType="decimal-pad"
              />

              {account.is_debt && (
                <>
                  <Text style={styles.fieldLabel}>APR (%)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editApr}
                    onChangeText={setEditApr}
                    placeholder="e.g. 19.99"
                    placeholderTextColor={Colors.slateGray}
                    keyboardType="decimal-pad"
                  />

                  <Text style={styles.fieldLabel}>Minimum Payment ($/mo)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editMinPayment}
                    onChangeText={setEditMinPayment}
                    placeholder="e.g. 35"
                    placeholderTextColor={Colors.slateGray}
                    keyboardType="decimal-pad"
                  />
                </>
              )}

              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.textInput, styles.textInputMultiline]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Optional notes"
                placeholderTextColor={Colors.slateGray}
                multiline
                numberOfLines={3}
              />

              <Button
                title={isSaving ? 'Saving...' : 'Save Changes'}
                onPress={handleSaveEdit}
                variant="primary"
                fullWidth
                style={styles.saveBtn}
              />
              <Button
                title="Cancel"
                onPress={() => setEditModalVisible(false)}
                variant="ghost"
                fullWidth
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, flex: 1, textAlign: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  editBtn: { padding: 2 },
  deleteBtn: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.debtCrimson },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalCard: { backgroundColor: Colors.cardSurfaceNavy, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.xl, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xl },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleSmall, color: Colors.frostWhite },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray, marginBottom: Spacing.xs, marginTop: Spacing.md },
  textInput: { backgroundColor: Colors.backgroundDeepNavy, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.graphiteBorder, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  textInputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  saveBtn: { marginTop: Spacing.xl, marginBottom: Spacing.sm },
  content: { padding: Spacing.base, paddingBottom: 100 },
  balanceCard: { padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  balanceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray, letterSpacing: 1.5 },
  balance: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.displayLarge },
  institution: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray },
  type: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray },
  apr: { fontFamily: 'JetBrainsMono_400Regular', fontSize: Typography.bodySmall, color: Colors.amberWarning },
  minimum: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  historySection: { marginBottom: Spacing.xl },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.graphiteBorder },
  historyDate: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  historyBalance: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall },
  notFound: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, textAlign: 'center', marginTop: Spacing.section },
  whatifBtn: { marginTop: Spacing.base },
});
