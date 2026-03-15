// Full 16-question onboarding quiz with 5 phases
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { NumberInput } from '../../src/components/ui/NumberInput';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { Card } from '../../src/components/ui/Card';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
import { onboardingApi } from '../../src/services/api';
import type { OnboardingData, AccountType, MotivationStyle } from '../../src/types';
import { formatCurrency } from '../../src/utils/formatters';
import { computeNetWorth } from '../../src/utils/financial';

const TOTAL_QUESTIONS = 17; // 16 Q + Future Self Letter

export default function OnboardingQuiz() {
  const router = useRouter();
  const { setProfile } = useAuthStore();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Temp state for multi-item entries
  const [tempIncomeSources, setTempIncomeSources] = useState<Array<{ source: string; amount: string }>>([]);
  const [showSnapshot, setShowSnapshot] = useState(false);

  const progress = (step / TOTAL_QUESTIONS) * 100;

  const goNext = () => {
    if (step < TOTAL_QUESTIONS) setStep(step + 1);
    else handleSubmit();
  };

  const goPrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data: responseData } = await onboardingApi.submit(data as Record<string, unknown>);
      if (responseData.profile) setProfile(responseData.profile);
      setShowSnapshot(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to save your profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showSnapshot) {
    return <FinancialSnapshot data={data} onContinue={() => router.replace('/(tabs)')} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Progress bar */}
      <View style={styles.progressHeader}>
        <TouchableOpacity onPress={goPrev} disabled={step === 1} style={styles.backBtn}>
          <Text style={[styles.backText, step === 1 && { opacity: 0 }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.stepCounter}>{step} of {TOTAL_QUESTIONS}</Text>
        <View style={{ width: 60 }} />
      </View>
      <ProgressBar progress={progress} height={3} variant="gold" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderQuestion(step, data, setData, tempIncomeSources, setTempIncomeSources)}

        <Button
          title={step === TOTAL_QUESTIONS ? 'Complete Setup' : 'Continue →'}
          onPress={goNext}
          loading={isSubmitting && step === TOTAL_QUESTIONS}
          fullWidth
          size="lg"
          style={styles.nextBtn}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function renderQuestion(
  step: number,
  data: OnboardingData,
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>,
  tempIncomeSources: Array<{ source: string; amount: string }>,
  setTempIncomeSources: React.Dispatch<React.SetStateAction<Array<{ source: string; amount: string }>>>
) {
  switch (step) {
    // ─── Phase 1: Income ───────────────────────────────────────────────
    case 1:
      return (
        <QuestionBlock
          phase="INCOME"
          title="What's your gross monthly income?"
          description="Enter your total monthly gross income before taxes."
        >
          <NumberInput
            label="Monthly Gross Income"
            value={String(data.monthly_income_gross || '')}
            onChangeValue={(v, n) => setData({ ...data, monthly_income_gross: n, annual_income_gross: n * 12 })}
            placeholder="5500"
          />
          {data.monthly_income_gross && (
            <Text style={styles.hint}>
              Annual: {formatCurrency((data.monthly_income_gross || 0) * 12, { compact: true })}
            </Text>
          )}
        </QuestionBlock>
      );

    case 2:
      return (
        <QuestionBlock phase="INCOME" title="Do you have additional income sources?" description="Freelance, rental, dividends, side business, etc.">
          <View style={styles.yesNoRow}>
            <ChoiceCard
              label="Yes, add them"
              isSelected={!!data.income_sources && data.income_sources.length > 0}
              onPress={() => setData({ ...data, income_sources: [{ source: '', amount: 0, frequency: 'monthly' }] })}
            />
            <ChoiceCard
              label="No, just my salary"
              isSelected={!data.income_sources || data.income_sources.length === 0}
              onPress={() => setData({ ...data, income_sources: [] })}
            />
          </View>
          {data.income_sources && data.income_sources.length > 0 && (
            <View style={styles.sourceList}>
              {data.income_sources.map((src, i) => (
                <View key={i} style={styles.sourceRow}>
                  <TextInput
                    value={src.source}
                    onChangeText={(t) => {
                      const updated = [...data.income_sources!];
                      updated[i].source = t;
                      setData({ ...data, income_sources: updated });
                    }}
                    placeholder="e.g., Freelance design"
                    placeholderTextColor={Colors.slateGray}
                    style={styles.sourceInput}
                  />
                  <TextInput
                    value={src.amount ? String(src.amount) : ''}
                    onChangeText={(t) => {
                      const updated = [...data.income_sources!];
                      updated[i].amount = parseFloat(t) || 0;
                      setData({ ...data, income_sources: updated });
                    }}
                    placeholder="$/mo"
                    placeholderTextColor={Colors.slateGray}
                    keyboardType="decimal-pad"
                    style={[styles.sourceInput, { width: 80 }]}
                  />
                </View>
              ))}
              <TouchableOpacity
                onPress={() => setData({ ...data, income_sources: [...(data.income_sources || []), { source: '', amount: 0, frequency: 'monthly' }] })}
              >
                <Text style={styles.addLink}>+ Add another source</Text>
              </TouchableOpacity>
            </View>
          )}
        </QuestionBlock>
      );

    case 3:
      return (
        <QuestionBlock phase="INCOME" title="Are you self-employed or do you own a business?" description="This affects tax estimates and planning recommendations.">
          <View style={styles.yesNoRow}>
            <ChoiceCard label="Self-employed" icon="💼" isSelected={!!data.is_self_employed} onPress={() => setData({ ...data, is_self_employed: true })} />
            <ChoiceCard label="Business owner" icon="🏢" isSelected={!!data.has_business} onPress={() => setData({ ...data, has_business: true })} />
            <ChoiceCard label="Neither (W-2)" icon="🧑‍💻" isSelected={!data.is_self_employed && !data.has_business} onPress={() => setData({ ...data, is_self_employed: false, has_business: false })} />
          </View>
        </QuestionBlock>
      );

    // ─── Phase 2: Assets ───────────────────────────────────────────────
    case 4:
      return (
        <QuestionBlock phase="ASSETS" title="How much do you have in checking accounts?" description="Add each checking account you have.">
          <AccountAdder
            label="Checking Account"
            accounts={data.checking_accounts || []}
            onChange={(accounts) => setData({ ...data, checking_accounts: accounts })}
          />
        </QuestionBlock>
      );

    case 5:
      return (
        <QuestionBlock phase="ASSETS" title="How much do you have in savings accounts?" description="Add each savings account.">
          <AccountAdder
            label="Savings Account"
            accounts={data.savings_accounts || []}
            onChange={(accounts) => setData({ ...data, savings_accounts: accounts })}
          />
        </QuestionBlock>
      );

    case 6:
      return (
        <QuestionBlock phase="ASSETS" title="Do you have any investments?" description="Brokerage, 401(k), IRA, or other investment accounts.">
          <View style={styles.yesNoRow}>
            <ChoiceCard label="Yes" isSelected={!!data.investment_accounts?.length} onPress={() => setData({ ...data, investment_accounts: [{ name: '', type: 'investment_brokerage', balance: 0 }] })} />
            <ChoiceCard label="Not yet" isSelected={!data.investment_accounts?.length} onPress={() => setData({ ...data, investment_accounts: [] })} />
          </View>
          {!!data.investment_accounts?.length && (
            <AccountAdder
              label="Investment Account"
              accounts={data.investment_accounts.map(a => ({ name: a.name, balance: a.balance }))}
              onChange={(accounts) => setData({ ...data, investment_accounts: accounts.map(a => ({ ...a, type: 'investment_brokerage' as AccountType })) })}
            />
          )}
        </QuestionBlock>
      );

    case 7:
      return (
        <QuestionBlock phase="ASSETS" title="Do you own real estate or vehicles?" description="Enter estimated current market value.">
          <View style={styles.yesNoRow}>
            <ChoiceCard label="Yes" isSelected={!!data.real_estate?.length || !!data.vehicles?.length} onPress={() => setData({ ...data, real_estate: [], vehicles: [{ name: '', value: 0 }] })} />
            <ChoiceCard label="No" isSelected={!data.real_estate?.length && !data.vehicles?.length} onPress={() => setData({ ...data, real_estate: [], vehicles: [] })} />
          </View>
        </QuestionBlock>
      );

    // ─── Phase 3: Debts ────────────────────────────────────────────────
    case 8:
      return (
        <QuestionBlock phase="DEBTS" title="Do you have credit card debt?" description="Enter balance, APR, and minimum payment for each card.">
          <View style={styles.yesNoRow}>
            <ChoiceCard label="Yes" isSelected={!!data.credit_cards?.length} onPress={() => setData({ ...data, credit_cards: [{ name: '', balance: 0, apr: 0, minimum_payment: 0 }] })} />
            <ChoiceCard label="No" isSelected={!data.credit_cards?.length} onPress={() => setData({ ...data, credit_cards: [] })} />
          </View>
          {!!data.credit_cards?.length && (
            <DebtAdder
              debts={data.credit_cards}
              onChange={(debts) => setData({ ...data, credit_cards: debts })}
              placeholder="e.g., Chase Sapphire"
            />
          )}
        </QuestionBlock>
      );

    case 9:
      return (
        <QuestionBlock phase="DEBTS" title="Do you have any loans?" description="Student loans, auto loans, personal loans, medical debt.">
          <View style={styles.yesNoRow}>
            <ChoiceCard label="Yes" isSelected={!!data.loans?.length} onPress={() => setData({ ...data, loans: [{ name: '', type: 'student_loan', balance: 0, apr: 0, minimum_payment: 0 }] })} />
            <ChoiceCard label="No" isSelected={!data.loans?.length} onPress={() => setData({ ...data, loans: [] })} />
          </View>
          {!!data.loans?.length && (
            <DebtAdder
              debts={data.loans as any}
              onChange={(debts) => setData({ ...data, loans: debts as any })}
              placeholder="e.g., Sallie Mae"
            />
          )}
        </QuestionBlock>
      );

    case 10:
      return (
        <QuestionBlock phase="DEBTS" title="Do you have a mortgage?" description="Enter your outstanding balance and monthly payment.">
          <View style={styles.yesNoRow}>
            <ChoiceCard label="Yes" isSelected={!!data.mortgage} onPress={() => setData({ ...data, mortgage: { property_value: 0, balance: 0, apr: 0, monthly_payment: 0 } })} />
            <ChoiceCard label="No" isSelected={!data.mortgage} onPress={() => setData({ ...data, mortgage: undefined })} />
          </View>
          {!!data.mortgage && (
            <View style={styles.debtForm}>
              <NumberInput label="Outstanding Balance" value={String(data.mortgage.balance || '')} onChangeValue={(v, n) => setData({ ...data, mortgage: { ...data.mortgage!, balance: n } })} />
              <NumberInput label="APR %" value={String(data.mortgage.apr || '')} onChangeValue={(v, n) => setData({ ...data, mortgage: { ...data.mortgage!, apr: n } })} prefix="" suffix="%" />
              <NumberInput label="Monthly Payment" value={String(data.mortgage.monthly_payment || '')} onChangeValue={(v, n) => setData({ ...data, mortgage: { ...data.mortgage!, monthly_payment: n } })} />
            </View>
          )}
        </QuestionBlock>
      );

    // ─── Phase 4: Location ─────────────────────────────────────────────
    case 11:
      return (
        <QuestionBlock phase="LOCATION" title="Where do you currently live?" description="Used for tax estimates and relocation What-If scenarios.">
          <TextInput
            value={data.country || ''}
            onChangeText={(t) => setData({ ...data, country: t })}
            placeholder="Country (e.g., United States)"
            placeholderTextColor={Colors.slateGray}
            style={styles.textInputFull}
          />
          <TextInput
            value={data.state || ''}
            onChangeText={(t) => setData({ ...data, state: t })}
            placeholder="State (e.g., TX)"
            placeholderTextColor={Colors.slateGray}
            style={styles.textInputFull}
          />
          <TextInput
            value={data.city || ''}
            onChangeText={(t) => setData({ ...data, city: t })}
            placeholder="City (e.g., Austin)"
            placeholderTextColor={Colors.slateGray}
            style={styles.textInputFull}
          />
        </QuestionBlock>
      );

    // ─── Phase 5: Goals ────────────────────────────────────────────────
    case 12:
      return (
        <QuestionBlock phase="GOALS" title="What's your primary financial goal right now?" description="Choose the one that resonates most.">
          {[
            'Get out of debt',
            'Build an emergency fund',
            'Start investing',
            'Buy a home',
            'Build a business',
            'Reach financial independence',
            'Increase income significantly',
          ].map((goal) => (
            <TouchableOpacity
              key={goal}
              style={[styles.goalOption, data.primary_goal === goal && styles.goalSelected]}
              onPress={() => setData({ ...data, primary_goal: goal })}
            >
              <Text style={[styles.goalText, data.primary_goal === goal && styles.goalTextSelected]}>{goal}</Text>
            </TouchableOpacity>
          ))}
        </QuestionBlock>
      );

    case 13:
      return (
        <QuestionBlock phase="GOALS" title="What's your timeline for this goal?" description="How many months do you want to achieve this in?">
          <NumberInput
            label="Goal Timeline (months)"
            value={String(data.goal_timeline_months || '')}
            onChangeValue={(v, n) => setData({ ...data, goal_timeline_months: n })}
            prefix=""
            suffix=" months"
            placeholder="24"
          />
          {data.goal_timeline_months && (
            <Text style={styles.hint}>
              That's about {Math.round((data.goal_timeline_months || 0) / 12 * 10) / 10} years from now.
            </Text>
          )}
        </QuestionBlock>
      );

    case 14:
      return (
        <QuestionBlock phase="GOALS" title="Describe your dream lifestyle in detail." description="Be specific. Where do you live? What does your typical day look like? How much do you work?">
          <TextInput
            value={data.dream_description || ''}
            onChangeText={(t) => setData({ ...data, dream_description: t })}
            placeholder="Own a home in Austin, work remotely on my business, make $15K/mo, work out daily, travel 3x/year..."
            placeholderTextColor={Colors.slateGray}
            style={styles.textareaInput}
            multiline
            numberOfLines={5}
            maxLength={500}
          />
          <Text style={styles.charCount}>{(data.dream_description || '').length}/500</Text>
        </QuestionBlock>
      );

    case 15:
      return (
        <QuestionBlock phase="GOALS" title="How much would that dream lifestyle cost per month?" description="Your FI number is based on this amount.">
          <NumberInput
            label="Dream Monthly Cost"
            value={String(data.dream_lifestyle_cost_mo || '')}
            onChangeValue={(v, n) => setData({ ...data, dream_lifestyle_cost_mo: n })}
            placeholder="8000"
          />
          {data.dream_lifestyle_cost_mo && (
            <Text style={styles.hint}>
              Your FI number: {formatCurrency((data.dream_lifestyle_cost_mo * 12) / 0.04, { compact: true })} (4% rule)
            </Text>
          )}
        </QuestionBlock>
      );

    case 16:
      return (
        <QuestionBlock phase="GOALS" title="What motivates you more?" description="This determines whether we recommend Snowball or Avalanche debt payoff.">
          <View style={styles.motivationRow}>
            <ChoiceCard
              label="Small Wins"
              icon="✅"
              description="I love checking boxes and seeing progress"
              isSelected={data.motivation_style === 'small_wins'}
              onPress={() => setData({ ...data, motivation_style: 'small_wins' })}
            />
            <ChoiceCard
              label="Big Picture"
              icon="🏔️"
              description="Show me the end goal — I'll stay focused"
              isSelected={data.motivation_style === 'big_picture'}
              onPress={() => setData({ ...data, motivation_style: 'big_picture' })}
            />
          </View>
        </QuestionBlock>
      );

    case 17:
      return (
        <QuestionBlock phase="FUTURE SELF" title="Write a letter to yourself 90 days from now." description="What do you want to report back? Be honest about where you are and what you'll accomplish.">
          <TextInput
            value={data.future_self_letter || ''}
            onChangeText={(t) => setData({ ...data, future_self_letter: t })}
            placeholder="Hey future me, when you read this in 90 days, I want you to have..."
            placeholderTextColor={Colors.slateGray}
            style={styles.textareaInput}
            multiline
            numberOfLines={8}
            maxLength={1000}
          />
          <Text style={styles.hint}>We'll deliver this letter in exactly 90 days. 📬</Text>
        </QuestionBlock>
      );

    default:
      return null;
  }
}

