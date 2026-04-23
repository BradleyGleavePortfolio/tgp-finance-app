// What-If scenario selector
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { WHATIF_SCENARIOS } from '../../src/utils/constants';

export default function WhatIfIndex() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>What-If Machine</Text>
      </View>
      <Text style={styles.subtitle}>Model any financial scenario. See the real numbers.</Text>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {WHATIF_SCENARIOS.map((scenario) => (
            <TouchableOpacity
              key={scenario.type}
              style={styles.card}
              onPress={() => router.push(`/whatif/${scenario.type}`)}
              activeOpacity={0.8}
            >
              <Text style={styles.icon}>{scenario.icon}</Text>
              <Text style={styles.cardTitle}>{scenario.title}</Text>
              <Text style={styles.cardDesc} numberOfLines={2}>{scenario.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base },
  back: {},
  backText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleLarge, color: Colors.frostWhite, flex: 1 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, paddingHorizontal: Spacing.base, marginBottom: Spacing.xl },
  content: { padding: Spacing.base, paddingBottom: 100 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  card: { width: '47%', backgroundColor: Colors.cardSurfaceNavy, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.graphiteBorder, padding: Spacing.base, gap: Spacing.sm, minHeight: 110 },
  icon: { fontSize: 28 },
  cardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.frostWhite },
  cardDesc: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
});
