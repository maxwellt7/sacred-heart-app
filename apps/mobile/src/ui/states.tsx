import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.mutedText}>{label}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.retryButton} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {action ? (
        <Pressable style={styles.retryButton} onPress={action.onPress} accessibilityRole="button">
          <Text style={styles.retryButtonText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function InlineError({
  message,
  onDismiss,
  onRetry,
}: {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.inlineError}>
      <Text style={styles.inlineErrorText}>{message}</Text>
      <View style={styles.inlineErrorActions}>
        {onRetry ? (
          <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.inlineErrorAction}>Retry</Text>
          </Pressable>
        ) : null}
        {onDismiss ? (
          <Pressable onPress={onDismiss} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.inlineErrorAction}>Dismiss</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 10,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  errorMessage: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyMessage: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 360,
  },
  retryButton: {
    marginTop: 6,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 14,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inlineErrorText: {
    color: '#FCA5A5',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  inlineErrorActions: {
    flexDirection: 'row',
    gap: 14,
  },
  inlineErrorAction: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '700',
  },
});
