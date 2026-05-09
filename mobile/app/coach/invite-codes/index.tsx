/**
 * Sprint A — coach invite codes (finance side).
 *
 * Ports the fitness app's InviteCodesScreen to expo-router. Coaches can
 * mint, share, and revoke invite codes from a single screen accessible
 * from the empty client roster CTA and from the Clients screen header.
 *
 * Backed by /api/coach/invite-codes (finance backend, Sprint A).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { coachInviteCodesApi, type CoachInviteCode } from '../../../src/services/api';
import { colors, typography, spacing, radius } from '../../../src/theme/tokens';
import { errorMessage } from '../../../src/lib/errorMessage';

const INVITE_BASE_URL =
  process.env.EXPO_PUBLIC_INVITE_BASE_URL ?? 'https://app.trygrowthproject.com/wealth/join';

function buildInviteUrl(code: string): string {
  return `${INVITE_BASE_URL}/${encodeURIComponent(code)}`;
}

function formatExpiry(iso: string | null): string {
  if (!iso) return 'Never expires';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  if (d.getTime() < Date.now()) return 'Expired';
  return `Expires ${d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

function statusFor(c: CoachInviteCode): { label: string; tone: 'good' | 'muted' } {
  if (c.revoked) return { label: 'Revoked', tone: 'muted' };
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) {
    return { label: 'Expired', tone: 'muted' };
  }
  if (c.max_uses !== null && c.used_count >= c.max_uses) {
    return { label: 'Used up', tone: 'muted' };
  }
  return { label: 'Active', tone: 'good' };
}

export default function CoachInviteCodesScreen() {
  const router = useRouter();
  const [codes, setCodes] = useState<CoachInviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [maxUsesText, setMaxUsesText] = useState('');
  const [expiresInDaysText, setExpiresInDaysText] = useState('');
  const [createError, setCreateError] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await coachInviteCodesApi.list();
      const rows: CoachInviteCode[] = Array.isArray(res.data)
        ? res.data
        : ((res.data as unknown as { codes?: CoachInviteCode[] })?.codes ?? []);
      setCodes(rows);
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load your invite codes.'));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleCreate = async () => {
    setCreateError('');
    const body: { expires_at?: string; max_uses?: number } = {};
    if (maxUsesText.trim()) {
      const n = parseInt(maxUsesText.trim(), 10);
      if (!Number.isFinite(n) || n < 1) {
        setCreateError('Max uses must be a positive number');
        return;
      }
      body.max_uses = n;
    }
    if (expiresInDaysText.trim()) {
      const days = parseInt(expiresInDaysText.trim(), 10);
      if (!Number.isFinite(days) || days < 1) {
        setCreateError('Days until expiry must be a positive number');
        return;
      }
      const d = new Date();
      d.setDate(d.getDate() + days);
      body.expires_at = d.toISOString();
    }

    setCreating(true);
    try {
      const res = await coachInviteCodesApi.create(body);
      const created = res.data as CoachInviteCode;
      setCodes((prev) => [created, ...prev]);
      setShowCreate(false);
      setMaxUsesText('');
      setExpiresInDaysText('');
    } catch (err) {
      setCreateError(errorMessage(err, 'Failed to create code'));
    } finally {
      setCreating(false);
    }
  };

  const handleShare = async (code: string) => {
    try {
      const url = buildInviteUrl(code);
      await Share.share({
        url,
        message: `Join me on The Growth Project: ${url}\nInvite code: ${code}`,
      });
    } catch {
      // user-canceled share is not an error
    }
  };

  const handleRevoke = (code: CoachInviteCode) => {
    Alert.alert(
      'Revoke code?',
      `Revoke invite code ${code.code}? Clients can no longer use it to sign up.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await coachInviteCodesApi.revoke(code.id);
              setCodes((prev) =>
                prev.map((c) => (c.id === code.id ? { ...c, revoked: true } : c)),
              );
            } catch (err) {
              Alert.alert('Error', errorMessage(err, 'Failed to revoke'));
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: CoachInviteCode }) => {
    const status = statusFor(item);
    const isActive = status.label === 'Active';
    return (
      <View style={styles.codeCard} accessibilityLabel={`Invite code ${item.code} (${status.label})`}>
        <View style={styles.codeCardTop}>
          <Text selectable style={styles.codeText}>
            {item.code}
          </Text>
          <View
            style={[
              styles.statusPill,
              status.tone === 'good' ? styles.statusPillGood : styles.statusPillMuted,
            ]}
          >
            <Text
              style={[
                styles.statusPillText,
                status.tone === 'good' ? styles.statusPillTextGood : styles.statusPillTextMuted,
              ]}
            >
              {status.label.toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Ionicons name="people-outline" size={14} color={colors.charcoal} />
            <Text style={styles.metaText}>
              {item.used_count}
              {item.max_uses ? ` / ${item.max_uses}` : ''} used
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Ionicons name="time-outline" size={14} color={colors.charcoal} />
            <Text style={styles.metaText}>{formatExpiry(item.expires_at)}</Text>
          </View>
        </View>
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => handleShare(item.code)}
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Share code ${item.code}`}
          >
            <Ionicons name="share-outline" size={16} color={colors.oxblood} />
            <Text style={styles.actionText}>Share</Text>
          </Pressable>
          {isActive ? (
            <Pressable
              onPress={() => handleRevoke(item)}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnDanger,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Revoke code ${item.code}`}
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.oxblood} />
              <Text style={[styles.actionText, { color: colors.oxblood }]}>Revoke</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>INVITE CODES</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.oxblood} />
        </View>
      ) : (
        <FlatList
          data={codes}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.oxblood}
            />
          }
          ListHeaderComponent={
            <View>
              <Text style={styles.eyebrow}>YOUR PRACTICE</Text>
              <Text style={styles.headline}>Invite codes.</Text>
              <Text style={styles.lede}>
                Share an invite code with a new client. When they sign up using your code,
                they will be linked to you as their coach automatically.
              </Text>
              <Pressable
                onPress={() => setShowCreate(true)}
                style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel="Create new invite code"
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.bone} />
                <Text style={styles.createBtnText}>CREATE NEW INVITE CODE</Text>
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            loadError ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEyebrow}>SOMETHING WENT WRONG</Text>
                <Text style={styles.emptyTitle}>Could not load codes.</Text>
                <Text style={styles.emptyBody}>{loadError}</Text>
                <Pressable
                  onPress={onRefresh}
                  style={styles.retryBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading invite codes"
                >
                  <Text style={styles.retryBtnText}>RETRY</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="key-outline" size={36} color={colors.stone} />
                <Text style={styles.emptyTitle}>No codes yet.</Text>
                <Text style={styles.emptyBody}>
                  Create your first invite code above and share it with a new client.
                </Text>
              </View>
            )
          }
        />
      )}

      <Modal
        visible={showCreate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreate(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>NEW INVITE CODE</Text>
            <Text style={styles.modalDesc}>
              Both fields are optional. Leave blank for unlimited uses or no expiry.
            </Text>

            <Text style={styles.inputLabel}>MAX USES</Text>
            <TextInput
              value={maxUsesText}
              onChangeText={setMaxUsesText}
              placeholder="e.g. 5"
              placeholderTextColor={colors.stone}
              keyboardType="number-pad"
              style={styles.input}
              accessibilityLabel="Max uses"
            />

            <Text style={styles.inputLabel}>EXPIRES IN (DAYS)</Text>
            <TextInput
              value={expiresInDaysText}
              onChangeText={setExpiresInDaysText}
              placeholder="e.g. 30"
              placeholderTextColor={colors.stone}
              keyboardType="number-pad"
              style={styles.input}
              accessibilityLabel="Expires in days"
            />

            {createError ? (
              <Text style={styles.errorText} accessibilityLiveRegion="assertive">
                {createError}
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setShowCreate(false);
                  setCreateError('');
                  setMaxUsesText('');
                  setExpiresInDaysText('');
                }}
                style={styles.modalCancelBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                onPress={handleCreate}
                disabled={creating}
                style={[styles.modalSaveBtn, creating && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel="Create invite code"
              >
                {creating ? (
                  <ActivityIndicator color={colors.bone} />
                ) : (
                  <Text style={styles.modalSaveText}>CREATE</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bone },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: typography.families.medium,
    ...typography.scale.eyebrow,
    color: colors.charcoal,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: {
    fontFamily: typography.families.medium,
    ...typography.scale.eyebrow,
    color: colors.charcoal,
  },
  headline: {
    fontFamily: typography.families.serif,
    ...typography.scale.h1,
    color: colors.ink,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  lede: {
    fontFamily: typography.families.regular,
    ...typography.scale.bodySmall,
    color: colors.charcoal,
    marginBottom: spacing.lg,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.oxblood,
    borderRadius: radius.sm,
    paddingVertical: 14,
    marginBottom: spacing.lg,
  },
  createBtnText: {
    fontFamily: typography.families.bold,
    fontSize: 13,
    color: colors.bone,
    letterSpacing: 1.5,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  emptyEyebrow: {
    fontFamily: typography.families.medium,
    ...typography.scale.eyebrow,
    color: colors.oxblood,
  },
  emptyTitle: {
    fontFamily: typography.families.medium,
    ...typography.scale.body,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: typography.families.regular,
    ...typography.scale.bodySmall,
    color: colors.charcoal,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.oxblood,
  },
  retryBtnText: {
    fontFamily: typography.families.bold,
    fontSize: 12,
    color: colors.oxblood,
    letterSpacing: 1.5,
  },
  codeCard: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.stone,
  },
  codeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeText: {
    fontFamily: typography.families.monoBold,
    fontSize: 18,
    letterSpacing: 1.2,
    color: colors.ink,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusPillGood: { backgroundColor: 'rgba(74, 4, 4, 0.1)' },
  statusPillMuted: { backgroundColor: 'rgba(177, 168, 159, 0.25)' },
  statusPillText: {
    fontFamily: typography.families.medium,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  statusPillTextGood: { color: colors.oxblood },
  statusPillTextMuted: { color: colors.charcoal },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metaCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontFamily: typography.families.regular,
    fontSize: 12,
    color: colors.charcoal,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 0.5,
    borderColor: colors.oxblood,
  },
  actionBtnDanger: {
    borderColor: colors.oxblood,
    backgroundColor: 'rgba(74, 4, 4, 0.06)',
  },
  actionText: {
    fontFamily: typography.families.medium,
    fontSize: 12,
    color: colors.oxblood,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 26, 24, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bone,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: {
    fontFamily: typography.families.bold,
    fontSize: 14,
    letterSpacing: 1.5,
    color: colors.ink,
    textAlign: 'center',
  },
  modalDesc: {
    fontFamily: typography.families.regular,
    ...typography.scale.bodySmall,
    color: colors.charcoal,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  inputLabel: {
    fontFamily: typography.families.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.charcoal,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: typography.families.regular,
    fontSize: 15,
    color: colors.ink,
  },
  errorText: {
    color: colors.oxblood,
    fontFamily: typography.families.regular,
    fontSize: 12,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.sm,
  },
  modalCancelText: {
    fontFamily: typography.families.medium,
    fontSize: 12,
    color: colors.charcoal,
    letterSpacing: 1.2,
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    backgroundColor: colors.oxblood,
    borderRadius: radius.sm,
  },
  modalSaveText: {
    fontFamily: typography.families.bold,
    fontSize: 12,
    color: colors.bone,
    letterSpacing: 1.5,
  },
});
