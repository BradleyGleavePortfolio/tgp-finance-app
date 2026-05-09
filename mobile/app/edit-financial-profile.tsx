// Edit Financial Profile — Stage-1 fix.
//
// Stage-0 captured monthly_take_home / primary_goal / risk_tolerance /
// horizon at quiz time and offered no edit path afterwards. A user who
// tapped the wrong card had to live with it. This screen exposes every
// quiz-captured field plus the location/dream fields the backend already
// accepts on PUT /api/profile, so a user can keep their plan accurate
// without re-onboarding.
//
// Saving here writes through `useProfileStore.updateProfile`, which calls
// `profileApi.update` and rehydrates the store — every downstream
// consumer (income-gap, projections, what-if, FI number, milestones,
// priority waterfall) reads from the store, so derived values recompute
// on next render automatically.
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing } from '../src/theme/finance';
import { useAuthStore } from '../src/stores/authStore';
import { useProfileStore } from '../src/stores/profileStore';
import { profileApi, type ProfileUpdateInput } from '../src/services/api';
import { errorMessage } from '../src/lib/errorMessage';
import { track } from '../src/lib/analytics';
import * as Haptics from 'expo-haptics';

type RiskWire = 'conservative' | 'moderate' | 'aggressive';

const RISK_OPTIONS: { value: RiskWire; label: string; subtitle: string }[] = [
  { value: 'conservative', label: 'Conservative', subtitle: 'Protect what I have.' },
  { value: 'moderate',     label: 'Moderate',     subtitle: 'Balanced — some growth.' },
  { value: 'aggressive',   label: 'Aggressive',   subtitle: 'Long horizon. Comfortable with swings.' },
];

const GOAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'debt payoff',  label: 'Pay off debt' },
  { value: 'save more',    label: 'Save more' },
  { value: 'build wealth', label: 'Build wealth' },
];

// Horizon → months. Mirrors backend `mapInvestmentHorizon`.
const HORIZON_OPTIONS: { months: number; label: string }[] = [
  { months: 6,   label: 'Under a year' },
  { months: 24,  label: '1 — 3 years' },
  { months: 48,  label: '3 — 5 years' },
  { months: 120, label: '5 years or more' },
];

interface FormState {
  monthlyTakeHome: string;     // user-typed; converted to gross on save
  primaryGoal: string | null;
  riskTolerance: RiskWire | null;
  goalTimelineMonths: number | null;
  dreamCostMo: string;
  dreamDescription: string;
  state: string;
  city: string;
  country: string;
}

function profileToForm(p: {
  monthly_income_gross?: number;
  primary_goal?: string;
  goal_timeline_months?: number;
  dream_lifestyle_cost_mo?: number;
  dream_description?: string;
  risk_tolerance?: RiskWire;
  state?: string;
  city?: string;
  country?: string;
} | null | undefined): FormState {
  // Backend stores gross; user thinks in take-home. Reverse the gross-up.
  const grossMonthly = typeof p?.monthly_income_gross === 'number' ? p.monthly_income_gross : 0;
  const takeHomeApprox = grossMonthly > 0 ? Math.round(grossMonthly * 0.75) : 0;
  return {
    monthlyTakeHome: takeHomeApprox > 0 ? String(takeHomeApprox) : '',
    primaryGoal: p?.primary_goal ?? null,
    riskTolerance: p?.risk_tolerance ?? null,
    goalTimelineMonths: typeof p?.goal_timeline_months === 'number' ? p.goal_timeline_months : null,
    dreamCostMo: typeof p?.dream_lifestyle_cost_mo === 'number' && p.dream_lifestyle_cost_mo > 0
      ? String(p.dream_lifestyle_cost_mo)
      : '',
    dreamDescription: p?.dream_description ?? '',
    state: p?.state ?? '',
    city: p?.city ?? '',
    country: p?.country ?? 'US',
  };
}

function isValidMoney(raw: string): boolean {
  if (!raw) return true;
  return /^\d{1,12}(\.\d{0,2})?$/.test(raw);
}

