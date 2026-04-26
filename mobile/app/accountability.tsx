// Accountability Partner screen
// Students: shows partner card + stats
// Coaches: shows pair-selector (two student dropdowns + Pair button)
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { EmptyState } from '../src/components/ui/EmptyState';
import { StreakBadge, VelocityBadge } from '../src/components/ui/Badge';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/finance';
import { useAuthStore } from '../src/stores/authStore';
import { coachApi } from '../src/services/api';
import api from '../src/services/api';

// ── API helpers ───────────────────────────────────────────────────────────────
const accountabilityApi = {
  getPartner: () => api.get('/api/accountability/partner'),
  pair: (student_id_1: string, student_id_2: string) =>
    api.post('/api/accountability/pair', { student_id_1, student_id_2 }),
};

// ── Priority Waterfall labels ─────────────────────────────────────────────────
const PRIORITY_LABELS = [
  'Build $1K Cash Buffer',
  'Pay Off High-APR Debt',
  'Build 3-Month Emergency Fund',
  'Maximize Tax-Advantaged Investing',
  'Pay Off Remaining Secured Debt',
  'Build Investment Portfolio',
  'Financial Independence',
];

export default function AccountabilityScreen() {
  const { user } = useAuthStore();
  const isCoach = user?.role === 'coach';
  return isCoach ? <CoachPairView /> : <StudentPartnerView />;
}

