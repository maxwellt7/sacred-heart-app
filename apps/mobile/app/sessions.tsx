import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../src/services/api';
import { useApiResource } from '../src/hooks/useApiResource';
import { dateKeyToDate } from '../src/lib/date';
import { EmptyState, ErrorState, LoadingState } from '../src/ui/states';
import { OfflineBanner } from '../src/ui/OfflineBanner';
import { colors } from '../src/ui/theme';

type SessionSummary = {
  id: string;
  date_key: string;
  chat_summary: string;
  detected_map: string;
  detected_state: string;
  key_themes: string[];
  mood_before: number | null;
  mood_after: number | null;
  user_rating: number | null;
  script_id: string | null;
  audio_file: string | null;
  created_at: string;
};

const MAP_LABELS: Record<string, string> = {
  map1: 'Work / Adult',
  map2: 'Social / Adolescent',
  map3: 'Home / Childhood',
};

function stateColor(state: string): string {
  if (state === 'capacity') return colors.success;
  if (state === 'discharge') return '#EF4444';
  return colors.warning;
}

function monthLabel(dateKey: string): string {
  const d = dateKeyToDate(dateKey);
  return d ? d.toLocaleDateString('en', { month: 'short' }) : '—';
}

function dayLabel(dateKey: string): string {
  const d = dateKeyToDate(dateKey);
  return d ? String(d.getDate()) : '–';
}

function ratingStars(rating: number | null): number {
  return Math.max(0, Math.min(5, Math.floor(Number(rating) || 0)));
}

export default function SessionsScreen() {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, loading, refreshing, error, refresh, retry } = useApiResource<SessionSummary[]>(
    async () => {
      const payload = await api.getSessions(50);
      return Array.isArray(payload?.sessions) ? payload.sessions : [];
    },
    [],
  );

  const openSession = useCallback(
    (sessionId: string) => {
      router.push({ pathname: '/(tabs)/hypnosis', params: { sessionId } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: SessionSummary }) => {
      const isExpanded = expanded === item.id;
      return (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Pressable style={styles.cardMain} onPress={() => openSession(item.id)} accessibilityRole="button">
              <View style={styles.dateBadge}>
                <Text style={styles.dateMonth}>{monthLabel(item.date_key)}</Text>
                <Text style={styles.dateDay}>{dayLabel(item.date_key)}</Text>
              </View>
              <View style={styles.cardBody}>
                {item.chat_summary ? (
                  <Text style={styles.summary} numberOfLines={2}>
                    {item.chat_summary}
                  </Text>
                ) : (
                  <Text style={styles.summaryEmpty}>Session in progress...</Text>
                )}
                <View style={styles.metaRow}>
                  {item.detected_map ? (
                    <Text style={styles.mapTag}>{MAP_LABELS[item.detected_map] || item.detected_map}</Text>
                  ) : null}
                  {item.detected_state ? (
                    <Text style={[styles.stateTag, { color: stateColor(item.detected_state) }]}>
                      {item.detected_state}
                    </Text>
                  ) : null}
                  {item.key_themes?.slice(0, 3).map((theme, i) => (
                    <Text key={`${item.id}-theme-${i}`} style={styles.theme}>
                      #{theme}
                    </Text>
                  ))}
                  {ratingStars(item.user_rating) ? (
                    <Text style={styles.rating}>{'★'.repeat(ratingStars(item.user_rating))}</Text>
                  ) : null}
                  {item.audio_file ? <Text style={styles.audioTag}>Audio</Text> : null}
                </View>
              </View>
            </Pressable>
            <Pressable
              style={styles.expandButton}
              onPress={() => setExpanded(isExpanded ? null : item.id)}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? 'Collapse session details' : 'Expand session details'}
              hitSlop={8}
            >
              <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
            </Pressable>
          </View>

          {isExpanded ? (
            <View style={styles.detail}>
              <View style={styles.moodRow}>
                {item.mood_before !== null ? (
                  <Text style={styles.moodText}>
                    <Text style={styles.moodLabel}>Mood before: </Text>
                    {item.mood_before}/10
                  </Text>
                ) : null}
                {item.mood_after !== null ? (
                  <Text style={styles.moodText}>
                    <Text style={styles.moodLabel}>Mood after: </Text>
                    {item.mood_after}/10
                  </Text>
                ) : null}
              </View>
              {item.chat_summary ? <Text style={styles.detailSummary}>{item.chat_summary}</Text> : null}
              <Pressable style={styles.continueButton} onPress={() => openSession(item.id)} accessibilityRole="button">
                <Text style={styles.continueButtonText}>
                  {item.script_id ? 'Review Session' : 'Continue Session'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      );
    },
    [expanded, openSession],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <OfflineBanner />
      {loading ? (
        <LoadingState label="Loading sessions..." />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
          }
          ListHeaderComponent={<Text style={styles.heading}>Session History</Text>}
          ListEmptyComponent={
            <EmptyState
              title="No sessions yet"
              message="Start your first daily session to begin building your history."
            />
          }
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={7}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    flexGrow: 1,
  },
  heading: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 14,
  },
  separator: {
    height: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 10,
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  dateBadge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMonth: {
    color: colors.purple,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dateDay: {
    color: colors.purple,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  summary: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 19,
  },
  summaryEmpty: {
    color: colors.textFaint,
    fontSize: 14,
    fontStyle: 'italic',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  mapTag: {
    color: colors.textMuted,
    fontSize: 11,
    backgroundColor: colors.borderStrong,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  stateTag: {
    fontSize: 11,
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  theme: {
    color: colors.textFaint,
    fontSize: 11,
  },
  rating: {
    color: colors.accent,
    fontSize: 11,
  },
  audioTag: {
    color: colors.purple,
    fontSize: 11,
  },
  expandButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  expandIcon: {
    color: colors.textFaint,
    fontSize: 12,
  },
  detail: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  moodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  moodText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  moodLabel: {
    color: colors.textFaint,
  },
  detailSummary: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  continueButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.info,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
