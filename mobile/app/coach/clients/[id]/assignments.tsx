/**
 * AssignmentsManagementScreen — full CRUD for a client's assignments.
 *
 * Three sections (open / completed / dismissed). Inline status
 * toggles + delete. New assignment composer at the top.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coachApi } from '../../../../src/services/api';
import { colors, typography, spacing, radius } from '../../../../src/theme/tokens';
import { formatRelativeTime } from '../../../../src/utils/formatters';
import { CoachSkeletonList } from '../../../../src/components/coach/CoachSkeleton';
import { CoachEmptyState } from '../../../../src/components/coach/CoachEmptyState';
import { CoachStatusPill } from '../../../../src/components/coach/CoachStatusPill';
import type {
  ClientAssignmentRow,
  AssignmentType,
  AssignmentStatus,
} from '../../../../src/types/coach';

const TYPE_OPTIONS: { value: AssignmentType; label: string }[] = [
  { value: 'budget', label: 'Budget' },
  { value: 'savings_challenge', label: 'Savings' },
  { value: 'debt_paydown', label: 'Debt' },
  { value: 'habit', label: 'Habit' },
  { value: 'custom', label: 'Custom' },
];

export default function AssignmentsScreen() {
  const router = useRouter();
  const { id: clientId } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<ClientAssignmentRow[] | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<AssignmentType>('custom');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    try {
      const r = await coachApi.listClientAssignments(clientId);
      setItems(r.data);
    } catch {
      setItems([]);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!clientId || !title.trim()) return;
    setSubmitting(true);
    try {
      await coachApi.createAssignment(clientId, {
        title: title.trim(),
        description: description.trim() || undefined,
        assignment_type: type,
      });
      setTitle('');
      setDescription('');
      setType('custom');
      await load();
    } catch {
      Alert.alert('Could not create', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (assignment: ClientAssignmentRow, status: AssignmentStatus) => {
    try {
      await coachApi.patchAssignment(assignment.id, { status });
      await load();
    } catch {
      Alert.alert('Could not update', 'Please try again.');
    }
  };

  const handleDelete = async (assignmentId: string) => {
    Alert.alert('Delete assignment', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await coachApi.deleteAssignment(assignmentId);
            await load();
          } catch {
            Alert.alert('Could not delete', 'Please try again.');
          }
        },
      },
    ]);
  };

  const open = (items ?? []).filter((a) => a.status === 'open');
  const completed = (items ?? []).filter((a) => a.status === 'completed');
  const dismissed = (items ?? []).filter((a) => a.status === 'dismissed');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>ASSIGNMENTS</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Composer */}
          <View style={styles.composer}>
            <Text style={styles.composerLabel}>NEW ASSIGNMENT</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title — e.g. Save $500 by Friday"
              placeholderTextColor={colors.stone}
              style={styles.input}
              accessibilityLabel="Assignment title"
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description (optional)"
              placeholderTextColor={colors.stone}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.textarea]}
              accessibilityLabel="Assignment description"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
              {TYPE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setType(opt.value)}
                  style={[styles.typeChip, type === opt.value && styles.typeChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: type === opt.value }}
                  accessibilityLabel={`Type: ${opt.label}`}
                >
                  <Text style={[styles.typeChipText, type === opt.value && styles.typeChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={handleCreate}
              disabled={!title.trim() || submitting}
              style={[
                styles.createBtn,
                (!title.trim() || submitting) && { opacity: 0.4 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create assignment"
            >
              <Text style={styles.createBtnText}>{submitting ? 'CREATING…' : 'CREATE ASSIGNMENT'}</Text>
            </Pressable>
          </View>

          {items === null ? (
            <CoachSkeletonList rows={4} rowHeight={88} />
          ) : (
            <>
              <Section title="OPEN" count={open.length}>
                {open.length === 0 ? (
                  <CoachEmptyState eyebrow="EMPTY" title="No open assignments." />
                ) : (
                  open.map((a) => (
                    <AssignmentCard
                      key={a.id}
                      a={a}
                      onComplete={() => handleStatusChange(a, 'completed')}
                      onDismiss={() => handleStatusChange(a, 'dismissed')}
                      onDelete={() => handleDelete(a.id)}
                    />
                  ))
                )}
              </Section>
              <Section title="COMPLETED" count={completed.length}>
                {completed.length === 0 ? (
                  <Text style={styles.muted}>No completed assignments yet.</Text>
                ) : (
                  completed.map((a) => (
                    <AssignmentCard
                      key={a.id}
                      a={a}
                      onComplete={() => handleStatusChange(a, 'open')}
                      onDelete={() => handleDelete(a.id)}
                      reopenLabel="REOPEN"
                    />
                  ))
                )}
              </Section>
              <Section title="DISMISSED" count={dismissed.length}>
                {dismissed.length === 0 ? (
                  <Text style={styles.muted}>None dismissed.</Text>
                ) : (
                  dismissed.map((a) => (
                    <AssignmentCard
                      key={a.id}
                      a={a}
                      onComplete={() => handleStatusChange(a, 'open')}
                      onDelete={() => handleDelete(a.id)}
                      reopenLabel="REOPEN"
                    />
                  ))
                )}
              </Section>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      <View style={{ gap: spacing.sm }}>{children}</View>
    </View>
  );
}

function AssignmentCard({
  a,
  onComplete,
  onDismiss,
  onDelete,
  reopenLabel,
}: {
  a: ClientAssignmentRow;
  onComplete: () => void;
  onDismiss?: () => void;
  onDelete: () => void;
  reopenLabel?: string;
}) {
  const tone = a.status === 'completed' ? 'good' : a.status === 'dismissed' ? 'neutral' : 'warn';
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardLabel}>{a.assignment_type.replace(/_/g, ' ').toUpperCase()}</Text>
        <CoachStatusPill label={a.status} tone={tone} />
      </View>
      <Text style={styles.cardTitle}>{a.title}</Text>
      {a.description ? <Text style={styles.cardBody}>{a.description}</Text> : null}
      {a.due_date ? <Text style={styles.cardMeta}>Due {formatRelativeTime(a.due_date)}</Text> : null}
      <View style={styles.cardActions}>
        <Pressable
          onPress={onComplete}
          accessibilityRole="button"
          accessibilityLabel={reopenLabel ? 'Reopen assignment' : 'Mark complete'}
          hitSlop={8}
        >
          <Text style={styles.actionPrimary}>
            {reopenLabel ?? (a.status === 'open' ? 'MARK COMPLETE' : 'REOPEN')}
          </Text>
        </Pressable>
        {onDismiss && a.status === 'open' ? (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss assignment"
            hitSlop={8}
          >
            <Text style={styles.actionMuted}>DISMISS</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete assignment"
          hitSlop={8}
        >
          <Text style={styles.actionDanger}>DELETE</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bone },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  composer: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  composerLabel: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
    marginBottom: spacing.sm,
  },
  input: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  textarea: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  typeRow: {
    gap: spacing.sm,
    paddingVertical: 4,
  },
  typeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.stone,
    backgroundColor: colors.bone,
  },
  typeChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  typeChipText: {
    ...typography.scale.caption,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  typeChipTextActive: {
    color: colors.bone,
  },
  createBtn: {
    paddingVertical: 12,
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  createBtnText: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.bone,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  sectionCount: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.stone,
  },
  card: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardLabel: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  cardTitle: {
    fontFamily: typography.families.serif,
    fontSize: 20,
    lineHeight: 24,
    color: colors.ink,
    marginBottom: 4,
  },
  cardBody: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
  },
  cardMeta: {
    ...typography.scale.caption,
    fontFamily: typography.families.regular,
    color: colors.charcoal,
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  actionPrimary: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.ink,
  },
  actionMuted: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  actionDanger: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.oxblood,
  },
  muted: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.stone,
  },
});
