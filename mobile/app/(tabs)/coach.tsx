// Coach dashboard (coach role) / AI Chat (students)
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChatPanel } from '../../src/components/ai/ChatPanel';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { Colors } from '../../src/theme/finance';
import { useAuthStore } from '../../src/stores/authStore';
import { ScreenErrorBoundary } from '../../src/components/ui/ScreenErrorBoundary';

// Pre-TestFlight: collapse to ONE Coach OS. The legacy dashboard that used
// to live here was a Stage-1 fallback while the Stage-2 module stabilised;
// running both surfaces in parallel meant coaches had to learn two
// information architectures and the audit flagged it. Coaches now route
// straight to /coach (Coach OS) on tab activation. Students continue to
// see the AI chat panel here.
export default function CoachScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const isCoach = user?.role === 'coach';

  useEffect(() => {
    if (isCoach) {
      // Use replace so back-tap doesn't return them to a stale empty tab.
      router.replace('/coach');
    }
  }, [isCoach, router]);

  if (isCoach) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen />
      </View>
    );
  }
  return <StudentAIChat />;
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
});
