// Goals screen — sub-tabs: Priority | What-If | Projections | Milestones
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PriorityCard } from '../../src/components/home/PriorityCard';
import { ProjectionChart } from '../../src/components/charts/ProjectionChart';
import { MilestoneCard } from '../../src/components/milestones/MilestoneCard';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { usePriorityStore } from '../../src/stores/priorityStore';
import { useWhatIfStore } from '../../src/stores/whatifStore';
import { useMilestonesStore } from '../../src/stores/milestonesStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useAccountsStore } from '../../src/stores/accountsStore';
import { PRIORITY_WATERFALL, WHATIF_SCENARIOS, MILESTONE_DEFINITIONS } from '../../src/utils/constants';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { formatCurrency } from '../../src/utils/formatters';

type GoalsTab = 'priority' | 'whatif' | 'projections' | 'milestones';

export default function GoalsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<GoalsTab>('priority');
  const { currentPriority, allPriorities, fetchCurrent, fetchAll } = usePriorityStore();
  const { savedScenarios, fetchSaved } = useWhatIfStore();
  const { unlocked, fetchMilestones, isUnlocked } = useMilestonesStore();
  const { profile } = useAuthStore();
  const { netWorth, accounts } = useAccountsStore();

  useEffect(() => {
    fetchCurrent();
    fetchAll();
    fetchSaved();
    fetchMilestones();
  }, []);

  const tabs: Array<{ key: GoalsTab; label: string }> = [
    { key: 'priority', label: 'Priority' },
    { key: 'whatif', label: 'What-If' },
    { key: 'projections', label: 'Projections' },
    { key: 'milestones', label: 'Milestones' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Goals</Text>
      </View>

      {/* Sub-tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabs}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Priority sub-tab */}
      {activeTab === 'priority' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <PriorityCard priority={currentPriority} onNextStep={() => setActiveTab('whatif')} onViewAll={() => {}} />

          <View style={styles.waterfallSection}>
            <Text style={styles.sectionTitle}>Priority Waterfall</Text>
            {PRIORITY_WATERFALL.map((p, i) => {
              const isCurrent = i === (currentPriority?.index || 0);
              const isComplete = i < (currentPriority?.index || 0);
              return (
                <View key={p.index} style={[styles.waterfallItem, isCurrent && styles.waterfallCurrent, isComplete && styles.waterfallDone]}>
                  <Text style={styles.waterfallIndex}>{isComplete ? '✓' : isCurrent ? '→' : `${i}`}</Text>
                  <View style={styles.waterfallContent}>
                    <Text style={[styles.waterfallTitle, isCurrent && { color: Colors.accentGold }, isComplete && { color: Colors.profitGreen }]}>{p.title}</Text>
                    {isCurrent && currentPriority?.progressPercent !== undefined && (
                      <ProgressBar progress={currentPriority.progressPercent} height={4} variant="savings" style={{ marginTop: 4 }} />
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <Button title="→ Run What-If to accelerate" onPress={() => setActiveTab('whatif')} variant="outline" style={styles.whatifCta} />
        </ScrollView>
      )}

      {/* What-If sub-tab */}
      {activeTab === 'whatif' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>12 What-If Scenarios</Text>
          <View style={styles.scenarioGrid}>
            {WHATIF_SCENARIOS.map((scenario) => (
              <TouchableOpacity
                key={scenario.type}
                style={styles.scenarioCard}
                onPress={() => router.push(`/whatif/${scenario.type}`)}
                activeOpacity={0.8}
              >
                <Text style={styles.scenarioIcon}>{scenario.icon}</Text>
                <Text style={styles.scenarioTitle}>{scenario.title}</Text>
                <Text style={styles.scenarioDesc} numberOfLines={2}>{scenario.description}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {savedScenarios.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Saved Scenarios</Text>
              {savedScenarios.map((s) => (
                <Card key={s.id} style={styles.savedScenario}>
                  <Text style={styles.savedScenarioTitle}>{s.label}</Text>
                  <Text style={styles.savedScenarioDesc}>{s.result_summary?.headline}</Text>
                </Card>
              ))}
              {savedScenarios.length >= 2 && (
                <Button title="Compare Scenarios" onPress={() => router.push('/whatif/compare')} variant="outline" style={styles.compareBtn} />
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Projections sub-tab */}
      {activeTab === 'projections' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Net Worth Projection</Text>
          <Card style={styles.projCard}>
            <ProjectionChart
              currentNetWorth={netWorth}
              monthlyIncome={(profile?.monthly_income_gross || 5000) * 0.75}
              initialSavingsRate={20}
              showSliders
            />
          </Card>
          <Button title="Save as What-If Scenario" onPress={() => {}} variant="outline" style={styles.saveBtn} />
        </ScrollView>
      )}

      {/* Milestones sub-tab */}
      {activeTab === 'milestones' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>{unlocked.length} of {MILESTONE_DEFINITIONS.length} Milestones Unlocked</Text>
          <ProgressBar
            progress={(unlocked.length / MILESTONE_DEFINITIONS.length) * 100}
            height={6}
            variant="gold"
            style={styles.milestonesProgress}
          />
          {MILESTONE_DEFINITIONS.map((def) => {
            const unlock = unlocked.find((u) => u.milestone_key === def.key);
            return (
              <MilestoneCard
                key={def.key}
                milestone={def}
                isUnlocked={!!unlock}
                unlockedAt={unlock?.unlocked_at}
              />
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.sm },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleLarge, color: Colors.frostWhite },
  tabScroll: { flexGrow: 0 },
  tabs: { flexDirection: 'row', paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.base },
  tab: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.graphiteBorder },
  tabActive: { backgroundColor: Colors.accentGold, borderColor: Colors.accentGold },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray },
  tabTextActive: { color: Colors.backgroundDeepNavy },
  content: { padding: Spacing.base, paddingBottom: 100 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  waterfallSection: { marginTop: Spacing.xl },
  waterfallItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.md, borderLeftWidth: 2, borderLeftColor: Colors.graphiteBorder, paddingLeft: Spacing.base, marginLeft: Spacing.base },
  waterfallCurrent: { borderLeftColor: Colors.accentGold },
  waterfallDone: { borderLeftColor: Colors.profitGreen, opacity: 0.7 },
  waterfallIndex: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.slateGray, width: 20 },
  waterfallContent: { flex: 1 },
  waterfallTitle: { fontFamily: 'Inter_500Medium', fontSize: Typography.bodyMedium, color: Colors.slateGray },
  whatifCta: { marginTop: Spacing.xl },
  scenarioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  scenarioCard: { width: '31%', backgroundColor: Colors.cardSurfaceNavy, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.graphiteBorder, padding: Spacing.md, alignItems: 'center', gap: 4 },
  scenarioIcon: { fontSize: 24 },
  scenarioTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.frostWhite, textAlign: 'center' },
  scenarioDesc: { fontFamily: 'Inter_400Regular', fontSize: 9, color: Colors.slateGray, textAlign: 'center' },
  savedScenario: { padding: Spacing.md, marginBottom: Spacing.sm },
  savedScenarioTitle: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  savedScenarioDesc: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  compareBtn: { marginTop: Spacing.base },
  projCard: { padding: Spacing.base },
  saveBtn: { marginTop: Spacing.base },
  milestonesProgress: { marginBottom: Spacing.xl },
});
