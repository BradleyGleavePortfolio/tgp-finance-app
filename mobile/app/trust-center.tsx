// Trust Center — quiet, factual, truthful.
//
// The screen states what the platform actually does today: read-only access
// to the user's account data, encryption-at-rest, geo-redundant backups, and
// a concierge-handled data-controls path via the support inbox. We do not
// surface "Request data export" / "Delete my account" CTAs that imply a
// self-serve pipeline that does not yet exist. When that infrastructure
// lands, the buttons return — until then the screen is honest about how
// the request is processed.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, radius } from '../src/theme/tokens';
import { Typography, Spacing as spacing } from '../src/theme/finance';
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
  supportContactEmail?: string;
  dataControlsMode?: 'concierge' | 'self_serve';
}

const FALLBACK_SUPPORT_EMAIL = 'support@thegrowthproject.courses';

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
  const [contactPending, setContactPending] = useState(false);

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

  const supportEmail = meta?.supportContactEmail || FALLBACK_SUPPORT_EMAIL;

  const handleContactSupport = useCallback(
    async (subject: string, analyticsEvent: string) => {
      track(analyticsEvent);
      setContactPending(true);
      try {
        await usersApi.acknowledgeDataControlsContact().catch(() => {});
        const url = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}`;
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        } else {
          Alert.alert(
            'Email unavailable',
            `Please write to ${supportEmail} from your preferred email client.`,
          );
        }
      } finally {
        setContactPending(false);
      }
    },
    [supportEmail],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>TRUST CENTER</Text>
          <Text style={styles.heroTitle}>Your finances, observed in private.</Text>
          <Text style={styles.heroSubtitle}>
            How your data is stored, who can see it, and the controls available
            to you.
          </Text>
        </View>

        <View style={styles.readOnlyCard}>
          <View style={styles.readOnlyText}>
            <Text style={styles.readOnlyEyebrow}>ACCESS</Text>
            <Text style={styles.readOnlyTitle}>Read-only. Never moves money.</Text>
            <Text style={styles.readOnlyDesc}>
              The app reads balances you enter. It cannot initiate transfers,
              make payments, or move funds.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SECURITY STATUS</Text>
          {loading ? (
            <ActivityIndicator color={colors.stone} style={{ marginVertical: spacing.base }} />
          ) : meta ? (
            <View style={styles.metaCard}>
              <MetaRow label="Encryption" value={meta.encryptionLevel} />
              <Separator />
              <MetaRow
                label="Last security update"
                value={formatDate(meta.lastSecurityUpdate)}
              />
              <Separator />
              <MetaRow
                label="Data residency"
                value={meta.dataResidency.toUpperCase()}
              />
              <Separator />
              <MetaRow label="Audit policy" value={meta.auditPolicyVersion} />
            </View>
          ) : (
            <Text style={styles.metaError}>Could not load security status.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>YOUR DATA CONTROLS</Text>
          <View style={styles.metaCard}>
            <Text style={styles.controlsIntro}>
              Export and account closure are handled by the support team. Write
              to {supportEmail} and the request is fulfilled within five
              business days.
            </Text>

            <HapticPressable
              intent="medium"
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={() =>
                handleContactSupport(
                  'Data export request',
                  'data_export_contact_opened',
                )
              }
              disabled={contactPending}
              accessibilityRole="button"
              accessibilityLabel="Email support to request a data export"
            >
              <Text style={styles.actionBtnText}>
                {contactPending ? 'Opening…' : 'Email support · data export'}
              </Text>
            </HapticPressable>

            <View style={{ height: spacing.sm }} />

            <HapticPressable
              intent="warning"
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={() =>
                handleContactSupport(
                  'Account closure request',
                  'account_closure_contact_opened',
                )
              }
              disabled={contactPending}
              accessibilityRole="button"
              accessibilityLabel="Email support to request account closure"
            >
              <Text
                style={[styles.actionBtnText, styles.actionBtnSecondaryText]}
              >
                {contactPending ? 'Opening…' : 'Email support · close account'}
              </Text>
            </HapticPressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
          <View style={styles.metaCard}>
            <BulletSection title="Who has access">
              <BulletItem text="Only you can sign in to your account." />
              <BulletItem text="Support never has your password." />
              <BulletItem text="No third-party advertisers or data brokers." />
            </BulletSection>
            <Separator />
            <BulletSection title="What is encrypted">
              <BulletItem text="All data in transit (TLS 1.3)." />
              <BulletItem text="All data at rest (AES-256)." />
              <BulletItem text="Authentication tokens, never stored in plain text." />
            </BulletSection>
            <Separator />
            <BulletSection title="Where data lives">
              <BulletItem text="US-East data centres." />
              <BulletItem text="Backups are encrypted and geo-redundant." />
              <BulletItem text="Data is never transferred to ad networks." />
            </BulletSection>
          </View>
        </View>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bone },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  back: {
    fontFamily: typography.families.semiBold,
    fontSize: Typography.bodyMedium,
    color: colors.charcoal,
    width: 60,
  },
  title: {
    fontFamily: typography.families.serif,
    fontSize: Typography.titleMedium,
    color: colors.ink,
  },

  content: { padding: spacing.base, paddingBottom: spacing.base },

  heroCard: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.camel,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  heroEyebrow: {
    fontFamily: typography.families.medium,
    fontSize: 11,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    color: colors.stone,
    marginBottom: spacing.sm,
  },
  heroTitle: {
    fontFamily: typography.families.serif,
    fontSize: Typography.titleMedium,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  heroSubtitle: {
    fontFamily: typography.families.regular,
    fontSize: Typography.bodySmall,
    color: colors.charcoal,
    textAlign: 'center',
    lineHeight: 20,
  },

  readOnlyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.camel,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  readOnlyEyebrow: {
    fontFamily: typography.families.medium,
    fontSize: 11,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    color: colors.stone,
    marginBottom: spacing.xs,
  },
  readOnlyText: { flex: 1 },
  readOnlyTitle: {
    fontFamily: typography.families.serif,
    fontSize: Typography.titleSmall,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  readOnlyDesc: {
    fontFamily: typography.families.regular,
    fontSize: Typography.bodySmall,
    color: colors.charcoal,
    lineHeight: 18,
  },

  section: { marginBottom: spacing.lg },
  sectionLabel: {
    fontFamily: typography.families.semiBold,
    fontSize: Typography.microLabel,
    color: colors.stone,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },

  metaCard: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.camel,
    padding: spacing.base,
  },
  metaError: {
    fontFamily: typography.families.regular,
    fontSize: Typography.bodySmall,
    color: colors.charcoal,
    textAlign: 'center',
    paddingVertical: spacing.base,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  metaRowContent: { flex: 1 },
  metaRowLabel: {
    fontFamily: typography.families.regular,
    fontSize: Typography.bodySmall,
    color: colors.stone,
  },
  metaRowValue: {
    fontFamily: typography.families.semiBold,
    fontSize: Typography.bodyMedium,
    color: colors.ink,
    marginTop: 2,
  },

  separator: {
    height: 1,
    backgroundColor: colors.camel,
    marginVertical: 2,
  },

  controlsIntro: {
    fontFamily: typography.families.regular,
    fontSize: Typography.bodySmall,
    color: colors.charcoal,
    lineHeight: 20,
    marginBottom: spacing.base,
  },
  actionBtn: {
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: {
    backgroundColor: colors.oxblood,
  },
  actionBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.oxblood,
  },
  actionBtnText: {
    fontFamily: typography.families.semiBold,
    fontSize: Typography.bodyMedium,
    color: colors.bone,
  },
  actionBtnSecondaryText: {
    color: colors.oxblood,
  },

  bulletSection: { paddingVertical: spacing.sm },
  bulletSectionTitle: {
    fontFamily: typography.families.semiBold,
    fontSize: Typography.bodyMedium,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  bulletList: { gap: spacing.xs },
  bulletItem: { flexDirection: 'row', gap: spacing.sm },
  bulletDot: {
    fontFamily: typography.families.regular,
    fontSize: Typography.bodySmall,
    color: colors.stone,
    lineHeight: 20,
  },
  bulletText: {
    fontFamily: typography.families.regular,
    fontSize: Typography.bodySmall,
    color: colors.charcoal,
    flex: 1,
    lineHeight: 20,
  },
});
