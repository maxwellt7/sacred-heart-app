import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Screen } from '../../src/ui/Screen';
import { env, webRoutes } from '../../src/config/env';
import { colors } from '../../src/ui/theme';

const FEATURE_LINKS = [
  { href: '/audios', label: 'Audios', hint: 'Your generated hypnosis audio library' },
  { href: '/sessions', label: 'Sessions', hint: 'Full history of your daily sessions' },
  { href: '/insights', label: 'Insights', hint: 'Patterns and progress analytics' },
  { href: '/identity', label: 'Identity', hint: 'Your values hierarchy and beliefs' },
  { href: '/reference', label: 'Reference', hint: 'The NLP pattern codex' },
] as const;

function AccountActions() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          signOut().catch(() => undefined);
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and removes access on this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            setBusy(true);
            try {
              await user.delete();
              await signOut().catch(() => undefined);
            } catch {
              Alert.alert('Could not delete account', 'Please try again, or contact support.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Account</Text>
      <Pressable
        style={styles.rowButton}
        onPress={handleSignOut}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Sign out of your account"
      >
        <Text style={styles.rowButtonText}>Sign out</Text>
      </Pressable>
      <Pressable
        style={styles.rowButton}
        onPress={handleDelete}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Delete your account permanently"
      >
        <Text style={styles.deleteText}>{busy ? 'Deleting...' : 'Delete account'}</Text>
      </Pressable>
    </View>
  );
}

export default function MoreScreen() {
  return (
    <Screen title="More" subtitle="Your library, account, and legal information.">
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Library</Text>
        {FEATURE_LINKS.map((item) => (
          <Link key={item.href} href={item.href} asChild>
            <Pressable style={styles.linkRow} accessibilityRole="link" accessibilityLabel={item.label}>
              <View style={styles.linkText}>
                <Text style={styles.linkLabel}>{item.label}</Text>
                <Text style={styles.linkHint}>{item.hint}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </Link>
        ))}
      </View>

      {env.clerkPublishableKey ? <AccountActions /> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal</Text>
        <Pressable
          style={styles.linkRow}
          onPress={() => Linking.openURL(webRoutes.privacy)}
          accessibilityRole="link"
          accessibilityLabel="Open the privacy policy"
        >
          <Text style={styles.linkLabel}>Privacy Policy</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable
          style={styles.linkRow}
          onPress={() => Linking.openURL(webRoutes.terms)}
          accessibilityRole="link"
          accessibilityLabel="Open the terms of service"
        >
          <Text style={styles.linkLabel}>Terms of Service</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    gap: 2,
  },
  sectionTitle: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  linkText: { flex: 1, gap: 2 },
  linkLabel: { color: colors.text, fontSize: 16, fontWeight: '500' },
  linkHint: { color: colors.textMuted, fontSize: 12 },
  chevron: { color: colors.textFaint, fontSize: 22, marginLeft: 8 },
  rowButton: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },
  rowButtonText: { color: colors.text, fontSize: 16, fontWeight: '500' },
  deleteText: { color: '#F87171', fontSize: 16, fontWeight: '500' },
});
