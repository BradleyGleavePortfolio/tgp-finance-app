// Net Worth Projections — standalone interactive screen
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../src/components/ui/Card';
import { ProjectionChart } from '../src/components/charts/ProjectionChart';
import { Button } from '../src/components/ui/Button';
import { Colors, Typography, Spacing } from '../src/theme/finance';
import { useAuthStore } from '../src/stores/authStore';
import { useAccountsStore } from '../src/stores/accountsStore';

export default function ProjectionsScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { netWorth } = useAccountsStore();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Net Worth Projections</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Adjust the sliders to model different scenarios. See your projected net worth.</Text>

        <Card style={styles.chartCard}>
          <ProjectionChart
            currentNetWorth={netWorth}
            monthlyIncome={(profile?.monthly_income_gross || 5000) * 0.75}
            initialSavingsRate={20}
            showSliders
          />
        </Card>

        <Text style={styles.saveHint}>
          Want to save a named scenario? Open a specific What-If (e.g. Retire Early,
          Income Increase, Extra Debt Payment) — those have a Save button that persists
          your inputs to your What-If library.
        </Text>
        <Button
          title="Browse What-If Scenarios"
          onPress={() => router.push('/(tabs)/goals')}
          variant="outline"
          fullWidth
          style={styles.saveBtn}
        />
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
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, marginBottom: Spacing.xl },
  chartCard: { padding: Spacing.base, marginBottom: Spacing.base },
  saveHint: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, lineHeight: 18, marginBottom: Spacing.sm },
  saveBtn: { marginTop: Spacing.base },
});
