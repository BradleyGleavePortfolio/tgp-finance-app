// Entry redirect — routes based on auth state
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading, hasCompletedOnboarding } = useAuthStore();
  const [routerReady, setRouterReady] = useState(false);

  // Give expo-router time to mount before navigating
  useEffect(() => {
    const timer = setTimeout(() => setRouterReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isLoading || !routerReady) return;

    try {
      if (!isAuthenticated) {
        router.replace('/(auth)/login');
      } else if (!hasCompletedOnboarding) {
        router.replace('/(onboarding)/quiz');
      } else {
        router.replace('/(tabs)');
      }
    } catch (e) {
      console.log('Navigation error:', e);
    }
  }, [isAuthenticated, isLoading, hasCompletedOnboarding, routerReady]);

  return <LoadingSpinner fullScreen text="Loading TGP Finance..." />;
}
