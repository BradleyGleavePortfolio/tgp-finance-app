// UX Psychology Report #4: Preference-Controlled Personalization
// Full preferences screen: home modules, notification cadence, tone, currency, week start
import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/finance';
import { usePreferences } from '../src/hooks/usePreferences';
import { track } from '../src/lib/analytics';
import type { HomeModule, NotificationCadence, MotivationalTone, Currency, FirstDayOfWeek } from '../src/types/preferences';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TONE_SAMPLES: Record<MotivationalTone, string> = {
  gentle: '"When you\'re ready, take a peek."',
  direct: '"Make a Move. You\'re On Track ✓"',
  drill: '"Move money. Now."',
};

const CURRENCY_LABELS: Record<Currency, string> = {
  USD: 'USD — US Dollar ($)',
  EUR: 'EUR — Euro (€)',
  GBP: 'GBP — British Pound (£)',
  CAD: 'CAD — Canadian Dollar (CA$)',
  AUD: 'AUD — Australian Dollar (A$)',
};

const WEEK_DAY_LABELS: Record<FirstDayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  6: 'Saturday',
};

const HOME_MODULE_LABELS: Record<HomeModule, string> = {
  hero: 'Hero Action Card',
  milestone: 'Milestone Progress',
  trustcues: 'Trust Cues',
  secondary: 'Secondary Stats',
  community: 'Community Activity',
};

