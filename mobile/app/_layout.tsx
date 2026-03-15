// Root layout with auth guard, font loading, and navigation setup
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
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

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
  });

  const { initialize, isLoading } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (fontsLoaded && !isLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isLoading]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <>
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
        <Stack.Screen name="settings/notifications" />
        <Stack.Screen name="settings/security" />
      </Stack>
    </>
  );
}
