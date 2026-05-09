/**
 * NotesEditor — full notes management for a single client.
 *
 * Provides:
 *   - Create new note (textarea + private toggle)
 *   - List existing notes (most recent first)
 *   - Edit a note inline (long-press to enter edit mode)
 *   - Delete a note (with confirmation)
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
import type { CoachNoteRow } from '../../../../src/types/coach';

export default function NotesEditorScreen() {
  const router = useRouter();
  const { id: clientId } = useLocalSearchParams<{ id: string }>();
  const [notes, setNotes] = useState<CoachNoteRow[] | null>(null);
  const [draft, setDraft] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const load = useCallback(async () => {
    if (!clientId) return;
    try {
      const r = await coachApi.listClientNotes(clientId);
      setNotes(r.data);
    } catch {
      setNotes([]);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!clientId || !draft.trim()) return;
    setSubmitting(true);
    try {
      await coachApi.addNote(clientId, draft.trim(), isPrivate);
      setDraft('');
      setIsPrivate(false);
      await load();
    } catch {
      Alert.alert('Could not save', 'Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (noteId: string) => {
    try {
      await coachApi.patchNote(noteId, { note: editingText.trim() });
      setEditingId(null);
      setEditingText('');
      await load();
    } catch {
      Alert.alert('Could not update', 'Please try again.');
    }
  };

  const handleDelete = async (noteId: string) => {
    Alert.alert('Delete note', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await coachApi.deleteNote(noteId);
            await load();
          } catch {
            Alert.alert('Could not delete', 'Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>NOTES</Text>
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
          {/* New note composer */}
          <View style={styles.composer}>
            <Text style={styles.composerLabel}>NEW NOTE</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Capture context, plans, observations…"
              placeholderTextColor={colors.stone}
              multiline
              numberOfLines={5}
              style={styles.textarea}
              accessibilityLabel="Note body"
            />
            <View style={styles.composerRow}>
              <Pressable
                onPress={() => setIsPrivate((v) => !v)}
                style={styles.privateToggle}
                accessibilityRole="switch"
                accessibilityState={{ checked: isPrivate }}
                accessibilityLabel="Mark this note as private"
              >
                <Ionicons
                  name={isPrivate ? 'lock-closed' : 'lock-open-outline'}
                  size={16}
                  color={isPrivate ? colors.oxblood : colors.charcoal}
                />
                <Text style={[styles.privateLabel, isPrivate && { color: colors.oxblood }]}>
                  {isPrivate ? 'Private' : 'Visible to owner'}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleCreate}
                disabled={!draft.trim() || submitting}
                style={[
                  styles.saveBtn,
                  (!draft.trim() || submitting) && { opacity: 0.4 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save note"
              >
                <Text style={styles.saveBtnText}>{submitting ? 'SAVING…' : 'SAVE'}</Text>
              </Pressable>
            </View>
          </View>

          {/* List */}
          <Text style={styles.sectionTitle}>EXISTING NOTES</Text>
          {notes === null ? (
            <CoachSkeletonList rows={4} rowHeight={72} />
          ) : notes.length === 0 ? (
            <CoachEmptyState
              eyebrow="EMPTY"
              title="No notes yet."
              body="Notes are private to you and the practice owner."
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {notes.map((n) => {
                const isEditing = editingId === n.id;
                return (
                  <View key={n.id} style={styles.noteCard}>
                    <View style={styles.noteHeader}>
                      <Text style={styles.noteMeta}>
                        {formatRelativeTime(n.created_at).toUpperCase()}
                      </Text>
                      {n.is_private ? <CoachStatusPill label="private" tone="warn" /> : null}
                    </View>
                    {isEditing ? (
                      <>
                        <TextInput
                          value={editingText}
                          onChangeText={setEditingText}
                          multiline
                          style={styles.textarea}
                          accessibilityLabel="Edit note body"
                        />
                        <View style={styles.editButtons}>
                          <Pressable
                            onPress={() => {
                              setEditingId(null);
                              setEditingText('');
                            }}
                            style={styles.ghostBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel edit"
                          >
                            <Text style={styles.ghostBtnText}>CANCEL</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleSaveEdit(n.id)}
                            style={styles.saveBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Save edited note"
                          >
                            <Text style={styles.saveBtnText}>SAVE</Text>
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={styles.noteBody}>{n.note}</Text>
                        <View style={styles.noteActions}>
                          <Pressable
                            onPress={() => {
                              setEditingId(n.id);
                              setEditingText(n.note);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Edit note"
                            hitSlop={8}
                          >
                            <Text style={styles.actionEdit}>Edit</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDelete(n.id)}
                            accessibilityRole="button"
                            accessibilityLabel="Delete note"
                            hitSlop={8}
                          >
                            <Text style={styles.actionDelete}>Delete</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    marginBottom: spacing.xl,
  },
  composerLabel: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
    marginBottom: spacing.sm,
  },
  textarea: {
    minHeight: 100,
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.md,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  privateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  privateLabel: {
    ...typography.scale.caption,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  saveBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
  },
  saveBtnText: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.bone,
  },
  ghostBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.stone,
  },
  ghostBtnText: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  sectionTitle: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
    marginBottom: spacing.sm,
  },
  noteCard: {
    backgroundColor: colors.cream,
    borderWidth: 0.5,
    borderColor: colors.stone,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  noteMeta: {
    ...typography.scale.eyebrow,
    fontFamily: typography.families.medium,
    color: colors.charcoal,
  },
  noteBody: {
    ...typography.scale.body,
    fontFamily: typography.families.regular,
    color: colors.ink,
  },
  noteActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  actionEdit: {
    ...typography.scale.caption,
    fontFamily: typography.families.medium,
    color: colors.ink,
  },
  actionDelete: {
    ...typography.scale.caption,
    fontFamily: typography.families.medium,
    color: colors.oxblood,
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
