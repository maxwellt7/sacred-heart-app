import { Stack } from 'expo-router';
import { ClerkLoaded, ClerkLoading, ClerkProvider } from '@clerk/clerk-expo';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { tokenCache } from '../src/lib/token-cache';
import { env } from '../src/config/env';

function RootNavigator() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#D4A853',
          contentStyle: { backgroundColor: '#0B0F19' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign In' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="learn/[lessonId]" options={{ title: 'Lesson' }} />
        <Stack.Screen name="audios" options={{ title: 'Audios' }} />
        <Stack.Screen name="sessions" options={{ title: 'Sessions' }} />
        <Stack.Screen name="insights" options={{ title: 'Insights' }} />
        <Stack.Screen name="identity" options={{ title: 'Identity' }} />
        <Stack.Screen name="reference" options={{ title: 'Reference' }} />
      </Stack>
    </>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator color="#D4A853" size="large" />
    </View>
  );
}

export default function RootLayout() {
  if (!env.clerkPublishableKey) {
    return <RootNavigator />;
  }

  return (
    <ClerkProvider publishableKey={env.clerkPublishableKey} tokenCache={tokenCache}>
      <ClerkLoading>
        <LoadingScreen />
      </ClerkLoading>
      <ClerkLoaded>
        <RootNavigator />
      </ClerkLoaded>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0F19',
  },
});
