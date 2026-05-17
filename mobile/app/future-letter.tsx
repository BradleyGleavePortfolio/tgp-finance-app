// Future Self Letter view/edit
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/ui/Button';
import { Card } from '../src/components/ui/Card';
import { Colors, Typography, Spacing } from '../src/theme/finance';
import { useAuthStore } from '../src/stores/authStore';
import { useProfileStore } from '../src/stores/profileStore';

export default function FutureLetterScreen() {
  const router = useRouter();
  const { user, profile } = useAuthStore();
  const { updateProfile, isLoading } = useProfileStore();
  const [editing, setEditing] = useState(false);
  const [letter, setLetter] = useState(profile?.future_self_letter || '');

  const accountCreated = user?.created_at;
  const daysSinceCreation = accountCreated
    ? Math.floor((Date.now() - new Date(accountCreated).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const isDay90 = daysSinceCreation >= 90;

  const handleSave = async () => {
    try {
      await updateProfile({ future_self_letter: letter });
      setEditing(false);
      Alert.alert('Saved', 'Your letter has been saved.');
    } catch {
      Alert.alert('Error', 'Failed to save letter.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" testID="future-letter-back-button">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Future Self Letter</Text>
        <TouchableOpacity
          onPress={() => setEditing(!editing)}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Cancel editing future self letter' : 'Edit future self letter'}
          testID="future-letter-edit-button"
        >
          <Text style={styles.editBtn}>{editing ? 'Cancel' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isDay90 ? (
          <Card variant="gold" style={styles.deliveredBanner}>
            <Text style={styles.deliveredTitle}>Letter delivered</Text>
            <Text style={styles.deliveredText}>It's been 90 days. Your past self left you a message.</Text>
          </Card>
        ) : (
          <Card style={styles.daysCard}>
            <Text style={styles.daysText}>Day {daysSinceCreation} of 90</Text>
            <Text style={styles.daysLabel}>This letter will be delivered to you at day 90.</Text>
          </Card>
        )}

        {editing ? (
          <View>
            <Text style={styles.letterLabel}>Write your letter to future you:</Text>
            <TextInput
              value={letter}
              onChangeText={setLetter}
              placeholder="Hey future me, in 90 days I want to have..."
              placeholderTextColor={Colors.slateGray}
              style={styles.letterInput}
              multiline
              numberOfLines={12}
              maxLength={1000}
            />
            <Text style={styles.charCount}>{letter.length}/1000</Text>
            <Button title="Save Letter" onPress={handleSave} loading={isLoading} variant="primary" fullWidth style={styles.saveBtn} />
          </View>
        ) : (
          <View>
            {letter ? (
              <Card style={styles.letterCard}>
                <Text style={styles.letterFrom}>Dear Future Me,</Text>
                <Text style={styles.letterText}>{letter}</Text>
              </Card>
            ) : (
              <View style={styles.emptyLetter}>
                <Text style={styles.emptyLetterText}>You haven't written your Future Self Letter yet.</Text>
                <Button title="Write Your Letter" onPress={() => setEditing(true)} variant="primary" />
              </View>
            )}
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
  editBtn: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  content: { padding: Spacing.base, paddingBottom: 100 },
  deliveredBanner: { padding: Spacing.base, alignItems: 'center', marginBottom: Spacing.xl, gap: Spacing.sm },
  deliveredTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleSmall, color: Colors.accentGold },
  deliveredText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.frostWhite, textAlign: 'center' },
  daysCard: { padding: Spacing.base, alignItems: 'center', marginBottom: Spacing.xl, gap: Spacing.xs },
  daysText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.titleMedium, color: Colors.accentGold },
  daysLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, textAlign: 'center' },
  letterLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray, marginBottom: Spacing.sm, letterSpacing: 0.5 },
  letterInput: { backgroundColor: Colors.cardSurfaceNavy, borderWidth: 1, borderColor: Colors.graphiteBorder, borderRadius: 2, padding: Spacing.base, fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite, minHeight: 200, textAlignVertical: 'top' },
  charCount: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, textAlign: 'right', marginTop: 4 },
  saveBtn: { marginTop: Spacing.base },
  letterCard: { padding: Spacing.xl, gap: Spacing.md },
  letterFrom: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.accentGold },
  letterText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite, lineHeight: 26 },
  emptyLetter: { alignItems: 'center', padding: Spacing.xxl, gap: Spacing.xl },
  emptyLetterText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, textAlign: 'center' },
});
