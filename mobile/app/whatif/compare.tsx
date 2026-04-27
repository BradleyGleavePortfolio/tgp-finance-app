// Compare saved What-If scenarios side by side
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../src/components/ui/Card';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { useWhatIfStore } from '../../src/stores/whatifStore';
import { formatCurrency } from '../../src/utils/formatters';

export default function WhatIfCompare() {
  const router = useRouter();
  const { savedScenarios, fetchSaved, deleteScenario } = useWhatIfStore();

  useEffect(() => { fetchSaved(); }, []);

  const handleDelete = (id: string, label: string) => {
    Alert.alert(
      'Delete Scenario',
      `Remove "${label}" from your saved scenarios?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteScenario(id),
        },
      ],
    );
  };

  const compareScenarios = savedScenarios.slice(0, 3);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Compare Scenarios</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {compareScenarios.length < 2 ? (
          <EmptyState
            eyebrow="COMPARE"
            title="Two scenarios required."
            description="Save at least two What-If scenarios to compare them side by side."
            actionText="Run a scenario"
            onAction={() => router.push('/whatif')}
          />
        ) : (
          <View>
            <Text style={styles.subtitle}>Comparing your top {compareScenarios.length} saved scenarios:</Text>
            <View style={styles.grid}>
              {compareScenarios.map((s, i) => (
                <Card key={s.id} style={styles.scenarioCard}>
                  <View style={styles.scenarioCardHeader}>
                    <Text style={[styles.scenarioLabel, { flex: 1 }]}>{s.label}</Text>
                    <TouchableOpacity
                      onPress={() => handleDelete(s.id, s.label)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${s.label} scenario`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.debtCrimson} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.headline}>{s.result_summary?.headline}</Text>

                  {s.result_summary?.keyMetrics?.slice(0, 2).map((m: any, j: number) => (
                    <View key={j} style={styles.metricRow}>
                      <Text style={styles.metricLabel}>{m.label}</Text>
                      <Text style={[styles.metricValue, { color: m.positive ? Colors.profitGreen : Colors.debtCrimson }]}>
                        {m.value}
                      </Text>
                    </View>
                  ))}

                  {s.projection_10yr && (
                    <View style={styles.projRow}>
                      <Text style={styles.projLabel}>10yr Net Worth</Text>
                      <Text style={styles.projValue}>{formatCurrency(s.projection_10yr, { compact: true })}</Text>
                    </View>
                  )}
                </Card>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  content: { padding: Spacing.base, paddingBottom: 100 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, marginBottom: Spacing.xl },
  grid: { gap: Spacing.md },
  scenarioCard: { padding: Spacing.base, gap: Spacing.sm },
  scenarioCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs },
  scenarioLabel: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.accentGold },
  headline: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.frostWhite, fontStyle: 'italic' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  metricValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall },
  projRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.graphiteBorder },
  projLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray },
  projValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.accentGold },
});