export default function EditFinancialProfileScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { updateProfile } = useProfileStore();

  const initial = useMemo(() => profileToForm(profile), [profile]);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!isValidMoney(form.monthlyTakeHome)) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch { /* ignore */ }
      Alert.alert('Invalid take-home', 'Use digits only — up to two decimals.');
      return;
    }
    if (!isValidMoney(form.dreamCostMo)) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch { /* ignore */ }
      Alert.alert('Invalid dream cost', 'Use digits only — up to two decimals.');
      return;
    }

    const payload: ProfileUpdateInput = {};

    // Convert take-home → monthly + annual gross. Mirrors the backend
    // gross-up so the ProfileScreen / projections see a consistent value
    // immediately. Backend re-runs the same math on its side (and uses
    // Decimal) so server and client stay numerically aligned.
    const takeHome = parseFloat(form.monthlyTakeHome);
    if (Number.isFinite(takeHome) && takeHome > 0) {
      const monthlyGross = Math.round((takeHome / 0.75) * 100) / 100;
      payload.monthly_income_gross = monthlyGross;
      payload.annual_income_gross = Math.round(monthlyGross * 12 * 100) / 100;
    }

    if (form.primaryGoal !== null && form.primaryGoal !== profile?.primary_goal) {
      payload.primary_goal = form.primaryGoal;
    }
    if (form.riskTolerance !== null && form.riskTolerance !== profile?.risk_tolerance) {
      payload.risk_tolerance = form.riskTolerance;
    }
    if (form.goalTimelineMonths !== null && form.goalTimelineMonths !== profile?.goal_timeline_months) {
      payload.goal_timeline_months = form.goalTimelineMonths;
    }
    const dreamCost = parseFloat(form.dreamCostMo);
    if (Number.isFinite(dreamCost) && dreamCost > 0) {
      payload.dream_lifestyle_cost_mo = dreamCost;
    }
    if (form.dreamDescription && form.dreamDescription !== profile?.dream_description) {
      payload.dream_description = form.dreamDescription;
    }
    if (form.state) payload.state = form.state;
    if (form.city) payload.city = form.city;
    if (form.country) payload.country = form.country;

    if (Object.keys(payload).length === 0) {
      router.back();
      return;
    }

    setSaving(true);
    try {
      // Use `profileApi.update` directly (not `updateProfile`) so we get
      // the freshly-merged response back. Then push that into the store
      // by calling `updateProfile` — it already rehydrates from `data`.
      await updateProfile(payload);
      track('profile_edit_saved', {
        fields: Object.keys(payload),
        source: 'edit_financial_profile',
      });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* ignore */ }
      router.back();
    } catch (err) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch { /* ignore */ }
      Alert.alert("Couldn't save", errorMessage(err, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Financial profile</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lede}>
            These shape your projections, milestones, and priority waterfall.
            Update them anytime — the plan recalculates immediately.
          </Text>

          {/* ── Monthly take-home ─────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>MONTHLY TAKE-HOME</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>$</Text>
            <TextInput
              value={form.monthlyTakeHome}
              onChangeText={(t) => setField('monthlyTakeHome', t.replace(/[^\d.]/g, ''))}
              placeholder="5,200"
              placeholderTextColor={Colors.slateGray}
              keyboardType="decimal-pad"
              maxLength={10}
              style={styles.amountInput}
              accessibilityLabel="Monthly take-home pay"
            />
            <Text style={styles.amountSuffix}>/ mo</Text>
          </View>
          <Text style={styles.helperText}>After taxes — what hits the account.</Text>

          {/* ── Primary goal ─────────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { marginTop: Spacing.xl }]}>PRIMARY GOAL</Text>
          {GOAL_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.row, form.primaryGoal === opt.value && styles.rowSelected]}
              onPress={() => setField('primaryGoal', opt.value)}
              accessibilityRole="radio"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: form.primaryGoal === opt.value }}
            >
              <Text
                style={[
                  styles.rowLabel,
                  form.primaryGoal === opt.value && styles.rowLabelSelected,
                ]}
              >
                {opt.label}
              </Text>
              {form.primaryGoal === opt.value ? <Text style={styles.checkmark}>✓</Text> : null}
            </TouchableOpacity>
          ))}

          {/* ── Risk tolerance ───────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { marginTop: Spacing.xl }]}>RISK TOLERANCE</Text>
          {RISK_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.row, form.riskTolerance === opt.value && styles.rowSelected]}
              onPress={() => setField('riskTolerance', opt.value)}
              accessibilityRole="radio"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: form.riskTolerance === opt.value }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.rowLabel,
                    form.riskTolerance === opt.value && styles.rowLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.rowSubtitle}>{opt.subtitle}</Text>
              </View>
              {form.riskTolerance === opt.value ? <Text style={styles.checkmark}>✓</Text> : null}
            </TouchableOpacity>
          ))}

          {/* ── Goal timeline ────────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { marginTop: Spacing.xl }]}>GOAL TIMELINE</Text>
          {HORIZON_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.months}
              style={[styles.row, form.goalTimelineMonths === opt.months && styles.rowSelected]}
              onPress={() => setField('goalTimelineMonths', opt.months)}
              accessibilityRole="radio"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: form.goalTimelineMonths === opt.months }}
            >
              <Text
                style={[
                  styles.rowLabel,
                  form.goalTimelineMonths === opt.months && styles.rowLabelSelected,
                ]}
              >
                {opt.label}
              </Text>
              {form.goalTimelineMonths === opt.months ? <Text style={styles.checkmark}>✓</Text> : null}
            </TouchableOpacity>
          ))}

          {/* ── Dream lifestyle ──────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { marginTop: Spacing.xl }]}>DREAM LIFESTYLE COST</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>$</Text>
            <TextInput
              value={form.dreamCostMo}
              onChangeText={(t) => setField('dreamCostMo', t.replace(/[^\d.]/g, ''))}
              placeholder="12,000"
              placeholderTextColor={Colors.slateGray}
              keyboardType="decimal-pad"
              maxLength={10}
              style={styles.amountInput}
              accessibilityLabel="Dream lifestyle monthly cost"
            />
            <Text style={styles.amountSuffix}>/ mo</Text>
          </View>
          <Text style={styles.helperText}>The lifestyle you're working toward.</Text>

          <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>DREAM DESCRIPTION</Text>
          <TextInput
            value={form.dreamDescription}
            onChangeText={(t) => setField('dreamDescription', t)}
            placeholder="A small house, a quiet morning…"
            placeholderTextColor={Colors.slateGray}
            multiline
            numberOfLines={3}
            maxLength={280}
            style={styles.multilineInput}
            accessibilityLabel="Dream lifestyle description"
          />

          {/* ── Location ─────────────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { marginTop: Spacing.xl }]}>LOCATION</Text>
          <View style={styles.locationRow}>
            <TextInput
              value={form.city}
              onChangeText={(t) => setField('city', t)}
              placeholder="City"
              placeholderTextColor={Colors.slateGray}
              maxLength={64}
              style={[styles.input, { flex: 1 }]}
              accessibilityLabel="City"
            />
            <TextInput
              value={form.state}
              onChangeText={(t) => setField('state', t)}
              placeholder="State"
              placeholderTextColor={Colors.slateGray}
              maxLength={32}
              style={[styles.input, { width: 100 }]}
              accessibilityLabel="State"
            />
          </View>
          <TextInput
            value={form.country}
            onChangeText={(t) => setField('country', t.toUpperCase())}
            placeholder="Country (US, CA, GB, …)"
            placeholderTextColor={Colors.slateGray}
            maxLength={2}
            style={[styles.input, { marginTop: Spacing.sm }]}
            accessibilityLabel="Country"
            autoCapitalize="characters"
          />

          {/* ── Save ─────────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={Colors.backgroundDeepNavy} />
            ) : (
              <Text style={styles.saveBtnText}>SAVE</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footnote}>
            Your projections, milestones, and priority waterfall recalculate
            from these values. Update them as your situation changes.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
  },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  content: { padding: Spacing.base, paddingBottom: 80 },
  lede: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.microLabel,
    color: Colors.accentGold,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.graphiteBorder,
    backgroundColor: Colors.cardSurfaceNavy,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    marginBottom: 4,
  },
  amountPrefix: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.accentGold,
  },
  amountInput: {
    flex: 1,
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: Typography.titleSmall,
    color: Colors.frostWhite,
    padding: 0,
  },
  amountSuffix: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
  },
  helperText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    backgroundColor: Colors.cardSurfaceNavy,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  rowSelected: {
    borderColor: Colors.accentGold,
    backgroundColor: 'rgba(249,199,79,0.10)',
  },
  rowLabel: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  rowLabelSelected: { color: Colors.accentGold },
  rowSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySmall,
    color: Colors.slateGray,
    marginTop: 2,
  },
  checkmark: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.accentGold,
  },
  multilineInput: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  input: {
    backgroundColor: Colors.cardSurfaceNavy,
    borderWidth: 1,
    borderColor: Colors.graphiteBorder,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMedium,
    color: Colors.frostWhite,
  },
  locationRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  saveBtn: {
    backgroundColor: Colors.accentGold,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.bodyMedium,
    color: Colors.backgroundDeepNavy,
    letterSpacing: 2,
  },
  footnote: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.microLabel,
    color: Colors.slateGray,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: Spacing.md,
  },
});
