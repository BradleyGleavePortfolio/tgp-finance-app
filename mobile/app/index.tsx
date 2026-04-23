// Entry redirect — routes based on auth state
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../src/stores/authStore';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, hasCompletedOnboarding } = useAuthStore();
  const [routerReady, setRouterReady] = useState(false);
  const [quizDone, setQuizDone] = useState(false);

  // Give expo-router time to mount before navigating
  useEffect(() => {
    const timer = setTimeout(() => setRouterReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Check if quiz was completed locally (fallback for when backend doesn't track it)
  useEffect(() => {
    // Read-only AsyncStorage lookup — treat failure as "quiz not done" and let the backend state drive.
    AsyncStorage.getItem('quiz_answers').then((val) => {
      if (val) setQuizDone(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isLoading || !routerReady) return;

    try {
      if (!isAuthenticated) {
        router.replace('/(auth)/login');
      } else if (!hasCompletedOnboarding && !quizDone && !user?.role) {
        // Only send to quiz if: backend says not complete AND no local quiz AND no role set
        router.replace('/(onboarding)/quiz');
      } else {
        router.replace('/(tabs)');
      }
    } catch (e) {
      // Navigation error — non-critical
    }
  }, [isAuthenticated, isLoading, hasCompletedOnboarding, routerReady, quizDone, user?.role]);

  return <LoadingSpinner fullScreen text="Loading TGP Finance..." />;
}
