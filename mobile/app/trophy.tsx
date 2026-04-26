// trophy.tsx — UX Psychology Report #5: Trophy-Grade Milestone Artifact
// Full-screen preview of the branded 1080×1080 trophy card with Save + Share CTAs.
// Expo Router screen — navigated to via router.push('/trophy?...')
//
// Query params (all optional):
//   headline       — big stat text (default "MILESTONE ACHIEVED")
//   subtitle       — secondary label
//   identityTitle  — user identity title
//   isFounder      — "1" | "true" to show founding ribbon
//   theme          — "gold" | "brand" | "debt" | "net_worth"
//   surface        — analytics surface label
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrophyArtifact, TROPHY_SIZE } from '../src/components/trophy/TrophyArtifact';
import { useTrophyCapture } from '../src/components/trophy/useTrophyCapture';
import { HapticPressable } from '../src/components/HapticPressable';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/finance';
import type { TrophyTheme } from '../src/components/trophy/TrophyArtifact';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBool(v: string | string[] | undefined): boolean {
  if (!v) return false;
  const s = Array.isArray(v) ? v[0] : v;
  return s === '1' || s === 'true';
}

function parseTheme(v: string | string[] | undefined): TrophyTheme {
  const valid: TrophyTheme[] = ['gold', 'brand', 'debt', 'net_worth'];
  const s = Array.isArray(v) ? v[0] : (v ?? '');
  return valid.includes(s as TrophyTheme) ? (s as TrophyTheme) : 'gold';
}

function parseStr(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function TrophyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const headline      = parseStr(params.headline) || 'MILESTONE ACHIEVED';
  const subtitle      = parseStr(params.subtitle);
  const identityTitle = parseStr(params.identityTitle);
  const isFounder     = parseBool(params.isFounder);
  const theme         = parseTheme(params.theme);
  const surface       = parseStr(params.surface) || 'trophy_screen';

  const { viewRef, save, share, saveAndShare } = useTrophyCapture(surface);

  const [saving, setSaving]   = useState(false);
  const [sharing, setSharing] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const result = await save();
      if (result.saved) {
        Alert.alert('Saved! 🏆', 'Your trophy card has been saved to your camera roll.');
      } else if (result.error === 'capture_failed') {
        Alert.alert('Could not capture', 'Trophy capture is not supported on this device.');
      } else {
        Alert.alert('Permission denied', 'Allow photo library access in Settings to save your trophy.');
      }
    } finally {
      setSaving(false);
    }
  }, [save]);

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      const result = await share();
      if (!result.shared && result.error === 'capture_failed') {
        Alert.alert('Could not capture', 'Trophy capture is not supported on this device.');
      }
    } finally {
      setSharing(false);
    }
  }, [share]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <HapticPressable
          intent="light"
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Close trophy preview"
        >
          <Text style={styles.backText}>✕</Text>
        </HapticPressable>
        <Text style={styles.headerTitle}>Your Trophy</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Trophy preview — centred, with padding */}
      <ScrollView
        contentContainerStyle={styles.previewScroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>SHARE-WORTHY MOMENT</Text>

        {/* Off-screen capture target (viewRef) — same component rendered full-size */}
        <View style={styles.artifactWrapper}>
          <TrophyArtifact
            ref={viewRef}
            headline={headline}
            subtitle={subtitle || undefined}
            identityTitle={identityTitle || undefined}
            isFoundingMember={isFounder}
            theme={theme}
          />
        </View>

        <Text style={styles.hintText}>
          Your 1080×1080 trophy card — ready to post.
        </Text>
      </ScrollView>

      {/* CTA row */}
      <View style={styles.ctaRow}>
        {/* Save */}
        <HapticPressable
          intent="success"
          onPress={handleSave}
          disabled={saving || sharing}
          style={[styles.btn, styles.btnSave, (saving || sharing) && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Save trophy to camera roll"
        >
          {saving
            ? <ActivityIndicator color={Colors.backgroundDeepNavy} size="small" />
            : <Text style={styles.btnSaveText}>Save to Camera Roll</Text>
          }
        </HapticPressable>

        {/* Share */}
        <HapticPressable
          intent="success"
          onPress={handleShare}
          disabled={saving || sharing}
          style={[styles.btn, styles.btnShare, (saving || sharing) && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Share trophy"
        >
          {sharing
            ? <ActivityIndicator color={Colors.accentGold} size="small" />
            : <Text style={styles.btnShareText}>Share →</Text>
          }
        </HapticPressable>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundDeepNavy,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(58,58,74,0.5)',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.titleSmall,
    color: Colors.slateGray,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  // Preview
  previewScroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.base,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.microLabel,
    color: Colors.accentGold,
    letterSpacing: 3,
    marginBottom: Spacing.lg,
  },
  artifactWrapper: {
    // Slightly scale down for preview on smaller screens while keeping
    // the viewRef at its native TROPHY_SIZE for a crisp capture.
    alignItems: 'center',
    justifyContent: 'center',
    width: TROPHY_SIZE,
    height: TROPHY_SIZE,
    // Gold glow around the preview card
    shadowColor: Colors.accentGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 20,
  },
  hintText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    textAlign: 'center',
    marginTop: Spacing.xl,
    lineHeight: 18,
  },
  // CTA
  ctaRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(58,58,74,0.5)',
  },
  btn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  btnSave: {
    backgroundColor: Colors.accentGold,
  },
  btnSaveText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.backgroundDeepNavy,
  },
  btnShare: {
    borderWidth: 1.5,
    borderColor: Colors.accentGold,
    backgroundColor: 'transparent',
  },
  btnShareText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.accentGold,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
