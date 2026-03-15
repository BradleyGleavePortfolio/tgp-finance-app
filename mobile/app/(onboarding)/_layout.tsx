import { Stack } from 'expo-router';
import { Colors } from '../../src/theme/finance';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.backgroundDeepNavy },
        animation: 'slide_from_right',
        gestureEnabled: false,
      }}
    />
  );
}
