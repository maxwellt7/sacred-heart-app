import { Stack } from 'expo-router';
import { ClerkLoaded, ClerkLoading, ClerkProvider } from '@clerk/clerk-expo';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { tokenCache } from '../src/lib/token-cache';
import { env, getMissingRequiredEnv } from '../src/config/env';

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

function ConfigErrorScreen({ missing }: { missing: string[] }) {
  return (
    <View style={styles.configContainer}>
      <StatusBar style="light" />
      <Text style={styles.configTitle}>Configuration Error</Text>
      <Text style={styles.configCopy}>
        This build is missing required configuration and cannot run securely. Set the following before
        building:
      </Text>
      {missing.map((key) => (
        <Text key={key} style={styles.configKey}>
          {key}
        </Text>
      ))}
    </View>
  );
}

export default function RootLayout() {
  // Fail fast in release builds rather than silently bypassing auth/paywall or
  // denying every signed-in user. In development we allow running without env
  // for local iteration.
  const missingEnv = getMissingRequiredEnv();
  if (!__DEV__ && missingEnv.length > 0) {
    return <ConfigErrorScreen missing={missingEnv} />;
  }

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
  configContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0F19',
    paddingHorizontal: 28,
    gap: 10,
  },
  configTitle: {
    color: '#FB7185',
    fontSize: 20,
    fontWeight: '700',
  },
  configCopy: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  configKey: {
    color: '#D4A853',
    fontSize: 14,
    fontFamily: 'Courier',
    fontWeight: '600',
  },
});
