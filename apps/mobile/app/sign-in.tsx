import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSSO } from '@clerk/clerk-expo';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Screen } from '../src/ui/Screen';
import { webRoutes } from '../src/config/env';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const router = useRouter();
  const { startSSOFlow } = useSSO();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await startSSOFlow({ strategy: 'oauth_google' });
      if (result.createdSessionId) {
        await result.setActive?.({ session: result.createdSessionId });
        router.replace('/(tabs)/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      title="Sacred Heart"
      subtitle="Sign in to access sessions, audio generation, and your progress."
    >
      <Pressable
        onPress={handleGoogleSignIn}
        disabled={submitting}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.buttonPressed,
          submitting && styles.buttonDisabled,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {submitting ? 'Connecting...' : 'Continue with Google'}
        </Text>
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.helperRow}>
        <Text style={styles.helperText}>Need account setup on web first?</Text>
        <Pressable onPress={() => Linking.openURL(webRoutes.signUp)}>
          <Text style={styles.linkText}>Open sign-up</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  primaryButton: {
    borderRadius: 12,
    backgroundColor: '#D4A853',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#0B0F19',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  helperRow: {
    marginTop: 8,
    gap: 8,
  },
  helperText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  linkText: {
    color: '#D4A853',
    fontSize: 14,
  },
  errorText: {
    color: '#FB7185',
    fontSize: 14,
  },
});
