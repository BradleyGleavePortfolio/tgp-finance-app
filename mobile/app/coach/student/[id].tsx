// Coach Student Detail Screen
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../../src/components/ui/Card';
import { Button } from '../../../src/components/ui/Button';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { StreakBadge, VelocityBadge } from '../../../src/components/ui/Badge';
import { Colors, Typography, Spacing, BorderRadius } from '../../../src/theme/finance';
import { coachApi } from '../../../src/services/api';
import { formatCurrency } from '../../../src/utils/formatters';

export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [student, setStudent] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submittingNote, setSubmittingNote] = useState(false);

  useEffect(() => {
    if (id) loadStudent();
  }, [id]);

  const loadStudent = async () => {
    setLoading(true);
    try {
      const [studentRes, detailRes] = await Promise.all([
        coachApi.getStudent(id!),
        coachApi.getStudentDetail(id!, 90),
      ]);
      setStudent(studentRes.data);
      setDetail(detailRes.data);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load student data.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSubmittingNote(true);
    try {
      await coachApi.addNote(id!, noteText.trim(), isPrivate);
      setNoteText('');
      // Reload to get fresh notes
      const detailRes = await coachApi.getStudentDetail(id!, 90);
      setDetail(detailRes.data);
      Alert.alert('Note Added', 'Your note has been saved.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add note.');
    } finally {
      setSubmittingNote(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accentGold} />
          <Text style={styles.loadingText}>Loading student...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const user = student?.user || detail?.user || {};
  const profile = student?.profile || detail?.profile || {};
  const notes = detail?.notes || [];
  const eodHistory = detail?.eod_history || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Student Detail</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Student Info */}
        <Card style={styles.infoCard}>
          <Text style={styles.studentName}>{user.name || 'Unknown'}</Text>
          <Text style={styles.studentEmail}>{user.email || ''}</Text>
          <View style={styles.badgeRow}>
            <StreakBadge streak={profile.streak_days || 0} />
            <VelocityBadge score={profile.wealth_velocity_score || 0} showScore />
          </View>
        </Card>

        {/* Financial Summary */}
        <Text style={styles.sectionTitle}>Financial Overview</Text>
        <Card style={styles.metricsCard}>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Net Worth</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(profile.net_worth_snapshot || 0)}
            </Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Total Assets</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(profile.total_assets || 0)}
            </Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Total Debt</Text>
            <Text style={[styles.metricValue, { color: Colors.debtCrimson }]}>
              {formatCurrency(profile.total_debt || 0)}
            </Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Streak Days</Text>
            <Text style={styles.metricValue}>{profile.streak_days || 0}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Velocity Score</Text>
            <Text style={styles.metricValue}>{profile.wealth_velocity_score || 0}/100</Text>
          </View>
        </Card>

        {/* EOD History */}
        <Text style={styles.sectionTitle}>EOD History (Last 90 Days)</Text>
        {eodHistory.length === 0 ? (
          <EmptyState
            icon="📊"
            title="No submissions"
            description="This student hasn't submitted any EOD entries yet."
          />
        ) : (
          eodHistory.slice(0, 10).map((entry: any, i: number) => (
            <Card key={entry.id || i} style={styles.eodCard}>
              <View style={styles.eodRow}>
                <Text style={styles.eodDate}>{entry.submission_date}</Text>
                <Text style={styles.eodNetWorth}>
                  {formatCurrency(entry.net_worth_computed || 0)}
                </Text>
              </View>
              {entry.notes && <Text style={styles.eodNotes}>{entry.notes}</Text>}
            </Card>
          ))
        )}

        {/* Coach Notes */}
        <Text style={styles.sectionTitle}>Coach Notes</Text>
        {notes.length === 0 ? (
          <EmptyState
            icon="📝"
            title="No notes yet"
            description="Add a note to track this student's progress."
          />
        ) : (
          notes.map((note: any, i: number) => (
            <Card key={note.id || i} style={styles.noteCard}>
              <View style={styles.noteHeader}>
                <Text style={styles.noteDate}>{note.created_at?.split('T')[0] || ''}</Text>
                {note.is_private && <Text style={styles.privateTag}>Private</Text>}
              </View>
              <Text style={styles.noteText}>{note.note}</Text>
            </Card>
          ))
        )}

        {/* Add Note */}
        <Text style={styles.sectionTitle}>Add Note</Text>
        <Card style={styles.addNoteCard}>
          <TextInput
            value={noteText}
            onChangeText={setNoteText}
            placeholder="Write a note about this student..."
            placeholderTextColor={Colors.slateGray}
            style={styles.noteInput}
            multiline
            numberOfLines={4}
            maxLength={500}
          />
          <View style={styles.noteActions}>
            <TouchableOpacity
              style={styles.privateToggle}
              onPress={() => setIsPrivate(!isPrivate)}
            >
              <View style={[styles.checkbox, isPrivate && styles.checkboxChecked]} />
              <Text style={styles.privateLabel}>Private note</Text>
            </TouchableOpacity>
            <Button
              title="Add Note"
              onPress={handleAddNote}
              loading={submittingNote}
              variant="primary"
              size="sm"
            />
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md },
  loadingText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base },
  back: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.accentGold },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  content: { padding: Spacing.base, paddingBottom: 100 },
  infoCard: { padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  studentName: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleMedium, color: Colors.frostWhite },
  studentEmail: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  badgeRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  metricsCard: { padding: Spacing.base, gap: Spacing.md, marginBottom: Spacing.xl },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  metricValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodyMedium, color: Colors.accentGold },
  eodCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  eodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eodDate: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  eodNetWorth: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.accentGold },
  eodNotes: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.frostWhite, marginTop: Spacing.xs },
  noteCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  noteDate: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  privateTag: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.microLabel, color: Colors.amberWarning },
  noteText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.frostWhite },
  addNoteCard: { padding: Spacing.base, marginBottom: Spacing.xl },
  noteInput: { backgroundColor: Colors.backgroundDeepNavy, borderWidth: 1, borderColor: Colors.graphiteBorder, borderRadius: BorderRadius.md, padding: Spacing.md, fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite, minHeight: 100, textAlignVertical: 'top', marginBottom: Spacing.md },
  noteActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  privateToggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.graphiteBorder },
  checkboxChecked: { backgroundColor: Colors.accentGold, borderColor: Colors.accentGold },
  privateLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
});
