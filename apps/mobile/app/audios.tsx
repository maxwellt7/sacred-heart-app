import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../src/services/api';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { EmptyState, ErrorState, InlineError, LoadingState } from '../src/ui/states';
import { OfflineBanner } from '../src/ui/OfflineBanner';
import { colors } from '../src/ui/theme';

type SavedScript = {
  id: string;
  title: string;
  duration: string;
  estimatedMinutes: number;
  script: string;
  audioFile: string | null;
  voiceId?: string | null;
  voiceLabel?: string | null;
  createdAt: string;
};

type VoiceOption = {
  id: string;
  key: string;
  label: string;
  description: string;
  isDefault: boolean;
};

type Generating = { scriptId: string; jobId: string };

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AudiosScreen() {
  const router = useRouter();
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceByScript, setSelectedVoiceByScript] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<Generating | null>(null);

  const { playingId, error: playError, toggle, stop, clearError } = useAudioPlayer();
  const resumeCheckedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadScripts = useCallback(async (): Promise<SavedScript[]> => {
    const data = await api.listScripts();
    const next: SavedScript[] = Array.isArray(data?.scripts) ? data.scripts : [];
    setScripts(next);
    setSelectedVoiceByScript((prev) => {
      const merged = { ...prev };
      for (const script of next) {
        if (script.voiceId && !merged[script.id]) {
          merged[script.id] = script.voiceId;
        }
      }
      return merged;
    });
    return next;
  }, []);

  const loadVoices = useCallback(async () => {
    try {
      const data = await api.listVoices();
      setVoices(Array.isArray(data?.voices) ? data.voices : []);
    } catch {
      // Voices are optional; generation falls back to the server default.
    }
  }, []);

  // After a cold start, re-attach to any server-side render still in progress.
  const resumeActiveJob = useCallback(async (loaded: SavedScript[]) => {
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;
    const pending = loaded.filter((s) => !s.audioFile);
    for (const script of pending) {
      if (!mountedRef.current) return;
      try {
        const active = await api.audioGetActiveJob(script.id);
        if (active?.jobId) {
          if (mountedRef.current) setGenerating({ scriptId: script.id, jobId: active.jobId });
          return;
        }
      } catch {
        // ignore; best-effort resume
      }
    }
  }, []);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [loaded] = await Promise.all([loadScripts(), loadVoices()]);
      resumeActiveJob(loaded).catch(() => undefined);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load scripts');
    } finally {
      setLoading(false);
    }
  }, [loadScripts, loadVoices, resumeActiveJob]);

  useEffect(() => {
    initialLoad().catch(() => undefined);
  }, [initialLoad]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadScripts(), loadVoices()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }, [loadScripts, loadVoices]);

  // Generation polling: server owns the work, we only track a jobId. Polling
  // pauses while backgrounded and resumes immediately on foreground.
  useEffect(() => {
    if (!generating) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const result = await api.audioGenerateStatus(generating.jobId);
        if (cancelled) return;
        if (result.status === 'complete') {
          await loadScripts();
          if (!cancelled) setGenerating(null);
          return;
        }
        if (result.status === 'failed') {
          setError(result.error || 'Audio generation failed');
          setGenerating(null);
          return;
        }
        timer = setTimeout(poll, 4000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 7000);
      } finally {
        inFlight = false;
      }
    };

    poll().catch(() => undefined);

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        poll().catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [generating, loadScripts]);

  const startGenerate = useCallback(
    async (scriptId: string) => {
      setError(null);
      try {
        const voiceId = selectedVoiceByScript[scriptId];
        const started = await api.audioGenerateStart(scriptId, undefined, undefined, voiceId);
        setGenerating({ scriptId, jobId: started.jobId });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start audio generation');
      }
    },
    [selectedVoiceByScript],
  );

  const handleDelete = useCallback(
    async (scriptId: string) => {
      if (playingId === scriptId) await stop();
      try {
        await api.deleteScript(scriptId);
        setScripts((prev) => prev.filter((s) => s.id !== scriptId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete script');
      }
    },
    [playingId, stop],
  );

  const cycleVoice = useCallback(
    (scriptId: string) => {
      if (voices.length === 0) return;
      setSelectedVoiceByScript((prev) => {
        const currentId = prev[scriptId] || voices.find((v) => v.isDefault)?.id || voices[0]?.id;
        const idx = voices.findIndex((v) => v.id === currentId);
        const nextVoice = voices[(idx + 1) % voices.length];
        return { ...prev, [scriptId]: nextVoice.id };
      });
    },
    [voices],
  );

  const displayError = error || playError;

  const renderItem = useCallback(
    ({ item }: { item: SavedScript }) => {
      const isGenerating = generating?.scriptId === item.id;
      const isPlaying = playingId === item.id;
      const isExpanded = expandedId === item.id;
      const selectedVoiceId =
        selectedVoiceByScript[item.id] || voices.find((v) => v.isDefault)?.id || voices[0]?.id || '';
      const selectedVoice = voices.find((v) => v.id === selectedVoiceId);

      return (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.cardInfo}>
              <View style={styles.titleRow}>
                <Text style={styles.scriptTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={[styles.tag, item.duration === 'full' ? styles.tagFull : styles.tagShort]}>
                  <Text style={styles.tagText}>~{item.estimatedMinutes} min</Text>
                </View>
                {item.audioFile ? (
                  <View style={[styles.tag, styles.tagAudio]}>
                    <Text style={styles.tagText}>Audio Ready</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            {item.audioFile ? (
              <Pressable
                style={[styles.actionButton, isPlaying ? styles.stopButton : styles.playButton]}
                onPress={() => toggle(item.id, api.getAudioUrl(item.audioFile as string))}
                accessibilityRole="button"
              >
                <Text style={styles.actionButtonText}>{isPlaying ? 'Stop' : 'Play'}</Text>
              </Pressable>
            ) : (
              <>
                {voices.length > 0 ? (
                  <Pressable style={styles.voiceButton} onPress={() => cycleVoice(item.id)} accessibilityRole="button">
                    <Text style={styles.voiceLabel} numberOfLines={1}>
                      {selectedVoice?.label || 'Voice'}
                    </Text>
                    <Text style={styles.voiceHint}>tap to change</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.actionButton, styles.playButton, isGenerating && styles.disabledButton]}
                  onPress={() => startGenerate(item.id)}
                  disabled={isGenerating}
                  accessibilityRole="button"
                >
                  {isGenerating ? (
                    <View style={styles.generatingRow}>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={styles.actionButtonText}>Generating</Text>
                    </View>
                  ) : (
                    <Text style={styles.actionButtonText}>Generate Audio</Text>
                  )}
                </Pressable>
              </>
            )}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setExpandedId(isExpanded ? null : item.id)}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>{isExpanded ? 'Hide' : 'Script'}</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => handleDelete(item.id)} accessibilityRole="button">
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>

          {isExpanded ? (
            <ScrollView style={styles.scriptBox} nestedScrollEnabled>
              <Text style={styles.scriptBody}>{item.script}</Text>
            </ScrollView>
          ) : null}
        </View>
      );
    },
    [
      generating,
      playingId,
      expandedId,
      selectedVoiceByScript,
      voices,
      toggle,
      cycleVoice,
      startGenerate,
      handleDelete,
    ],
  );

  const header = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Audios</Text>
        <Text style={styles.subtitle}>Your saved hypnosis scripts and generated audio files.</Text>
        {displayError ? (
          <InlineError
            message={displayError}
            onDismiss={() => {
              setError(null);
              clearError();
            }}
          />
        ) : null}
      </View>
    ),
    [displayError, clearError],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <LoadingState label="Loading scripts..." />
      </SafeAreaView>
    );
  }

  if (loadError && scripts.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <ErrorState message={loadError} onRetry={initialLoad} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <OfflineBanner />
      <FlatList
        data={scripts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        ListEmptyComponent={
          <EmptyState
            title="No scripts yet"
            message="Generate one from the Session (Hypnosis) page."
            action={{ label: 'Go to Session', onPress: () => router.push('/(tabs)/hypnosis') }}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  separator: { height: 14 },
  headerBlock: { gap: 8, marginBottom: 16 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 14 },
  cardTop: { flexDirection: 'row' },
  cardInfo: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  scriptTitle: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tagFull: { backgroundColor: 'rgba(49,46,129,0.5)' },
  tagShort: { backgroundColor: 'rgba(6,78,59,0.5)' },
  tagAudio: { backgroundColor: 'rgba(88,28,135,0.5)' },
  tagText: { color: colors.textSecondary, fontSize: 11 },
  dateText: { color: colors.textFaint, fontSize: 12 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  actionButton: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  playButton: { backgroundColor: '#7C3AED' },
  stopButton: { backgroundColor: '#DC2626' },
  actionButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  generatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceButton: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 140 },
  voiceLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  voiceHint: { color: colors.textFaint, fontSize: 10 },
  secondaryButton: { backgroundColor: colors.surfaceMuted, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryButtonText: { color: colors.textSecondary, fontSize: 13 },
  deleteText: { color: '#F87171', fontSize: 13 },
  disabledButton: { opacity: 0.55 },
  scriptBox: { maxHeight: 280, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  scriptBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
});
