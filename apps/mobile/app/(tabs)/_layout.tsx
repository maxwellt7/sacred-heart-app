import { Redirect, Tabs } from 'expo-router';
import { SignedIn, SignedOut, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { env } from '../../src/config/env';
import { AuthTokenProvider } from '../../src/providers/AuthTokenProvider';
import { useAccessGate } from '../../src/hooks/useAccessGate';

function TabsNavigator() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0B0F19' },
        headerTintColor: '#D4A853',
        tabBarStyle: { backgroundColor: '#111827', borderTopColor: '#1F2937' },
        tabBarActiveTintColor: '#D4A853',
        tabBarInactiveTintColor: '#64748B',
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Command',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="hypnosis"
        options={{
          title: 'Session',
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Learn',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: 'Drill',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbox-ellipses-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

function AccessGate() {
  const { user } = useUser();
  const primaryEmail = user?.emailAddresses?.[0]?.emailAddress ?? null;
  const { loading, hasAccess, openPurchase, refresh } = useAccessGate({
    userId: user?.id,
    email: primaryEmail,
  });

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#D4A853" size="large" />
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Upgrade Required</Text>
        <Text style={styles.copy}>
          This mobile app is linked to paid account access. Upgrade on web and then return here.
        </Text>
        <Pressable style={styles.primaryButton} onPress={openPurchase}>
          <Text style={styles.primaryButtonText}>Open Checkout</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={refresh}>
          <Text style={styles.secondaryButtonText}>I upgraded, refresh access</Text>
        </Pressable>
      </View>
    );
  }

  return <TabsNavigator />;
}

export default function TabsLayout() {
  if (!env.clerkPublishableKey) {
    return <TabsNavigator />;
  }

  return (
    <>
      <SignedIn>
        <AuthTokenProvider>
          <AccessGate />
        </AuthTokenProvider>
      </SignedIn>
      <SignedOut>
        <Redirect href="/sign-in" />
      </SignedOut>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0F19',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
  },
  copy: {
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: '#D4A853',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#0B0F19',
    fontWeight: '700',
  },
  secondaryButton: {
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontWeight: '600',
  },
});
