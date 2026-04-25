// Milestones detail screen
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MilestoneCard } from '../src/components/milestones/MilestoneCard';
import { CelebrationModal } from '../src/components/milestones/CelebrationModal';
import { ProgressBar } from '../src/components/ui/ProgressBar';
import { Colors, Typography, Spacing } from '../src/theme/finance';
import { useMilestonesStore } from '../src/stores/milestonesStore';
import { MILESTONE_DEFINITIONS } from '../src/utils/constants';

export default function MilestonesScreen() {
  const router = useRouter();
  const { unlocked, pendingCelebration, fetchMilestones, dismissCelebration, isUnlocked } = useMilestonesStore();
  const [activeMilestone, setActiveMilestone] = React.useState<import('../src/types').MilestoneUnlock | null>(null);

  useEffect(() => { fetchMilestones(); }, []);

  const categories = ['cash', 'debt', 'net_worth', 'streak', 'income'] as const;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Milestones</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summary}>
          <Text style={styles.summaryText}>{unlocked.length}/{MILESTONE_DEFINITIONS.length} unlocked</Text>
          <ProgressBar progress={(unlocked.length / MILESTONE_DEFINITIONS.length) * 100} height={6} variant="gold" />
        </View>

        {categories.map((cat) => {
          const catMilestones = MILESTONE_DEFINITIONS.filter(m => m.category === cat);
          return (
            <View key={cat} style={styles.category}>
              <Text style={styles.categoryTitle}>
                {cat.replace('_', ' ').toUpperCase()}
              </Text>
              {catMilestones.map((def) => {
                const unlock = unlocked.find(u => u.milestone_key === def.key);
                return (
                  <MilestoneCard
                    key={def.key}
                    milestone={def}
                    isUnlocked={!!unlock}
                    unlockedAt={unlock?.unlocked_at}
                    onPress={unlock ? () => setActiveMilestone(unlock) : undefined}
                  />
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <CelebrationModal milestone={pendingCelebration || activeMilestone} onDismiss={() => { dismissCelebration(); setActiveMilestone(null); }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  content: { padding: Spacing.base, paddingBottom: 100 },
  summary: { marginBottom: Spacing.xl, gap: Spacing.sm },
  summaryText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray },
  category: { marginBottom: Spacing.xl },
  categoryTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.microLabel, color: Colors.slateGray, letterSpacing: 2, marginBottom: Spacing.md },
});
