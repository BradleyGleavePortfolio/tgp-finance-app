// EOD History screen — lists recent EOD submissions, allows editing within 7 days
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { MoodSelector } from '../../src/components/eod/MoodSelector';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { eodApi } from '../../src/services/api';
import { DAILY_HABITS, MOOD_EMOJIS } from '../../src/utils/constants';
import { formatCurrency } from '../../src/utils/formatters';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isEditable(submissionDate: string | Date): boolean {
  const sub = new Date(submissionDate);
  return Date.now() - sub.getTime() < SEVEN_DAYS_MS;
}

function formatDate(dateStr: string | Date): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

type EODEntry = {
  id: string;
  submission_date: string;
  mood?: number;
  notes?: string;
  habits_checked?: string[];
  account_snapshots: Array<{ account_id: string; balance: number; notes?: string }>;
  net_worth_computed: number;
};

// ── Edit Form ─────────────────────────────────────────────────────────────────
function EditForm({ entry, onSave, onCancel }: {
  entry: EODEntry;
  onSave: (updated: EODEntry) => void;
  onCancel: () => void;
}) {
  const [mood, setMood] = useState<number | undefined>(entry.mood);
  const [notes, setNotes] = useState(entry.notes || '');
  const [habits, setHabits] = useState<Record<string, boolean>>(
    Object.fromEntries(DAILY_HABITS.map(h => [h.key, (entry.habits_checked || []).includes(h.key)]))
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await eodApi.update(entry.id, {
        submission_date: entry.submission_date.slice(0, 10),
        account_snapshots: entry.account_snapshots,
        mood,
        notes: notes || undefined,
        habits_checked: DAILY_HABITS.filter(h => habits[h.key]).map(h => h.key),
      });
      Alert.alert('Saved', 'Your check-in has been updated.');
      onSave(data?.submission ?? { ...entry, mood, notes, habits_checked: Object.keys(habits).filter(k => habits[k]) });
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to save changes.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.editHeader}>
        <Text style={styles.editTitle}>Edit: {formatDate(entry.submission_date)}</Text>
        <TouchableOpacity onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel edit">
          <Text style={styles.editCancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled">
        {/* Account snapshots — displayed read-only; only mood/notes/habits editable */}
        <Text style={styles.sectionTitle}>Account Snapshots</Text>
        <Text style={styles.editNote}>
          Account balances cannot be changed after submission. Contact support if you need a balance correction.
        </Text>
        {(entry.account_snapshots || []).map((snap, i) => (
          <View key={i} style={styles.snapRow}>
            <Text style={styles.snapId} numberOfLines={1}>{snap.account_id.slice(0, 8)}…</Text>
            <Text style={styles.snapBal}>{formatCurrency(snap.balance)}</Text>
          </View>
        ))}

        {/* Mood */}
        <Text style={styles.sectionTitle}>Mood</Text>
        <MoodSelector value={mood} onChange={setMood} />

        {/* Notes */}
        <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Any big expenses, income, or important financial events..."
          placeholderTextColor={Colors.slateGray}
          style={styles.notesInput}
          multiline
          numberOfLines={4}
          maxLength={500}
        />

        {/* Habits */}
        <Text style={styles.sectionTitle}>Daily Habits</Text>
        {DAILY_HABITS.map((habit) => (
          <TouchableOpacity
            key={habit.key}
            style={[styles.habitRow, habits[habit.key] && styles.habitDone]}
            onPress={() => setHabits(prev => ({ ...prev, [habit.key]: !prev[habit.key] }))}
            activeOpacity={0.8}
            accessibilityRole="checkbox"
            accessibilityLabel={habit.label}
            accessibilityState={{ checked: !!habits[habit.key] }}
          >
            <Text style={styles.habitCheck}>{habits[habit.key] ? '☑' : '☐'}</Text>
            <Text style={[styles.habitLabel, habits[habit.key] && styles.habitLabelDone]}>
              {habit.label}
            </Text>
          </TouchableOpacity>
        ))}

        <Button
          title="Save Changes"
          onPress={handleSave}
          loading={saving}
          variant="primary"
          fullWidth
          size="lg"
          style={styles.saveBtn}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Main History Screen ───────────────────────────────────────────────────────
export default function EODHistoryScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<EODEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<EODEntry | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await eodApi.getHistoryByLimit(20);
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert('Error', 'Failed to load check-in history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSaved = (updated: EODEntry) => {
    setEntries(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e));
    setEditingEntry(null);
  };

  if (editingEntry) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <EditForm
          entry={editingEntry}
          onSave={handleSaved}
          onCancel={() => setEditingEntry(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Check-in History</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accentGold} />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEyebrow}>HISTORY</Text>
          <Text style={styles.emptyTitle}>No check-ins yet.</Text>
          <Text style={styles.emptyDesc}>Complete your first daily check-in to see it here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.editHint}>Entries within the last 7 days can be edited.</Text>
          {entries.map((entry) => {
            const editable = isEditable(entry.submission_date);
            const moodEmoji = entry.mood ? MOOD_EMOJIS[entry.mood - 1] : null;
            return (
              <Card key={entry.id} style={[styles.entryCard, !editable && styles.entryCardOld]}>
                <View style={styles.entryRow}>
                  <View style={styles.entryLeft}>
                    <Text style={styles.entryDate}>{formatDate(entry.submission_date)}</Text>
                    <View style={styles.entryMeta}>
                      {moodEmoji && <Text style={styles.entryMood}>{moodEmoji}</Text>}
                      <Text style={styles.entryNW}>
                        NW: {formatCurrency(Number(entry.net_worth_computed))}
                      </Text>
                    </View>
                    {entry.notes ? (
                      <Text style={styles.entryNotes} numberOfLines={1}>{entry.notes}</Text>
                    ) : null}
                  </View>
                  {editable ? (
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => setEditingEntry(entry)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit check-in for ${formatDate(entry.submission_date)}`}
                    >
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.lockedBadge}>
                      <Text style={styles.lockedText}>Locked</Text>
                    </View>
                  )}
                </View>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyEyebrow: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    color: Colors.slateGray,
  },
  emptyTitle: { fontFamily: Typography.fontSerif, fontSize: Typography.titleMedium, color: Colors.frostWhite },
  emptyDesc: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, textAlign: 'center' },
  content: { padding: Spacing.base, paddingBottom: 100 },
  editHint: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, marginBottom: Spacing.base },
  entryCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  entryCardOld: { opacity: 0.7 },
  entryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryLeft: { flex: 1, gap: 4 },
  entryDate: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  entryMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  entryMood: { fontSize: 18 },
  entryNW: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.accentGold },
  entryNotes: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  editBtn: { backgroundColor: Colors.accentGold, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  editBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.backgroundDeepNavy },
  lockedBadge: { borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.graphiteBorder },
  lockedText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  // Edit form
  editHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.graphiteBorder },
  editTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  editCancel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  editContent: { padding: Spacing.base, paddingBottom: 120 },
  editNote: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, marginBottom: Spacing.md, lineHeight: 18 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md, marginTop: Spacing.base },
  snapRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.graphiteBorder },
  snapId: { fontFamily: 'JetBrainsMono_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, flex: 1 },
  snapBal: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.frostWhite },
  notesInput: { backgroundColor: Colors.cardSurfaceNavy, borderRadius: 2, borderWidth: 1, borderColor: Colors.graphiteBorder, padding: Spacing.base, fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite, minHeight: 100, textAlignVertical: 'top', marginBottom: Spacing.md },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: 4, borderWidth: 1, borderColor: Colors.graphiteBorder, marginBottom: Spacing.sm, backgroundColor: Colors.cardSurfaceNavy },
  habitDone: { borderColor: Colors.profitGreen, backgroundColor: 'rgba(6,214,160,0.05)' },
  habitCheck: { fontSize: 20, color: Colors.profitGreen },
  habitLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, flex: 1 },
  habitLabelDone: { color: Colors.frostWhite },
  saveBtn: { marginTop: Spacing.xl },
});