// Reusable components

function QuestionBlock({ phase, title, description, children }: {
  phase: string; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <View style={styles.questionBlock}>
      <Text style={styles.phase}>{phase}</Text>
      <Text style={styles.questionTitle}>{title}</Text>
      <Text style={styles.questionDesc}>{description}</Text>
      <View style={styles.questionBody}>{children}</View>
    </View>
  );
}

function ChoiceCard({ label, icon, description, isSelected, onPress }: {
  label: string; icon?: string; description?: string; isSelected: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.choiceCard, isSelected && styles.choiceSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {icon && <Text style={styles.choiceIcon}>{icon}</Text>}
      <Text style={[styles.choiceLabel, isSelected && styles.choiceLabelSelected]}>{label}</Text>
      {description && <Text style={styles.choiceDesc}>{description}</Text>}
    </TouchableOpacity>
  );
}

function AccountAdder({ label, accounts, onChange }: {
  label: string;
  accounts: Array<{ name: string; balance: number }>;
  onChange: (accounts: Array<{ name: string; balance: number }>) => void;
}) {
  const list = accounts.length ? accounts : [{ name: '', balance: 0 }];

  return (
    <View>
      {list.map((acc, i) => (
        <View key={i} style={styles.accountRow}>
          <TextInput
            value={acc.name}
            onChangeText={(t) => { const u = [...list]; u[i].name = t; onChange(u); }}
            placeholder={`${label} name (e.g., Chase)`}
            placeholderTextColor={Colors.slateGray}
            style={[styles.sourceInput, { flex: 1 }]}
          />
          <TextInput
            value={acc.balance ? String(acc.balance) : ''}
            onChangeText={(t) => { const u = [...list]; u[i].balance = parseFloat(t) || 0; onChange(u); }}
            placeholder="$Balance"
            placeholderTextColor={Colors.slateGray}
            keyboardType="decimal-pad"
            style={[styles.sourceInput, { width: 100 }]}
          />
        </View>
      ))}
      <TouchableOpacity onPress={() => onChange([...list, { name: '', balance: 0 }])}>
        <Text style={styles.addLink}>+ Add another</Text>
      </TouchableOpacity>
    </View>
  );
}

