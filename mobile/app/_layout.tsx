// Root layout with auth guard, font loading, deep link handling, and navigation setup
import React, { useEffect, useRef } from 'react';
import { View, Text, AppState, type AppStateStatus } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { PostHogProvider } from 'posthog-react-native';
import { initSentry, captureError, setSentryUser, wrap as sentryWrap } from '../src/services/sentry';
import { track, getPostHogClient } from '../src/lib/analytics';
import {
  registerPushTokenIfGranted,
  refreshForegroundNotifications,
} from '../src/services/notifications';
import { notificationsApi } from '../src/services/api';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { useAuthStore } from '../src/stores/authStore';
import { Colors } from '../src/theme/finance';
import { authEvents } from '../src/utils/authEvents';
import { signOut } from '../src/lib/signOut';

// Initialise Sentry as early as possible. Safe to call without a DSN — the
// helper no-ops in that case. Placed AFTER imports (ESM hoists imports anyway)
// so the call site is at module-eval time, before RootLayout mounts.
initSentry();

SplashScreen.preventAutoHideAsync();

// Error boundary to prevent crash-to-desktop
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Diagnostic: surface top-level app crashes to the JS console; __DEV__-gated to avoid noise in prod builds.
    if (__DEV__) {
      console.log('App Error:', error);
    }
    // Forward to Sentry. No-op when SDK isn't configured.
    captureError(error, { componentStack: info.componentStack });
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0D1117', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: '#F9C74F', fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>Something went wrong</Text>
          <Text style={{ color: '#8895A7', fontSize: 14, textAlign: 'center' }}>{this.state.error}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
  });

  const { initialize, isLoading, checkVerification, pendingVerification, isAuthenticated, user } = useAuthStore();

  // Tag Sentry events with the current user id whenever auth state changes.
  // No-op when Sentry isn't configured.
  useEffect(() => {
    if (isAuthenticated && user) {
      setSentryUser({ id: user.id, email: user.email });
    } else {
      setSentryUser(null);
    }
  }, [isAuthenticated, user?.id]);
  const router = useRouter();
  const notifTapSubRef = useRef<Notifications.Subscription | null>(null);

  // Track app_opened on every cold start
  useEffect(() => {
    track('app_opened');
  }, []);

  useEffect(() => {
    // Read-only init (hydrate session from storage). authStore surfaces failures via its own error state.
    initialize().catch(() => {});
  }, []);

  // Wire api.ts → authEvents.emit('logout') (fired when refresh-token rotation
  // fails) to the central signOut helper. Without this, a stale refresh token
  // would clear the access token but leave Zustand stores hydrated with the
  // previous user's data — a real privacy bug on shared devices.
  useEffect(() => {
    const off = authEvents.on('logout', () => {
      signOut().catch(() => {});
    });
    return () => {
      if (off) off();
    };
  }, []);

  // Register push token + run foreground sync once authenticated. Both are
  // safe to re-run on every auth flip; the underlying helpers dedupe.
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        await registerPushTokenIfGranted();
        const { data: prefs } = await notificationsApi.getPreferences();
        await refreshForegroundNotifications(prefs || {});
      } catch {
        // notifications are optional — never block the session on them
      }
    })();
  }, [isAuthenticated]);

  // Re-check foreground state each time the app becomes active so the
  // streak-at-risk reminder + spending-DNA guard stay up to date even across
  // multi-day background sessions.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onChange = async (state: AppStateStatus) => {
      if (state !== 'active') return;
      try {
        const { data: prefs } = await notificationsApi.getPreferences();
        await refreshForegroundNotifications(prefs || {});
      } catch {
        // best-effort
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [isAuthenticated]);

  // Notification tap-through: every notification we schedule carries a
  // `data.screen` pointing at an expo-router path. Tapping routes the user
  // straight there (EOD, milestones, Future Self letter, Spending DNA, …).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      if (typeof screen === 'string' && screen.length > 0) {
        try {
          router.push(screen as any);
        } catch {
          // ignore unknown routes
        }
      }
    });
    notifTapSubRef.current = sub;
    return () => sub.remove();
  }, [router]);

  // Handle deep links (tgp-finance://auth/callback) from email verification
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const { url } = event;
      if (url && url.includes('auth/callback') && pendingVerification) {
        // User returned from verification email — trigger verification check
        const verified = await checkVerification();
        if (verified) {
          router.replace('/(auth)/role-select');
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Also check if the app was opened via a deep link (cold start)
    // Read-only: failing to resolve a cold-start deep link just means the user lands on the default route.
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    }).catch(() => {});

    return () => subscription.remove();
  }, [pendingVerification]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && !isLoading) {
      // If the splash screen is already hidden / never mounted, the hide call throws harmlessly.
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, isLoading]);

  if (!fontsLoaded && !fontError) return null;

  // PostHog client — may be null when key is absent (NO-OP in that case)
  const postHogClient = getPostHogClient();

  const inner = (
    <ErrorBoundary>
      <StatusBar style="light" backgroundColor={Colors.backgroundDeepNavy} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.backgroundDeepNavy },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="eod/index"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen name="whatif/index" />
        <Stack.Screen name="whatif/[type]" />
        <Stack.Screen name="whatif/compare" />
        <Stack.Screen name="accounts/[id]" />
        <Stack.Screen name="accounts/add" />
        <Stack.Screen name="interest-bleed" />
        <Stack.Screen name="payday" />
        <Stack.Screen name="income-gap" />
        <Stack.Screen name="projections" />
        <Stack.Screen name="spending-dna" />
        <Stack.Screen name="milestones" />
        <Stack.Screen name="future-letter" />
        <Stack.Screen name="coach/student/[id]" />
        <Stack.Screen name="settings/notifications" />
        <Stack.Screen name="settings/security" />
      </Stack>
    </ErrorBoundary>
  );

  // Wrap with PostHogProvider only when a client is available
  if (postHogClient) {
    return (
      <PostHogProvider client={postHogClient}>
        {inner}
      </PostHogProvider>
    );
  }
  return inner;
}

// Sentry.wrap() injects automatic crash reporting + touch tracking. When the
// SDK isn't initialised (no DSN) it returns the component unchanged.
export default sentryWrap(RootLayout);