function hapticLight() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
}
function hapticSuccess() {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Chip selector
// ---------------------------------------------------------------------------
interface ChipSelectorProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onSelect: (val: T) => void;
}
function ChipSelector<T extends string | number>({ options, value, onSelect }: ChipSelectorProps<T>) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <TouchableOpacity
            key={String(opt.value)}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => {
              hapticLight();
              onSelect(opt.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function PreferencesScreen() {
  const router = useRouter();
  const { prefs, isLoading, update } = usePreferences();

  React.useEffect(() => {
    track('preferences_opened');
  }, []);

  const handleUpdate = useCallback(
    async <K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K]) => {
      hapticLight();
      track('preference_changed', { key, value: String(value) });
      await update({ [key]: value } as any);
      hapticSuccess();
    },
    [update],
  );

  const toggleModule = useCallback(
    (module: HomeModule) => {
      hapticLight();
      const current = prefs.homeModules as HomeModule[];
      const next = current.includes(module)
        ? current.filter((m) => m !== module)
        : [...current, module];
      track('preference_changed', { key: 'homeModules', value: next.join(',') });
      update({ homeModules: next });
    },
    [prefs.homeModules, update],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Preferences</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.accentGold} />
        </View>
      </SafeAreaView>
    );
  }

  const modules: HomeModule[] = ['hero', 'milestone', 'trustcues', 'secondary', 'community'];
  const enabledModules = prefs.homeModules as HomeModule[];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preferences</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Home Modules ───────────────────────────────────────────────── */}
        <SectionHeader
          title="Home Modules"
          subtitle="Choose which sections appear on your Home screen."
        />
        <View style={styles.card}>
          {modules.map((mod, i) => (
            <View key={mod} style={[styles.prefRow, i < modules.length - 1 && styles.prefRowBorder]}>
              <View style={styles.prefInfo}>
                <Text style={styles.prefLabel}>{HOME_MODULE_LABELS[mod]}</Text>
              </View>
              <Switch
                value={enabledModules.includes(mod)}
                onValueChange={() => toggleModule(mod)}
                trackColor={{ false: Colors.graphiteBorder, true: Colors.accentGold }}
                thumbColor={Colors.backgroundDeepNavy}
              />
            </View>
          ))}
        </View>

        {/* ── Notification Cadence ───────────────────────────────────────── */}
        <SectionHeader
          title="Notification Cadence"
          subtitle="How often would you like check-in nudges?"
        />
        <View style={styles.card}>
          <ChipSelector<NotificationCadence>
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'off', label: 'Off' },
            ]}
            value={prefs.notificationCadence}
            onSelect={(v) => handleUpdate('notificationCadence', v)}
          />
        </View>

        {/* ── Motivational Tone ──────────────────────────────────────────── */}
        <SectionHeader
          title="Motivational Tone"
          subtitle="How should the app speak to you?"
        />
        <View style={styles.card}>
          <ChipSelector<MotivationalTone>
            options={[
              { value: 'gentle', label: 'Gentle' },
              { value: 'direct', label: 'Direct' },
              { value: 'drill', label: 'Drill' },
            ]}
            value={prefs.motivationalTone}
            onSelect={(v) => handleUpdate('motivationalTone', v)}
          />
          <View style={styles.sampleBox}>
            <Text style={styles.sampleLabel}>SAMPLE</Text>
            <Text style={styles.sampleText}>{TONE_SAMPLES[prefs.motivationalTone]}</Text>
          </View>
        </View>

        {/* ── Currency ──────────────────────────────────────────────────── */}
        <SectionHeader
          title="Currency"
          subtitle="Balances and stats are displayed in this currency."
        />
        <View style={styles.card}>
          {(Object.keys(CURRENCY_LABELS) as Currency[]).map((cur, i, arr) => {
            const selected = prefs.currency === cur;
            return (
              <TouchableOpacity
                key={cur}
                style={[styles.radioRow, i < arr.length - 1 && styles.prefRowBorder]}
                onPress={() => handleUpdate('currency', cur)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
              >
                <Text style={[styles.radioLabel, selected && styles.radioLabelSelected]}>
                  {CURRENCY_LABELS[cur]}
                </Text>
                {selected && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Week Starts On ────────────────────────────────────────────── */}
        <SectionHeader title="Week Starts On" />
        <View style={styles.card}>
          <ChipSelector<FirstDayOfWeek>
            options={[
              { value: 0, label: 'Sun' },
              { value: 1, label: 'Mon' },
              { value: 6, label: 'Sat' },
            ]}
            value={prefs.firstDayOfWeek}
            onSelect={(v) => handleUpdate('firstDayOfWeek', v)}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundDeepNavy,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  back: {
    color: Colors.accentGold,
    fontSize: Typography.bodyMedium,
    fontFamily: Typography.fontPrimaryMedium,
    width: 60,
  },
  headerTitle: {
    color: Colors.frostWhite,
    fontSize: Typography.titleMedium,
    fontFamily: Typography.fontPrimaryBold,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
  },
  sectionHeader: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    color: Colors.frostWhite,
    fontSize: Typography.bodyLarge,
    fontFamily: Typography.fontPrimaryBold,
  },
  sectionSubtitle: {
    color: Colors.slateGray,
    fontSize: Typography.bodySmall,
    fontFamily: Typography.fontPrimary,
    marginTop: 2,
  },
  card: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  prefRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.graphiteBorder,
  },
  prefInfo: {
    flex: 1,
    marginRight: Spacing.base,
  },
  prefLabel: {
    color: Colors.frostWhite,
    fontSize: Typography.bodyMedium,
    fontFamily: Typography.fontPrimaryMedium,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    backgroundColor: Colors.cardSurfaceNavyElevated,
  },
  chipSelected: {
    borderColor: Colors.accentGold,
    backgroundColor: 'rgba(249, 199, 79, 0.12)',
  },
  chipText: {
    color: Colors.slateGray,
    fontSize: Typography.bodyMedium,
    fontFamily: Typography.fontPrimaryMedium,
  },
  chipTextSelected: {
    color: Colors.accentGold,
  },
  sampleBox: {
    backgroundColor: Colors.cardSurfaceNavyElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  sampleLabel: {
    color: Colors.slateGray,
    fontSize: 10,
    fontFamily: Typography.fontPrimaryBold,
    letterSpacing: 1,
    marginBottom: 4,
  },
  sampleText: {
    color: Colors.frostWhite,
    fontSize: Typography.bodyMedium,
    fontFamily: Typography.fontPrimary,
    fontStyle: 'italic',
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  radioLabel: {
    color: Colors.slateGray,
    fontSize: Typography.bodyMedium,
    fontFamily: Typography.fontPrimaryMedium,
  },
  radioLabelSelected: {
    color: Colors.frostWhite,
  },
  checkmark: {
    color: Colors.accentGold,
    fontSize: Typography.bodyMedium,
    fontFamily: Typography.fontPrimaryBold,
  },
});
