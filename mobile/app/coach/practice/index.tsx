/**
 * Sprint A — coach practice picker (finance side).
 *
 * Lands here right after a successful coach promotion. The user has
 * just been promoted on the finance side; we need a stated practice
 * type so the fitness app can decide whether to mount the cross-pillar
 * surface.
 *
 * Symmetry: the finance backend's PUT /api/coach/practice currently
 * only writes locally. The fitness backend's PUT /api/coach/practice
 * mirrors to finance via federation (see growth-project-backend
 * Sprint A). To avoid asymmetric state when a coach picks here on
 * finance first, the screen also calls the fitness federation
 * endpoint via a new server-side helper. Until that helper lands the
 * coach can re-set the value from the fitness app to fully sync.
 *
 * UX: three options match the backend enum exactly. The selected row
 * has a visible active state; Save is disabled until a choice is made.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  coachPracticeApi,
  type CoachPracticeType,
} from '../../../src/services/api';
import { colors, typography, spacing, radius } from '../../../src/theme/tokens';
import { errorMessage } from '../../../src/lib/errorMessage';

const OPTIONS: {
  id: CoachPracticeType;
  label: string;
  subtitle: string;
}[] = [
  {
    id: 'both',
    label: 'Both pillars',
    subtitle: 'Body and Wealth — unified roster, cross-pillar insights.',
  },
  {
    id: 'finance_only',
    label: 'Wealth only',
    subtitle: 'Finance coaching practice — single-product surface.',
  },
  {
    id: 'fitness_only',
    label: 'Body only',
    subtitle: 'Fitness coaching practice — single-product surface.',
  },
];

export default function PracticeSelectScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<CoachPracticeType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-select the existing value if the coach has already chosen on
  // the fitness side (federation has already mirrored it here).
  useEffect(() => {
    let alive = true;
    coachPracticeApi
      .get()
      .then((res) => {
        if (alive && res.data.practice_type) setSelected(res.data.practice_type);
      })
      .catch(() => {
        // Best effort prefetch — picker still renders.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const onSave = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await coachPracticeApi.set(selected);
      // Land on the coach home rather than back into the auth stack.
      router.replace('/coach');
    } catch (err) {
      setError(errorMessage(err, 'Could not save your practice. Try again.'));
    } finally {
      setSaving(false);
    }
  }, [router, selected]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.ink} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SET YOUR PRACTICE</Text>
        <Text style={styles.headline}>What does your work cover?</Text>
        <Text style={styles.lede}>
          We use this to decide which surfaces appear. You can change it later
          in Settings.
        </Text>

        <View style={styles.options}>
          {OPTIONS.map((opt) => {
            const active = selected === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSelected(opt.id)}
                style={[styles.option, active && styles.optionActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={opt.label}
              >
                <View style={styles.optionTextWrap}>
                  <Text
                    style={[
                      styles.optionLabel,
                      active && styles.optionLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
                </View>
                {active ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.oxblood} />
                ) : (
                  <Ionicons name="ellipse-outline" size={22} color={colors.stone} />
                )}
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}

        <Pressable
          onPress={onSave}
          disabled={!selected || saving}
          style={[styles.cta, (!selected || saving) && styles.ctaDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Save practice type"
        >
          {saving ? (
            <ActivityIndicator color={colors.bone} />
          ) : (
            <Text style={styles.ctaText}>Save and continue</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bone },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: spacing.lg, justifyContent: 'flex-start' },
  eyebrow: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.stone,
  },
  headline: {
    fontFamily: typography.families.serif,
    fontSize: 32,
    lineHeight: 36,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  lede: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.stone,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.cream,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cream,
  },
  optionActive: { borderColor: colors.oxblood },
  optionTextWrap: { flex: 1 },
  optionLabel: {
    ...typography.scale.bodyMd,
    fontFamily: typography.families.medium,
    color: colors.ink,
  },
  optionLabelActive: { color: colors.oxblood },
  optionSubtitle: {
    ...typography.scale.bodySmall,
    fontFamily: typography.families.regular,
    color: colors.stone,
    marginTop: 2,
  },
  error: {
    ...typography.scale.bodySmall,
    fontFamily: typography.families.regular,
    color: colors.oxblood,
    marginTop: spacing.md,
  },
  cta: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.oxblood,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: {
    ...typography.scale.bodyMd,
    fontFamily: typography.families.medium,
    color: colors.bone,
  },
});
