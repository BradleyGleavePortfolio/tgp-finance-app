// Coach dashboard (coach role) / AI Chat (students)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, FlatList } from 'react-native';
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

  useEffect(() => {
    fetchStudents();
    fetchAlerts();
  }, []);

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
            <Text style={styles.sectionTitle}>🚨 Red Flags ({alerts.length})</Text>
            {alerts.map((alert, i) => (
              <Card key={i} variant="crimson" style={styles.alertCard}>
                <Text style={styles.alertStudent}>{alert.student_name}</Text>
                <Text style={styles.alertMessage}>{alert.message}</Text>
              </Card>
            ))}
          </View>
        )}

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
            <EmptyState icon="👥" title="No students yet" description="Students will appear here once they join and complete onboarding." />
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
});
