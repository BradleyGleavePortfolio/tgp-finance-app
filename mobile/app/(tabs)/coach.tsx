// Coach dashboard (coach role) / AI Chat (students)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Card } from '../../src/components/ui/Card';
import { Badge, StreakBadge, VelocityBadge } from '../../src/components/ui/Badge';
import { ChatPanel } from '../../src/components/ai/ChatPanel';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
import { useCoachStore } from '../../src/stores/coachStore';
import { coachApi } from '../../src/services/api';
import { formatCurrency, formatRelativeTime } from '../../src/utils/formatters';
import { ScreenErrorBoundary } from '../../src/components/ui/ScreenErrorBoundary';

export default function CoachScreen() {
  const { user } = useAuthStore();
  const isCoach = user?.role === 'coach';

  return isCoach ? <CoachDashboard /> : <StudentAIChat />;
}

// ─── Coach Dashboard ──────────────────────────────────────────────────────────
function CoachDashboard() {
  const router = useRouter();
  const { students, alerts, fetchStudents, fetchAlerts, isLoading } = useCoachStore();
  const [search, setSearch] = useState('');
  const [emailSearch, setEmailSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'velocity' | 'streak' | 'net_worth'>('velocity');
  const [digest, setDigest] = useState<any>(null);
  const [digestLoading, setDigestLoading] = useState(false);

  // Templates state
  const { templates, fetchTemplates, createTemplate, applyTemplate } = useCoachStore();
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null); // templateId being applied
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [pickerTemplateId, setPickerTemplateId] = useState<string>('');

  useEffect(() => {
    fetchStudents();
    fetchAlerts();
    fetchTemplates();
    loadDigest();
  }, []);

  const loadDigest = async () => {
    setDigestLoading(true);
    try {
      const { data } = await coachApi.getDigest();
      setDigest(data);
    } catch {
      // Non-critical — digest card stays hidden if request fails
    } finally {
      setDigestLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;
    setCreatingTemplate(true);
    try {
      await createTemplate({
        name: newTemplateName.trim(),
        description: newTemplateDesc.trim() || undefined,
        // Default single phase so the schema is satisfied
        phases: [{ phase_name: 'Phase 1', priority_index: 0, duration_weeks: 4, notes: '' }],
      });
      setShowCreateModal(false);
      setNewTemplateName('');
      setNewTemplateDesc('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create template.');
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleOpenStudentPicker = (templateId: string) => {
    setPickerTemplateId(templateId);
    setShowStudentPicker(true);
  };

  const handleApplyTemplate = async (studentId: string) => {
    setShowStudentPicker(false);
    setApplyingTemplate(pickerTemplateId);
    try {
      await applyTemplate(pickerTemplateId, studentId);
      const student = safeStudents.find(s => s.user.id === studentId);
      Alert.alert('Template Applied', `Template applied to ${student?.user.name || 'student'} successfully.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to apply template.');
    } finally {
      setApplyingTemplate(null);
      setPickerTemplateId('');
    }
  };

  const handleEmailSearch = () => {
    if (emailSearch.trim()) {
      fetchStudents(emailSearch.trim());
    } else {
      fetchStudents();
    }
  };

  const safeStudents = Array.isArray(students) ? students : [];
  const safeAlerts = Array.isArray(alerts) ? alerts : [];
  const filtered = safeStudents.filter(s =>
    s.user.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'velocity': return (b.profile.wealth_velocity_score || 0) - (a.profile.wealth_velocity_score || 0);
      case 'streak': return (b.profile.streak_days || 0) - (a.profile.streak_days || 0);
      case 'net_worth': return (b.profile.net_worth_snapshot || 0) - (a.profile.net_worth_snapshot || 0);
      default: return a.user.name.localeCompare(b.user.name);
    }
  });

  const submittedToday = students.filter(s => s.submitted_today).length;
  const avgVelocity = students.length
    ? Math.round(students.reduce((s, st) => s + (st.profile.wealth_velocity_score || 0), 0) / students.length)
    : 0;

  if (isLoading && safeStudents.length === 0) {
    return <LoadingSpinner fullScreen text="Loading coach dashboard..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Coach Dashboard</Text>

        {/* Weekly Digest Card */}
        {(digest || digestLoading) && (
          <Card style={styles.digestCard}>
            <View style={styles.digestHeader}>
              <Text style={styles.digestTitle}>Weekly Digest</Text>
              {digest?.week_of && (
                <Text style={styles.digestWeek}>Week of {digest.week_of}</Text>
              )}
            </View>
            {digestLoading ? (
              <ActivityIndicator size="small" color={Colors.accentGold} />
            ) : (
              <>
                <View style={styles.digestGrid}>
                  <View style={styles.digestStat}>
                    <Text style={styles.digestStatValue}>{digest.total_students ?? '—'}</Text>
                    <Text style={styles.digestStatLabel}>Total Clients</Text>
                  </View>
                  <View style={styles.digestStat}>
                    <Text style={styles.digestStatValue}>{digest.submitted_this_week ?? '—'}</Text>
                    <Text style={styles.digestStatLabel}>Active This Week</Text>
                  </View>
                  <View style={styles.digestStat}>
                    <Text style={styles.digestStatValue}>{digest.submission_rate_pct != null ? `${digest.submission_rate_pct}%` : '—'}</Text>
                    <Text style={styles.digestStatLabel}>Submission Rate</Text>
                  </View>
                  <View style={styles.digestStat}>
                    <Text style={styles.digestStatValue}>{digest.avg_velocity_score ?? '—'}</Text>
                    <Text style={styles.digestStatLabel}>Avg Velocity</Text>
                  </View>
                </View>
                {Array.isArray(digest.needs_attention) && digest.needs_attention.length > 0 && (
                  <View style={styles.digestAttention}>
                    <Text style={styles.digestAttentionLabel}>
                      Needs attention ({digest.needs_attention.length})
                    </Text>
                    {digest.needs_attention.slice(0, 3).map((s: any, i: number) => (
                      <Text key={i} style={styles.digestAttentionName}>{s.name}</Text>
                    ))}
                    {digest.needs_attention.length > 3 && (
                      <Text style={styles.digestAttentionMore}>+{digest.needs_attention.length - 3} more</Text>
                    )}
                  </View>
                )}
              </>
            )}
          </Card>
        )}

        {/* Stats cards */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Students', value: String(students.length) },
            { label: 'Submitted Today', value: `${submittedToday}/${students.length}` },
            { label: 'Avg Velocity', value: `${avgVelocity}/100` },
            { label: 'Red Flags', value: String(alerts.length) },
          ].map((stat) => (
            <Card key={stat.label} style={styles.statCard}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Card>
          ))}
        </View>

        {/* Red flags */}
        {alerts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Red flags ({alerts.length})</Text>
            {alerts.map((alert, i) => (
              <Card key={i} variant="crimson" style={styles.alertCard}>
                <Text style={styles.alertStudent}>{alert.student_name}</Text>
                <Text style={styles.alertMessage}>{alert.message}</Text>
              </Card>
            ))}
          </View>
        )}

        {/* Program Templates */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setTemplatesExpanded(!templatesExpanded)}
            accessibilityRole="button"
            accessibilityLabel={templatesExpanded ? 'Collapse program templates' : 'Expand program templates'}
          >
            <Text style={styles.sectionTitle}>Program Templates ({Array.isArray(templates) ? templates.length : 0})</Text>
            <Text style={styles.sectionChevron}>{templatesExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {templatesExpanded && (
            <>
              <TouchableOpacity
                style={styles.createTemplateBtn}
                onPress={() => setShowCreateModal(true)}
                accessibilityRole="button"
                accessibilityLabel="Create new program template"
              >
                <Text style={styles.createTemplateBtnText}>+ New Template</Text>
              </TouchableOpacity>
              {!Array.isArray(templates) || templates.length === 0 ? (
                <EmptyState
                  eyebrow="TEMPLATES"
                  title="No templates yet"
                  description="Create a program template to quickly apply structured plans to students."
                />
              ) : (
                templates.map((tmpl: any) => (
                  <Card key={tmpl.id} style={styles.templateCard}>
                    <View style={styles.templateHeader}>
                      <View style={styles.templateInfo}>
                        <Text style={styles.templateName}>{tmpl.name}</Text>
                        {tmpl.description && (
                          <Text style={styles.templateDesc}>{tmpl.description}</Text>
                        )}
                        <Text style={styles.templateMeta}>
                          {Array.isArray(tmpl.phases) ? tmpl.phases.length : 0} phase(s)
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.applyBtn, applyingTemplate === tmpl.id && { opacity: 0.5 }]}
                        onPress={() => handleOpenStudentPicker(tmpl.id)}
                        disabled={applyingTemplate === tmpl.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Apply template ${tmpl.name} to a student`}
                      >
                        {applyingTemplate === tmpl.id ? (
                          <ActivityIndicator size="small" color={Colors.backgroundDeepNavy} />
                        ) : (
                          <Text style={styles.applyBtnText}>Apply →</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </Card>
                ))
              )}
            </>
          )}
        </View>

        {/* Student list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Students</Text>

          {/* Email search with server-side filtering */}
          <View style={styles.emailSearchRow}>
            <TextInput
              value={emailSearch}
              onChangeText={setEmailSearch}
              placeholder="Search by email..."
              placeholderTextColor={Colors.slateGray}
              style={[styles.searchInput, { flex: 1, marginBottom: 0 }]}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={handleEmailSearch}
            />
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={handleEmailSearch}
              accessibilityRole="button"
              accessibilityLabel="Search students by email"
            >
              <Text style={styles.searchBtnText}>Search</Text>
            </TouchableOpacity>
            {emailSearch.trim() !== '' && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => { setEmailSearch(''); fetchStudents(); }}
                accessibilityRole="button"
                accessibilityLabel="Clear email search"
              >
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Local name filter */}
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Filter by name..."
            placeholderTextColor={Colors.slateGray}
            style={styles.searchInput}
          />

          <View style={styles.sortRow}>
            {(['velocity', 'streak', 'net_worth', 'name'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.sortBtn, sortBy === s && styles.sortBtnActive]}
                onPress={() => setSortBy(s)}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${s.replace('_', ' ')}`}
                accessibilityState={{ selected: sortBy === s }}
              >
                <Text style={[styles.sortBtnText, sortBy === s && styles.sortBtnTextActive]}>
                  {s.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {sorted.length === 0 ? (
            <EmptyState eyebrow="STUDENTS" title="No students yet" description="Students will appear here once they join and complete onboarding." />
          ) : (
            sorted.map((student) => (
              <TouchableOpacity
                key={student.user.id}
                style={styles.studentRow}
                onPress={() => router.push(`/coach/student/${student.user.id}` as any)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Open ${student.user.name}'s student profile`}
              >
                <View style={styles.studentLeft}>
                  <Text style={styles.studentName}>{student.user.name}</Text>
                  <Text style={styles.studentEmail}>{student.user.email}</Text>
                  <View style={styles.studentBadges}>
                    <StreakBadge streak={student.profile.streak_days} />
                    <View style={[styles.submitDot, { backgroundColor: student.submitted_today ? Colors.profitGreen : Colors.debtCrimson }]} />
                  </View>
                </View>
                <View style={styles.studentRight}>
                  <Text style={styles.studentNetWorth}>
                    {formatCurrency(student.profile.net_worth_snapshot || 0, { compact: true })}
                  </Text>
                  <VelocityBadge score={student.profile.wealth_velocity_score || 0} showScore />
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* Create Template Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>New Program Template</Text>
            <TextInput
              value={newTemplateName}
              onChangeText={setNewTemplateName}
              placeholder="Template name"
              placeholderTextColor={Colors.slateGray}
              style={styles.modalInput}
              maxLength={100}
            />
            <TextInput
              value={newTemplateDesc}
              onChangeText={setNewTemplateDesc}
              placeholder="Description (optional)"
              placeholderTextColor={Colors.slateGray}
              style={[styles.modalInput, { minHeight: 70, textAlignVertical: 'top' }]}
              multiline
              maxLength={300}
            />
            <Text style={styles.modalHint}>A default Phase 1 (Priority 0, 4 weeks) will be created. You can customize phases later.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowCreateModal(false); setNewTemplateName(''); setNewTemplateDesc(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, (!newTemplateName.trim() || creatingTemplate) && { opacity: 0.5 }]}
                onPress={handleCreateTemplate}
                disabled={!newTemplateName.trim() || creatingTemplate}
              >
                {creatingTemplate ? (
                  <ActivityIndicator size="small" color={Colors.backgroundDeepNavy} />
                ) : (
                  <Text style={styles.modalSaveText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Student Picker Modal (for applying template) */}
      <Modal visible={showStudentPicker} transparent animationType="slide" onRequestClose={() => setShowStudentPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Apply to Student</Text>
            <Text style={styles.modalHint}>Select a student to apply this template to:</Text>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {safeStudents.length === 0 ? (
                <Text style={styles.modalHint}>No students available.</Text>
              ) : (
                safeStudents.map((s) => (
                  <TouchableOpacity
                    key={s.user.id}
                    style={styles.pickerRow}
                    onPress={() => handleApplyTemplate(s.user.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Apply template to ${s.user.name}`}
                  >
                    <Text style={styles.pickerName}>{s.user.name}</Text>
                    <Text style={styles.pickerEmail}>{s.user.email}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowStudentPicker(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Student AI Chat ──────────────────────────────────────────────────────────
function StudentAIChat() {
  return (
    <ScreenErrorBoundary screenName="AI Coach">
    <SafeAreaView style={styles.container} edges={['top']}>
      <ChatPanel />
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundDeepNavy },
  content: { padding: Spacing.base, paddingBottom: 100 },
  title: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleLarge, color: Colors.frostWhite, marginBottom: Spacing.xl },
  digestCard: { padding: Spacing.base, marginBottom: Spacing.xl, gap: Spacing.md },
  digestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  digestTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  digestWeek: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  digestGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  digestStat: { width: '48%', backgroundColor: Colors.backgroundDeepNavy, borderRadius: BorderRadius.sm, padding: Spacing.md, alignItems: 'center' },
  digestStatValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.titleMedium, color: Colors.accentGold },
  digestStatLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, marginTop: 2, textAlign: 'center' },
  digestAttention: { borderTopWidth: 1, borderTopColor: Colors.graphiteBorder, paddingTop: Spacing.sm, gap: 4 },
  digestAttentionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.amberWarning },
  digestAttentionName: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.frostWhite },
  digestAttentionMore: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xl },
  statCard: { width: '48%', padding: Spacing.md, alignItems: 'center' },
  statValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.titleMedium, color: Colors.accentGold },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  alertCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  alertStudent: { fontFamily: 'Inter_700Bold', fontSize: Typography.bodySmall, color: Colors.debtCrimson },
  alertMessage: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.frostWhite },
  emailSearchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  searchBtn: { backgroundColor: Colors.accentGold, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  searchBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.backgroundDeepNavy },
  clearBtn: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.md },
  clearBtnText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  searchInput: { backgroundColor: Colors.cardSurfaceNavy, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.graphiteBorder, padding: Spacing.md, fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.md },
  sortRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  sortBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.graphiteBorder },
  sortBtnActive: { backgroundColor: Colors.accentGold, borderColor: Colors.accentGold },
  sortBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.microLabel, color: Colors.slateGray },
  sortBtnTextActive: { color: Colors.backgroundDeepNavy },
  studentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.cardSurfaceNavy, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.graphiteBorder, padding: Spacing.md, marginBottom: Spacing.sm },
  studentLeft: { flex: 1, gap: 4 },
  studentName: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  studentEmail: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  studentBadges: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  submitDot: { width: 8, height: 8, borderRadius: 4 },
  studentRight: { alignItems: 'flex-end', gap: 4 },
  studentNetWorth: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.accentGold },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionChevron: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  createTemplateBtn: { borderWidth: 1, borderColor: Colors.accentGold, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  createTemplateBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.accentGold },
  templateCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  templateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  templateInfo: { flex: 1, gap: 2 },
  templateName: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  templateDesc: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
  templateMeta: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray },
  applyBtn: { backgroundColor: Colors.accentGold, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minWidth: 64, alignItems: 'center' },
  applyBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.backgroundDeepNavy },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.cardSurfaceNavy, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.xl, gap: Spacing.md },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleMedium, color: Colors.frostWhite, marginBottom: Spacing.sm },
  modalInput: { backgroundColor: Colors.backgroundDeepNavy, borderWidth: 1, borderColor: Colors.graphiteBorder, borderRadius: BorderRadius.md, padding: Spacing.md, fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  modalHint: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, lineHeight: 18 },
  modalActions: { flexDirection: 'row', gap: Spacing.md, justifyContent: 'flex-end', marginTop: Spacing.sm },
  modalCancelBtn: { borderWidth: 1, borderColor: Colors.graphiteBorder, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, alignItems: 'center' },
  modalCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray },
  modalSaveBtn: { backgroundColor: Colors.accentGold, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, alignItems: 'center', minWidth: 80 },
  modalSaveText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.backgroundDeepNavy },
  pickerRow: { paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.graphiteBorder, gap: 2 },
  pickerName: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite },
  pickerEmail: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray },
});