function DebtAdder({ debts, onChange, placeholder }: {
  debts: Array<{ name: string; balance: number; apr: number; minimum_payment: number }>;
  onChange: (debts: Array<{ name: string; balance: number; apr: number; minimum_payment: number }>) => void;
  placeholder: string;
}) {
  const list = debts.length ? debts : [{ name: '', balance: 0, apr: 0, minimum_payment: 0 }];

  return (
    <View>
      {list.map((debt, i) => (
        <View key={i} style={styles.debtForm}>
          <TextInput
            value={debt.name}
            onChangeText={(t) => { const u = [...list]; u[i].name = t; onChange(u); }}
            placeholder={placeholder}
            placeholderTextColor={Colors.slateGray}
            style={styles.textInputFull}
          />
          <View style={styles.debtRow3}>
            <NumberInput label="Balance" value={String(debt.balance || '')} onChangeValue={(v, n) => { const u = [...list]; u[i].balance = n; onChange(u); }} containerStyle={{ flex: 1 }} />
            <NumberInput label="APR %" value={String(debt.apr || '')} onChangeValue={(v, n) => { const u = [...list]; u[i].apr = n; onChange(u); }} prefix="" suffix="%" containerStyle={{ flex: 1 }} />
            <NumberInput label="Min Payment" value={String(debt.minimum_payment || '')} onChangeValue={(v, n) => { const u = [...list]; u[i].minimum_payment = n; onChange(u); }} containerStyle={{ flex: 1 }} />
          </View>
        </View>
      ))}
      <TouchableOpacity onPress={() => onChange([...list, { name: '', balance: 0, apr: 0, minimum_payment: 0 }])}>
        <Text style={styles.addLink}>+ Add another</Text>
      </TouchableOpacity>
    </View>
  );
}