// ── Student view: partner card ────────────────────────────────────────────────
function StudentPartnerView() {
  const router = useRouter();
  const [partner, setPartner] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPartner();
  }, []);

  const loadPartner = async () => {
    setLoading(true);
    try {
      const { data } = await accountabilityApi.getPartner();
      setPartner(data?.partner || null);
      setMessage(data?.message || '');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to load accountability partner.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Accountability Partner</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.accentGold} />
            <Text style={styles.loadingText}>Loading partner info...</Text>
          </View>
        ) : partner ? (
          <>
            {/* Partner card */}
            <Card style={styles.partnerCard}>
              <View style={styles.partnerAvatar}>
                <Text style={styles.partnerAvatarText}>
                  {(partner.name || 'P').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.partnerName}>{partner.name}</Text>
              <View style={styles.partnerBadges}>
                <StreakBadge streak={partner.streak_days || 0} />
                <VelocityBadge score={partner.wealth_velocity_score || 0} showScore />
              </View>

              <View style={styles.partnerStats}>
                <View style={styles.partnerStat}>
                  <Text style={styles.partnerStatValue}>
                    {PRIORITY_LABELS[partner.current_priority_index] || `Level ${partner.current_priority_index}`}
                  </Text>
                  <Text style={styles.partnerStatLabel}>Current Priority</Text>
                </View>
                <View style={styles.partnerStatDivider} />
                <View style={styles.partnerStat}>
                  <Text style={[
                    styles.partnerStatValue,
                    { color: partner.submitted_today ? Colors.profitGreen : Colors.debtCrimson },
                  ]}>
                    {partner.submitted_today ? 'Done ✓' : 'Pending'}
                  </Text>
                  <Text style={styles.partnerStatLabel}>Today's Check-in</Text>
                </View>
              </View>
            </Card>

            <Text style={styles.infoText}>
              Your accountability partner's name, streak, velocity score, and current priority level are
              visible. Balance details remain private.
            </Text>
          </>
        ) : (
          <EmptyState
            icon="🤝"
            title="No partner yet"
            description={message || 'Your coach will assign you an accountability partner. Check back later.'}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Coach view: pair two students ─────────────────────────────────────────────
function CoachPairView() {
  const router = useRouter();
  const [students, setStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [student1Id, setStudent1Id] = useState('');
  const [student2Id, setStudent2Id] = useState('');
  const [pairing, setPairing] = useState(false);

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setLoadingStudents(true);
    try {
      const { data } = await coachApi.getStudents();
      const list = Array.isArray(data) ? data : data?.students || [];
      setStudents(list);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to load students.');
    } finally {
      setLoadingStudents(false);
    }
  };

  const handlePair = async () => {
    if (!student1Id || !student2Id) {
      Alert.alert('Select both students', 'Please select two students to pair as accountability partners.');
      return;
    }
    if (student1Id === student2Id) {
      Alert.alert('Invalid selection', 'Please select two different students.');
      return;
    }
    setPairing(true);
    try {
      const { data } = await accountabilityApi.pair(student1Id, student2Id);
      Alert.alert('Paired', data?.message || 'Students have been paired as accountability partners.');
      setStudent1Id('');
      setStudent2Id('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to pair students.');
    } finally {
      setPairing(false);
    }
  };

  const StudentSelector = ({
    label,
    selectedId,
    onSelect,
    excludeId,
  }: {
    label: string;
    selectedId: string;
    onSelect: (id: string) => void;
    excludeId?: string;
  }) => {
    const available = students.filter(s => s.user.id !== excludeId);
    const selected = students.find(s => s.user.id === selectedId);
    return (
      <View style={styles.selectorContainer}>
        <Text style={styles.selectorLabel}>{label}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selectorRow}
        >
          {available.map((s) => (
            <TouchableOpacity
              key={s.user.id}
              style={[styles.selectorChip, selectedId === s.user.id && styles.selectorChipActive]}
              onPress={() => onSelect(s.user.id)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${s.user.name} as ${label}`}
              accessibilityState={{ selected: selectedId === s.user.id }}
            >
              <Text style={[styles.selectorChipText, selectedId === s.user.id && styles.selectorChipTextActive]}>
                {s.user.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {selected && (
          <Text style={styles.selectorSelected}>Selected: {selected.user.name}</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pair Students</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.coachSubtitle}>
          Pair two of your students as accountability partners. They'll be able to see each
          other's streak, velocity score, and priority level (but not balances).
        </Text>

        {loadingStudents ? (
          <ActivityIndicator size="large" color={Colors.accentGold} style={{ marginTop: Spacing.xl }} />
        ) : students.length < 2 ? (
          <EmptyState
            icon="👥"
            title="Need at least 2 students"
            description="You need at least 2 students to create an accountability pair."
          />
        ) : (
          <>
            <StudentSelector
              label="Student 1"
              selectedId={student1Id}
              onSelect={setStudent1Id}
              excludeId={student2Id}
            />
            <StudentSelector
              label="Student 2"
              selectedId={student2Id}
              onSelect={setStudent2Id}
              excludeId={student1Id}
            />
            <Button
              title={pairing ? 'Pairing...' : 'Pair as Accountability Partners'}
              onPress={handlePair}
              loading={pairing}
              variant="primary"
              fullWidth
              size="lg"
              style={styles.pairBtn}
              accessibilityLabel="Pair the two selected students as accountability partners"
            />
          </>
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
  content: { padding: Spacing.base, paddingBottom: 100 },
  loadingContainer: { flex: 1, alignItems: 'center', paddingTop: Spacing.xxxl, gap: Spacing.md },
  loadingText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray },
  partnerCard: { padding: Spacing.xl, alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xl },
  partnerAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.accentGold, alignItems: 'center', justifyContent: 'center' },
  partnerAvatarText: { fontFamily: 'Inter_700Bold', fontSize: 30, color: Colors.backgroundDeepNavy },
  partnerName: { fontFamily: 'Inter_700Bold', fontSize: Typography.titleMedium, color: Colors.frostWhite },
  partnerBadges: { flexDirection: 'row', gap: Spacing.md },
  partnerStats: { flexDirection: 'row', gap: Spacing.xl, marginTop: Spacing.sm },
  partnerStat: { alignItems: 'center', gap: 4 },
  partnerStatValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: Typography.bodySmall, color: Colors.accentGold, textAlign: 'center' },
  partnerStatLabel: { fontFamily: 'Inter_400Regular', fontSize: Typography.microLabel, color: Colors.slateGray, textAlign: 'center' },
  partnerStatDivider: { width: 1, height: 40, backgroundColor: Colors.graphiteBorder },
  infoText: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.slateGray, textAlign: 'center', lineHeight: 20 },
  coachSubtitle: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodyMedium, color: Colors.slateGray, lineHeight: 22, marginBottom: Spacing.xl },
  selectorContainer: { marginBottom: Spacing.xl },
  selectorLabel: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodyMedium, color: Colors.frostWhite, marginBottom: Spacing.sm },
  selectorRow: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  selectorChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.graphiteBorder },
  selectorChipActive: { backgroundColor: Colors.accentGold, borderColor: Colors.accentGold },
  selectorChipText: { fontFamily: 'Inter_600SemiBold', fontSize: Typography.bodySmall, color: Colors.slateGray },
  selectorChipTextActive: { color: Colors.backgroundDeepNavy },
  selectorSelected: { fontFamily: 'Inter_400Regular', fontSize: Typography.bodySmall, color: Colors.profitGreen, marginTop: Spacing.xs },
  pairBtn: { marginTop: Spacing.xl },
});
