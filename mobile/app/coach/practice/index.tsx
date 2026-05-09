/**
 * Sprint A — coach practice picker (finance side).
 *
 * Lands here right after a successful coach promotion. The user has
 * just been promoted on the finance side; we need a stated practice
 * type so the fitness app can decide whether to mount the cross-pillar
 * surface.
 *
 * Symmetric write (Sprint A audit fix CR-6):
 *   1. PUT /api/coach/practice on finance (writes locally).
 *   2. setFitnessCoachPractice() mirrors the choice into fitness via
 *      the user's Supabase JWT plus ?propagate=false. Both backends
 *      accept the same JWKS, so no federation token is needed for
 *      this hop — the user is already authenticated on both sides.
 *
 * Failure modes the screen handles:
 *   - finance write fails -> red error text under the option list.
 *   - finance ok, fitness skipped (not_configured) or not_found
 *     (coach has not registered fitness yet) -> success, navigate
 *     forward. No banner: the fitness side will pick up on first
 *     open via the existing PRACTICE_NOT_SELECTED prompt.
 *   - finance ok, fitness degraded (5xx, timeout, auth) -> show a
 *     retry message matching the fitness side's PR #127 surface.
 *     The finance write already succeeded, so the user can dismiss
 *     and continue; we do not roll back.
 *
 * UX additions in this fix:
 *   - Back button in the header so a coach trapped on a federation
 *     failure has an escape hatch.
 *   - "Skip and configure later" link that lands on /coach so the
 *     coach can change their mind without re-entering the auth flow.
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
import { setFitnessCoachPractice } from '../../../src/services/fitnessApi';
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
      // Step 1: write to finance (local).
      await coachPracticeApi.set(selected);

      // Step 2: mirror to fitness. We never block the navigation on
      // a fitness federation failure once finance has succeeded — the
      // coach's choice is durable on the finance side, and the
      // fitness app will pick it up via the existing
      // PRACTICE_NOT_SELECTED prompt on next open. We DO surface a
      // retry message for `degraded` so the coach is informed.
      const outcome = await setFitnessCoachPractice(selected);
      if (outcome.kind === 'degraded') {
        // Match the fitness side's PR #127 copy so the wording is
        // consistent across both apps when federation fails.
        setError(
          "We couldn't sync your practice across both products. We'll retry automatically — you can also re-save from your coach settings later.",
        );
        // Stay on the screen so the coach sees the message; we still
        // unblock the Save button so they can retry the federation
        // hop without resetting their selection.
        return;
      }
      // skipped (no fitness URL configured) and not_found (coach has
      // no fitness account yet) are both silent successes from the
      // user's POV.
      router.replace('/coach');
    } catch (err) {
      setError(errorMessage(err, 'Could not save your practice. Try again.'));
    } finally {
      setSaving(false);
    }
  }, [router, selected]);

  const onSkip = useCallback(() => {
    router.replace('/coach');
  }, [router]);

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
      {/* Sprint A audit fix coach #4: back button so a coach trapped
          on the picker (e.g. by a flaky network) has an escape
          hatch instead of having to kill the app. */}
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={{ width: 32 }} />
      </View>
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

        {/* Sprint A audit fix coach #4: skip link so a coach who
            does not want to choose right now can land on /coach. */}
        <Pressable
          onPress={onSkip}
          style={styles.skipLink}
          accessibilityRole="button"
          accessibilityLabel="Skip and configure later"
        >
          <Text style={styles.skipLinkText}>Skip and configure later</Text>
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
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  skipLink: { alignSelf: 'center', marginTop: spacing.md, paddingVertical: 8 },
  skipLinkText: {
    ...typography.scale.bodySmall,
    fontFamily: typography.families.regular,
    color: colors.stone,
    textDecorationLine: 'underline',
  },
  ctaText: {
    ...typography.scale.bodyMd,
    fontFamily: typography.families.medium,
    color: colors.bone,
  },
});
