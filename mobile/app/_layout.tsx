// Root layout with auth guard, font loading, deep link handling, and navigation setup
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
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
  componentDidCatch(error: Error) {
    console.log('App Error:', error);
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

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
  });

  const { initialize, isLoading, checkVerification, pendingVerification } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    initialize().catch(console.log);
  }, []);

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
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => subscription.remove();
  }, [pendingVerification]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && !isLoading) {
      SplashScreen.hideAsync().catch(console.log);
    }
  }, [fontsLoaded, fontError, isLoading]);

  if (!fontsLoaded && !fontError) return null;

  return (
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
}
