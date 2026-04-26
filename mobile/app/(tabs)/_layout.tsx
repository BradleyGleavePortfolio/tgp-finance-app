// Bottom tab navigator — 4 tabs, icons-only, 0.5px hairline (Wave 3)
// Goals merged into Coach as a section per brief.
// Label hidden (tabBarShowLabel: false) — luxury standard.
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/stores/authStore';

export default function TabsLayout() {
  const { user } = useAuthStore();
  const isCoach = user?.role === 'coach';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.bone,
          borderTopWidth: 0.5,
          borderTopColor: colors.stone,
          height: 64,
        },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.stone,
        // Consistent icon size (24 dp)
        tabBarIconStyle: { width: 24, height: 24 },
      }}
    >
      {/* 1. Home */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home tab',
          tabBarIcon: ({ color }) => (
            <Ionicons name="home-outline" size={24} color={color} />
          ),
        }}
      />

      {/* 2. Accounts (net worth) */}
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          tabBarAccessibilityLabel: 'Accounts tab',
          tabBarIcon: ({ color }) => (
            <Ionicons name="bar-chart-outline" size={24} color={color} />
          ),
        }}
      />

      {/* 3. Coach (Goals folded in as a section inside coach screen) */}
      <Tabs.Screen
        name="coach"
        options={{
          title: isCoach ? 'Coach' : 'AI Coach',
          tabBarAccessibilityLabel: isCoach ? 'Coach dashboard tab' : 'AI Coach tab',
          tabBarIcon: ({ color }) => (
            <Ionicons
              name={isCoach ? 'people-outline' : 'chatbubble-ellipses-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />

      {/* 4. Profile */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile tab',
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-outline" size={24} color={color} />
          ),
        }}
      />

      {/* Goals tab — hidden from bar, still routable (folded into Coach) */}
      <Tabs.Screen
        name="goals"
        options={{
          href: null, // removes from tab bar
          title: 'Goals',
        }}
      />
    </Tabs>
  );
}
