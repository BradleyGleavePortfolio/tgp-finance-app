/**
 * Trust Center screen — UX Psychology Report #2: "Trust as Emotion"
 *
 * Sections:
 *  1. Trust metadata (from /system/trust-meta)
 *  2. Read-only · Never moves money — prominent row
 *  3. Data controls — export + delete buttons
 *  4. Who has access, what's encrypted, where data lives
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/finance';
import { HapticPressable } from '../src/components/HapticPressable';
import { trustApi, usersApi } from '../src/services/api';
import { track } from '../src/lib/analytics';

interface TrustMeta {
  lastSecurityUpdate: string;
  encryptionLevel: string;
  dataResidency: string;
  auditPolicyVersion: string;
  dataExportSupported: boolean;
  accountDeletionSupported: boolean;
  readOnlyAccountAccess: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function TrustCenterScreen() {
  const router = useRouter();
  const [meta, setMeta] = useState<TrustMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportPending, setExportPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    track('trust_center_opened');
    trustApi
      .getMeta()
      .then((res) => setMeta(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleBack = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
    router.back();
  };

  const handleDataExport = useCallback(async () => {
    track('data_export_requested');
    setExportPending(true);
    try {
      await usersApi.requestDataExport();
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* ignore */ }
      Alert.alert(
        'Export Requested',
        'Your data export has been queued. You will receive a download link within 24 hours.',
      );
    } catch {
      Alert.alert('Error', 'Could not request export. Please try again.');
    } finally {
      setExportPending(false);
    }
  }, []);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'Are you sure? You have a 30-day grace period to cancel before your account and all data are permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Schedule Deletion',
          style: 'destructive',
          onPress: async () => {
            track('account_deletion_requested');
            setDeletePending(true);
            try {
              await usersApi.deleteAccount();
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch { /* ignore */ }
              Alert.alert(
                'Deletion Scheduled',
                'Your account is scheduled for deletion in 30 days. Contact support to cancel.',
              );
            } catch {
              Alert.alert('Error', 'Could not schedule deletion. Please try again.');
            } finally {
              setDeletePending(false);
            }
          },
        },
      ],
    );
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trust Center</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero tagline */}
        <View style={styles.heroCard}>
          <Text style={styles.heroEmoji}>🛡</Text>
          <Text style={styles.heroTitle}>Your finances, protected</Text>
          <Text style={styles.heroSubtitle}>
            We are obsessed with your trust. Here is everything you need to know
            about how we store, protect, and respect your data.
          </Text>
        </View>

        {/* Section 2: Read-only badge */}
        <View style={styles.readOnlyCard}>
          <Text style={styles.readOnlyIcon}>👁</Text>
          <View style={styles.readOnlyText}>
            <Text style={styles.readOnlyTitle}>Read-only · Never moves money</Text>
            <Text style={styles.readOnlyDesc}>
              This app only reads your financial data. It cannot initiate
              transfers, make payments, or move funds on your behalf — ever.
            </Text>
          </View>
        </View>

        {/* Section 1: Trust metadata */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SECURITY STATUS</Text>
          {loading ? (
            <ActivityIndicator color={Colors.slateGray} style={{ marginVertical: Spacing.base }} />
          ) : meta ? (
            <View style={styles.metaCard}>
              <MetaRow
                icon="🔒"
                label="Encryption"
                value={meta.encryptionLevel}
              />
              <Separator />
              <MetaRow
                icon="📅"
                label="Last security update"
                value={formatDate(meta.lastSecurityUpdate)}
              />
              <Separator />
              <MetaRow
                icon="🌍"
                label="Data residency"
                value={meta.dataResidency.toUpperCase()}
              />
              <Separator />
              <MetaRow
                icon="📋"
                label="Audit policy"
                value={meta.auditPolicyVersion}
              />
            </View>
          ) : (
            <Text style={styles.metaError}>Could not load security status.</Text>
          )}
        </View>

        {/* Section 3: Data controls */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>YOUR DATA CONTROLS</Text>
          <View style={styles.metaCard}>
            <Text style={styles.controlsIntro}>
              You are always in control. Export or delete your data at any time — no lock-in.
            </Text>

            <HapticPressable
              intent="medium"
              style={[styles.actionBtn, styles.actionBtnExport]}
              onPress={handleDataExport}
              disabled={exportPending}
              accessibilityRole="button"
              accessibilityLabel="Request data export"
            >
              <Text style={styles.actionBtnText}>
                {exportPending ? 'Requesting…' : '📥  Request Data Export'}
              </Text>
            </HapticPressable>

            <View style={{ height: Spacing.sm }} />

            <HapticPressable
              intent="warning"
              style={[styles.actionBtn, styles.actionBtnDelete]}
              onPress={handleDeleteAccount}
              disabled={deletePending}
              accessibilityRole="button"
              accessibilityLabel="Delete account"
            >
              <Text style={[styles.actionBtnText, styles.actionBtnDeleteText]}>
                {deletePending ? 'Processing…' : '🗑  Delete My Account'}
              </Text>
            </HapticPressable>
          </View>
        </View>

        {/* Section 4: Bullets — who/what/where */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
          <View style={styles.metaCard}>
            <BulletSection title="👤  Who has access">
              <BulletItem text="Only you can access your account" />
              <BulletItem text="Our support team never has your password" />
              <BulletItem text="No third-party advertisers or data brokers" />
            </BulletSection>
            <Separator />
            <BulletSection title="🔒  What is encrypted">
              <BulletItem text="All data in transit (TLS 1.3)" />
              <BulletItem text="All data at rest (AES-256)" />
              <BulletItem text="Authentication tokens (never stored in plain text)" />
            </BulletSection>
            <Separator />
            <BulletSection title="🌍  Where data lives">
              <BulletItem text="Servers located in US-East data centres" />
              <BulletItem text="Backups are encrypted and geo-redundant" />
              <BulletItem text="Data is never transferred to ad networks" />
            </BulletSection>
          </View>
        </View>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaRowIcon}>{icon}</Text>
      <View style={styles.metaRowContent}>
        <Text style={styles.metaRowLabel}>{label}</Text>
        <Text style={styles.metaRowValue}>{value}</Text>
      </View>
    </View>
  );
}

function BulletSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.bulletSection}>
      <Text style={styles.bulletSectionTitle}>{title}</Text>
      <View style={styles.bulletList}>{children}</View>
    </View>
  );
}

function BulletItem({ text }: { text: string }) {
  return (
    <View style={styles.bulletItem}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  back: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyLarge,
    color: Colors.slateGray,
    width: 60,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleMedium,
    color: Colors.frostWhite,
  },

  content: { padding: Spacing.base, paddingBottom: Spacing.base },

  heroCard: {
    backgroundColor: 'rgba(77, 217, 229, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(77, 217, 229, 0.20)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  heroEmoji: { fontSize: 36, marginBottom: Spacing.sm },
  heroTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleMedium,
    color: Colors.frostWhite,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textAlign: 'center',
    lineHeight: 20,
  },

  readOnlyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 214, 160, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 214, 160, 0.25)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  readOnlyIcon: { fontSize: 28 },
  readOnlyText: { flex: 1 },
  readOnlyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.profitGreen,
    marginBottom: Spacing.xs,
  },
  readOnlyDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    lineHeight: 18,
  },

  section: { marginBottom: Spacing.lg },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },

  metaCard: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    padding: Spacing.base,
  },
  metaError: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textAlign: 'center',
    paddingVertical: Spacing.base,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  metaRowIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  metaRowContent: { flex: 1 },
  metaRowLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  metaRowValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
    marginTop: 2,
  },

  separator: {
    height: 1,
    backgroundColor: Colors.graphiteBorder,
    marginVertical: 2,
  },

  controlsIntro: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    lineHeight: 20,
    marginBottom: Spacing.base,
  },
  actionBtn: {
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnExport: {
    backgroundColor: Colors.slateGray,
  },
  actionBtnDelete: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.debtCrimson,
  },
  actionBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyLarge,
    color: Colors.backgroundDeepNavy,
  },
  actionBtnDeleteText: {
    color: Colors.debtCrimson,
  },

  bulletSection: { paddingVertical: Spacing.sm },
  bulletSectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
    marginBottom: Spacing.sm,
  },
  bulletList: { gap: Spacing.xs },
  bulletItem: { flexDirection: 'row', gap: Spacing.sm },
  bulletDot: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    lineHeight: 20,
  },
  bulletText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    flex: 1,
    lineHeight: 20,
  },
});