function FinancialSnapshot({ data, onContinue }: { data: OnboardingData; onContinue: () => void }) {
  // Compute net worth from entered data
  const allAssets = [
    ...(data.checking_accounts || []).map(a => ({ balance: a.balance, is_debt: false })),
    ...(data.savings_accounts || []).map(a => ({ balance: a.balance, is_debt: false })),
    ...(data.investment_accounts || []).map(a => ({ balance: a.balance, is_debt: false })),
    ...(data.real_estate || []).map(a => ({ balance: a.value, is_debt: false })),
    ...(data.vehicles || []).map(a => ({ balance: a.value, is_debt: false })),
  ];
  const allDebts = [
    ...(data.credit_cards || []).map(d => ({ balance: d.balance, is_debt: true })),
    ...(data.loans || []).map(d => ({ balance: d.balance, is_debt: true })),
    ...(data.mortgage ? [{ balance: data.mortgage.balance, is_debt: true }] : []),
  ];

  const totalAssets = allAssets.reduce((s, a) => s + a.balance, 0);
  const totalDebt = allDebts.reduce((s, d) => s + d.balance, 0);
  const netWorth = totalAssets - totalDebt;
  const incomeGap = (data.dream_lifestyle_cost_mo || 0) - (data.monthly_income_gross || 0) * 0.75;

  return (
    <View style={styles.snapshot}>
      <Text style={styles.snapTitle}>Your Financial Snapshot</Text>

      <Text style={styles.snapNetWorthLabel}>NET WORTH</Text>
      <Text style={[styles.snapNetWorth, { color: netWorth >= 0 ? Colors.accentGold : Colors.debtCrimson }]}>
        {formatCurrency(netWorth)}
      </Text>

      <View style={styles.snapStats}>
        <View style={styles.snapStat}>
          <Text style={styles.snapStatLabel}>Total Assets</Text>
          <Text style={[styles.snapStatValue, { color: Colors.profitGreen }]}>{formatCurrency(totalAssets, { compact: true })}</Text>
        </View>
        <View style={styles.snapStat}>
          <Text style={styles.snapStatLabel}>Total Debt</Text>
          <Text style={[styles.snapStatValue, { color: Colors.debtCrimson }]}>{formatCurrency(totalDebt, { compact: true })}</Text>
        </View>
      </View>

      <Card variant="gold" style={styles.snapPriority}>
        <Text style={styles.snapPriorityLabel}>YOUR FIRST PRIORITY</Text>
        <Text style={styles.snapPriorityText}>
          {totalDebt > 1000 ? 'Build $1,000 cash buffer, then eliminate high-APR debt' : 'Build your $1,000 cash buffer'}
        </Text>
      </Card>

      {incomeGap > 0 && (
        <Text style={styles.snapGap}>
          Income gap to dream lifestyle: <Text style={styles.snapGapValue}>{formatCurrency(incomeGap, { compact: true })}/mo</Text>
        </Text>
      )}

      <Button title="Enter Command Center →" onPress={onContinue} variant="primary" fullWidth size="lg" style={styles.snapBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingTop: Spacing.section, paddingBottom: Spacing.sm },
  backBtn: { width: 60 },
  backText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  stepCounter: { fontFamily: 'JetBrainsMono_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  content: { padding: Spacing.xl, paddingBottom: Spacing.section },
  questionBlock: { marginBottom: Spacing.xl },
  phase: { fontFamily: 'Inter_700Bold', fontSize: Typography.microLabel, color: Colors.accentGold, letterSpacing: 2, marginBottom: Spacing.sm },
  questionTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.displaySmall, color: Colors.frostWhite, marginBottom: Spacing.sm },
  questionDesc: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, lineHeight: 22, marginBottom: Spacing.xl },
  questionBody: { gap: Spacing.md },
  hint: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold, textAlign: 'center' },
  charCount: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, textAlign: 'right' },
  nextBtn: { marginTop: Spacing.xxl },
  yesNoRow: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  motivationRow: { flexDirection: 'column', gap: Spacing.md },
  choiceCard: { flex: 1, minWidth: 140, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.graphiteBorder, alignItems: 'center', gap: 4, backgroundColor: Colors.cardSurfaceNavy },
  choiceSelected: { borderColor: Colors.accentGold, backgroundColor: 'rgba(249,199,79,0.08)' },
  choiceIcon: { fontSize: 24 },
  choiceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray, textAlign: 'center' },
  choiceLabelSelected: { color: Colors.accentGold },
  choiceDesc: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, textAlign: 'center' },
  sourceList: { gap: Spacing.sm, marginTop: Spacing.md },
  sourceRow: { flexDirection: 'row', gap: Spacing.sm },
  accountRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  sourceInput: { backgroundColor: Colors.cardSurfaceNavy, borderWidth: 1, borderColor: Colors.graphiteBorder, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.frostWhite },
  addLink: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.accentGold, paddingVertical: Spacing.sm },
  goalOption: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.base, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.graphiteBorder, backgroundColor: Colors.cardSurfaceNavy, marginBottom: Spacing.sm },
  goalSelected: { borderColor: Colors.accentGold, backgroundColor: 'rgba(249,199,79,0.08)' },
  goalText: { fontFamily: 'Inter_500Medium', fontSize: Typography.bodyMedium, color: Colors.slateGray },
  goalTextSelected: { color: Colors.accentGold },
  textInputFull: { backgroundColor: Colors.cardSurfaceNavy, borderWidth: 1, borderColor: Colors.graphiteBorder, borderRadius: 10, padding: Spacing.base, fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.sm },
  textareaInput: { backgroundColor: Colors.cardSurfaceNavy, borderWidth: 1, borderColor: Colors.graphiteBorder, borderRadius: 10, padding: Spacing.base, fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite, minHeight: 120, textAlignVertical: 'top' },
  debtForm: { gap: Spacing.sm, marginBottom: Spacing.md },
  debtRow3: { flexDirection: 'row', gap: Spacing.sm },
  snapshot: { flex: 1, backgroundColor: Colors.backgroundDeepNavy, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  snapTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.displayMedium, color: Colors.frostWhite, textAlign: 'center', marginBottom: Spacing.xl },
  snapNetWorthLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray, letterSpacing: 2, marginBottom: Spacing.sm },
  snapNetWorth: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.heroNumber, textAlign: 'center', marginBottom: Spacing.xl },
  snapStats: { flexDirection: 'row', gap: Spacing.xl, marginBottom: Spacing.xl },
  snapStat: { alignItems: 'center' },
  snapStatLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  snapStatValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.titleSmall },
  snapPriority: { width: '100%', padding: Spacing.base, marginBottom: Spacing.base },
  snapPriorityLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.microLabel, color: Colors.accentGold, letterSpacing: 1.5, marginBottom: Spacing.xs },
  snapPriorityText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.frostWhite },
  snapGap: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, textAlign: 'center', marginBottom: Spacing.xl },
  snapGapValue: { color: Colors.amberWarning, fontFamily: 'JetBrainsMono_400Regular' },
  snapBtn: { marginTop: Spacing.base },
});
