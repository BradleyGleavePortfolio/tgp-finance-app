// Entry redirect — routes based on auth state
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading, hasCompletedOnboarding } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    } else if (!hasCompletedOnboarding) {
      router.replace('/(onboarding)/quiz');
    } else {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, hasCompletedOnboarding]);

  return <LoadingSpinner fullScreen text="Loading TGP Finance..." />;
}
