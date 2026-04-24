// Payday Deploy — placeholder screen.
// The backend endpoint for persisting a paycheck split does not exist yet, so
// the interactive flow has been removed. Until it ships we show an honest
// "coming soon" state instead of a celebratory fake confirmation.
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { Colors, Typography, Spacing } from '../src/theme/finance';

export default function PaydayScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payday Deploy</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.banner}>
          <Text style={styles.icon}>🚧</Text>
          <Text style={styles.bannerTitle}>Coming Soon</Text>
          <Text style={styles.bannerBody}>
            Payday Deploy will let you split a paycheck across minimums, extra debt, savings
            and investments in one tap — and persist the deployment to your accounts.
          </Text>
          <Text style={styles.bannerBody}>
            We're not shipping it until the numbers actually move. Until then, use
            Priority Waterfall and What-If to plan your next move.
          </Text>
        </Card>

        <Button
          title="Return to Command Center"
          onPress={() => router.replace('/(tabs)')}
          variant="primary"
          fullWidth
          size="lg"
          style={styles.cta}
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
  banner: { padding: Spacing.xl, alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xl },
  icon: { fontSize: 56 },
  bannerTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.displaySmall, color: Colors.accentGold, textAlign: 'center' },
  bannerBody: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, textAlign: 'center', lineHeight: 22 },
  cta: { marginTop: Spacing.base },
});
