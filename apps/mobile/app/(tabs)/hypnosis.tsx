import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/services/api';
import { useJobPolling } from '../../src/hooks/useJobPolling';
import { OfflineBanner } from '../../src/ui/OfflineBanner';
import { InlineError } from '../../src/ui/states';
import { MysteryBox } from '../../src/ui/MysteryBox';
import { colors } from '../../src/ui/theme';
import {
  resolveInitialHypnosisTarget,
  type HypnosisSessionType,
} from '../../src/lib/hypnosisLaunch';
import { canShowCreateHypnosisCTA, isSessionMarkedReady } from '../../src/lib/hypnosisReadiness';

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  eventType?: string;
  generatedAt?: string;
};

type SessionSummary = {
  id: string;
  session_type: HypnosisSessionType;
  session_status?: string;
  title?: string;
  chat_summary?: string;
  date_key?: string | null;
  last_message_at?: string | null;
  hypnosis_generated_at?: string | null;
  locked_at?: string | null;
  is_locked?: boolean;
  created_at?: string;
  user_rating?: number | null;
  chat_messages?: Message[] | string;
};

type ScriptResult = {
  title: string;
  duration: string;
  estimatedMinutes: number;
  script: string;
  sessionSummary?: string;
  keyThemes?: string[];
};

type VoiceOption = { id: string; label: string; isDefault: boolean };
type MusicTrack = { filename: string; name: string };

const jobKey = (sessionId: string) => `hypnosis-job-${sessionId}`;
const audioJobKey = (scriptId: string) => `audio-job-${scriptId}`;

async function readStored(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}
async function writeStored(key: string, value: string) {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // best-effort
  }
}
async function clearStored(key: string) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

function parseMessages(raw: unknown): Message[] {
  if (Array.isArray(raw)) return raw as Message[];
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeSession(session: any): SessionSummary | null {
  if (!session?.id) return null;
  return {
    ...session,
    key_themes: Array.isArray(session.key_themes) ? session.key_themes : [],
    is_locked: Boolean(session.is_locked || session.locked_at || session.session_status === 'locked'),
  };
}

function formatTitle(session: SessionSummary | null): string {
  if (!session) return 'Conversation';
  if (session.title && session.title.trim()) return session.title.trim();
  if (session.session_type === 'daily_hypnosis') {
    const label = session.date_key || session.created_at || session.last_message_at;
    if (label) {
      return `Daily Session · ${new Date(label).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }
    return 'Daily Session';
  }
  return 'Untitled Conversation';
}

function formatTimestamp(value?: string | null): string {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusPills(session: SessionSummary | null): string[] {
  if (!session) return [];
  const pills = [session.session_type === 'daily_hypnosis' ? 'Daily' : 'Chat'];
  if (session.is_locked) pills.push('Locked');
  else if (session.hypnosis_generated_at) pills.push('Hypnosis Generated');
  else if (session.session_status === 'ready_for_hypnosis') pills.push('Ready');
  else pills.push('Open');
  return pills;
}

function renderScript(script: string) {
  const parts = script.split(/<break\s+time="([\d.]+)s"\s*\/>/g);
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (i % 2 === 0) {
      const text = parts[i];
      if (text && text.trim()) {
        nodes.push(
          <Text key={`t${i}`} style={styles.scriptParagraph}>
            {text.trim()}
          </Text>,
        );
      }
    } else {
      nodes.push(
        <View key={`b${i}`} style={styles.scriptBreak}>
          <View style={styles.scriptBreakLine} />
          <Text style={styles.scriptBreakLabel}>{parts[i]}s</Text>
          <View style={styles.scriptBreakLine} />
        </View>,
      );
    }
  }
  return nodes;
}

export default function HypnosisScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string | string[]; mode?: string | string[] }>();
  const paramSessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
  const paramMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;

  const [conversations, setConversations] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [readyToGenerate, setReadyToGenerate] = useState(false);
  const [scriptResult, setScriptResult] = useState<ScriptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationJobId, setGenerationJobId] = useState<string | null>(null);
  const [savedScriptId, setSavedScriptId] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioGenerated, setAudioGenerated] = useState(false);
  const [audioJobId, setAudioJobId] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [selectedMusic, setSelectedMusic] = useState<string>('');
  const [musicVolume, setMusicVolume] = useState(0.15);
  const [sessionRating, setSessionRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [mysteryBoxData, setMysteryBoxData] = useState<any>(null);
  const [xpGain, setXpGain] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const listRef = useRef<ScrollView>(null);
  const initRef = useRef(false);
  const handledParamRef = useRef<string | null>(null);
  const failedGenJobsRef = useRef<Set<string>>(new Set());
  const failedAudioJobsRef = useRef<Set<string>>(new Set());
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedSession?.id ?? null;

  const isSelectedLocked = Boolean(selectedSession?.is_locked) && selectedSession?.session_type === 'daily_hypnosis';

  const resetScriptPanel = useCallback(() => {
    setReadyToGenerate(false);
    setScriptResult(null);
    setSavedScriptId(null);
    setGeneratingAudio(false);
    setAudioGenerated(false);
    setAudioJobId(null);
    setVoices([]);
    setSelectedVoice('');
    setMusicTracks([]);
    setSelectedMusic('');
    setMusicVolume(0.15);
    setSessionRating(0);
    setRatingSubmitted(false);
    setMysteryBoxData(null);
    setXpGain(null);
    setGenerationJobId(null);
    setGenerating(false);
  }, []);

  const refreshConversations = useCallback(async (preferredId?: string) => {
    const data = await api.getSessions(50);
    const next = (Array.isArray(data?.sessions) ? data.sessions : [])
      .map((s: any) => normalizeSession(s))
      .filter(Boolean) as SessionSummary[];
    setConversations(next);
    if (preferredId) {
      const preferred = next.find((s) => s.id === preferredId);
      if (preferred) {
        setSelectedSession((current) => (current && current.id === preferred.id ? { ...current, ...preferred } : current));
      }
    }
    return next;
  }, []);

  const applyConversationState = useCallback((session: SessionSummary | null, nextMessages: Message[]) => {
    setSelectedSession(session);
    setMessages(nextMessages);
    setReadyToGenerate(
      isSessionMarkedReady(session?.session_status) &&
        !(session?.is_locked && session?.session_type === 'daily_hypnosis'),
    );
    setInput('');
    setError(null);
    setRatingSubmitted(Boolean(session?.user_rating));
    setSessionRating(session?.user_rating || 0);
  }, []);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      setInitializing(true);
      setError(null);
      resetScriptPanel();
      try {
        const detailRaw = await api.getSession(conversationId);
        const detail = normalizeSession(detailRaw);
        if (!detail) throw new Error('Conversation not found');
        let detailMessages = parseMessages(detailRaw.chat_messages);
        if (detailMessages.length === 0 && !detail.is_locked) {
          const initData = await api.hypnosisInit({ sessionId: conversationId, sessionType: detail.session_type });
          detailMessages =
            initData.resumeMessages || (initData.reply ? [{ role: 'assistant', content: initData.reply }] : []);
        }
        applyConversationState(detail, detailMessages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setInitializing(false);
      }
    },
    [applyConversationState, resetScriptPanel],
  );

  const startConversation = useCallback(
    async (sessionType: HypnosisSessionType) => {
      setInitializing(true);
      setError(null);
      resetScriptPanel();
      setHistoryOpen(false);
      try {
        const initData = await api.hypnosisInit({ sessionType, forceNew: sessionType === 'general_chat' });
        const refreshed = await refreshConversations(initData.sessionId);
        const preferredId = initData.sessionId || refreshed[0]?.id;
        if (preferredId) {
          await loadConversation(preferredId);
        } else {
          setInitializing(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start conversation');
        setInitializing(false);
      }
    },
    [loadConversation, refreshConversations, resetScriptPanel],
  );

  // Bootstrap once on mount.
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    // Mark the launch param as handled so the deep-link effect below does not
    // also load it on mount (which would double-fetch the same conversation).
    handledParamRef.current = paramSessionId ?? null;
    (async () => {
      setInitializing(true);
      try {
        const existing = await refreshConversations();
        const target = resolveInitialHypnosisTarget({ sessionId: paramSessionId, mode: paramMode }, existing);
        if (target.action === 'load') {
          await loadConversation(target.sessionId);
        } else {
          await startConversation(target.sessionType);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load conversations. Please refresh.');
        setInitializing(false);
      }
    })().catch(() => undefined);
  }, [loadConversation, refreshConversations, startConversation, paramSessionId, paramMode]);

  // Respond to deep links that change the sessionId param after mount.
  useEffect(() => {
    if (!initRef.current || !paramSessionId) return;
    if (paramSessionId === handledParamRef.current || paramSessionId === selectedIdRef.current) return;
    handledParamRef.current = paramSessionId;
    loadConversation(String(paramSessionId)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramSessionId]);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || !selectedSession || loading || generating || isSelectedLocked) return;

    const userMsg: Message = { role: 'user', content };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setLoading(true);
    setError(null);
    setReadyToGenerate(false);

    try {
      const data = await api.hypnosisChat(
        updated.map((m) => ({ role: m.role, content: m.content })),
        selectedSession.id,
        undefined,
        selectedSession.session_type,
        selectedSession.title,
      );
      setMessages([...updated, { role: 'assistant', content: data.reply || 'No reply received.' }]);
      if (data.session) {
        const normalized = normalizeSession(data.session);
        if (normalized) setSelectedSession((current) => ({ ...(current || {}), ...normalized }) as SessionSummary);
      }
      setReadyToGenerate(
        (data.readyToGenerate === true || isSessionMarkedReady(data.session?.session_status)) && !isSelectedLocked,
      );
      await refreshConversations(selectedSession.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response');
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }, [input, selectedSession, loading, generating, isSelectedLocked, messages, refreshConversations]);

  const applyGenerationResult = useCallback(
    async (result: any) => {
      if (!result) return;
      setScriptResult(result);
      if (result.hypnosisEvent) {
        setMessages((current) => {
          const already = current.some(
            (m) => m.role === 'system' && m.generatedAt === result.hypnosisEvent.generatedAt,
          );
          return already ? current : [...current, result.hypnosisEvent];
        });
      }
      if (result.session) {
        const normalized = normalizeSession(result.session);
        if (normalized) setSelectedSession((current) => ({ ...(current || {}), ...normalized }) as SessionSummary);
      }
      if (result.savedScript?.id) setSavedScriptId(result.savedScript.id);

      try {
        const voiceData = await api.listVoices();
        const available: VoiceOption[] = Array.isArray(voiceData?.voices) ? voiceData.voices : [];
        setVoices(available);
        setSelectedVoice(available.find((v) => v.isDefault)?.id || available[0]?.id || '');
      } catch {
        setVoices([]);
      }
      try {
        const musicData = await api.listMusic();
        setMusicTracks(Array.isArray(musicData?.tracks) ? musicData.tracks : []);
        setSelectedMusic('');
      } catch {
        setMusicTracks([]);
      }

      if (result.gamification) {
        const gam = result.gamification;
        if (Array.isArray(gam.xpEvents) && gam.xpEvents.length > 0) {
          const total = gam.xpEvents.reduce((sum: number, e: any) => sum + (Number(e.xpAwarded) || 0), 0);
          setXpGain(total);
        }
        if (gam.mysteryBox) setMysteryBoxData(gam.mysteryBox);
      }

      if (selectedIdRef.current) await refreshConversations(selectedIdRef.current);
    },
    [refreshConversations],
  );

  const generateScript = useCallback(async () => {
    if (!selectedSession) return;
    setGenerating(true);
    setError(null);
    try {
      const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));
      const r = await api.hypnosisGenerateStart(apiMessages, selectedSession.id);
      if (!r?.jobId) {
        throw new Error('Generation did not start. Please try again.');
      }
      setGenerationJobId(r.jobId);
      writeStored(jobKey(selectedSession.id), r.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setGenerating(false);
    }
  }, [selectedSession, messages]);

  // Generation polling.
  useJobPolling(
    generationJobId,
    (id) => api.hypnosisGenerateStatus(id),
    {
      onComplete: async (result) => {
        await applyGenerationResult(result);
        setGenerating(false);
        setGenerationJobId(null);
        if (selectedIdRef.current) clearStored(jobKey(selectedIdRef.current));
      },
      onFailed: (err) => {
        if (generationJobId) failedGenJobsRef.current.add(generationJobId);
        setError(err || 'Generation failed');
        setGenerating(false);
        setGenerationJobId(null);
        if (selectedIdRef.current) clearStored(jobKey(selectedIdRef.current));
      },
    },
    3500,
    6000,
  );

  // Generation recovery on session switch (resume an in-flight job).
  useEffect(() => {
    const sessionId = selectedSession?.id;
    if (!sessionId || generationJobId || scriptResult) return;
    let cancelled = false;
    (async () => {
      const local = await readStored(jobKey(sessionId));
      if (cancelled) return;
      if (local && !failedGenJobsRef.current.has(local)) {
        setGenerationJobId(local);
        setGenerating(true);
        return;
      }
      try {
        const active = await api.hypnosisGetActiveJob(sessionId);
        if (cancelled || !active?.jobId || failedGenJobsRef.current.has(active.jobId)) return;
        setGenerationJobId(active.jobId);
        setGenerating(true);
        writeStored(jobKey(sessionId), active.jobId);
      } catch {
        // no recovery
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession?.id, generationJobId, scriptResult]);

  const generateAudio = useCallback(async () => {
    if (!savedScriptId) return;
    setGeneratingAudio(true);
    setError(null);
    try {
      const r = await api.audioGenerateStart(
        savedScriptId,
        selectedMusic || undefined,
        selectedMusic ? musicVolume : undefined,
        selectedVoice || undefined,
      );
      if (!r?.jobId) {
        throw new Error('Audio generation did not start. Please try again.');
      }
      setAudioJobId(r.jobId);
      writeStored(audioJobKey(savedScriptId), r.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start audio generation');
      setGeneratingAudio(false);
    }
  }, [savedScriptId, selectedMusic, musicVolume, selectedVoice]);

  // Audio polling.
  useJobPolling(
    audioJobId,
    (id) => api.audioGenerateStatus(id),
    {
      onComplete: async () => {
        setAudioGenerated(true);
        setGeneratingAudio(false);
        setAudioJobId(null);
        if (savedScriptId) clearStored(audioJobKey(savedScriptId));
      },
      onFailed: (err) => {
        if (audioJobId) failedAudioJobsRef.current.add(audioJobId);
        setError(err || 'Audio generation failed');
        setGeneratingAudio(false);
        setAudioJobId(null);
        if (savedScriptId) clearStored(audioJobKey(savedScriptId));
      },
    },
    4000,
    7000,
  );

  // Audio recovery.
  useEffect(() => {
    if (!savedScriptId || audioJobId || audioGenerated) return;
    let cancelled = false;
    (async () => {
      const local = await readStored(audioJobKey(savedScriptId));
      if (cancelled) return;
      if (local && !failedAudioJobsRef.current.has(local)) {
        setAudioJobId(local);
        setGeneratingAudio(true);
        return;
      }
      try {
        const active = await api.audioGetActiveJob(savedScriptId);
        if (cancelled || !active?.jobId || failedAudioJobsRef.current.has(active.jobId)) return;
        setAudioJobId(active.jobId);
        setGeneratingAudio(true);
        writeStored(audioJobKey(savedScriptId), active.jobId);
      } catch {
        // no recovery
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [savedScriptId, audioJobId, audioGenerated]);

  const submitRating = useCallback(async () => {
    const sessionId = selectedSession?.id;
    if (!sessionId || sessionRating === 0) return;
    try {
      await api.rateSession(sessionId, sessionRating);
      setRatingSubmitted(true);
      await refreshConversations(sessionId);
    } catch {
      // rating is non-critical
    }
  }, [selectedSession?.id, sessionRating, refreshConversations]);

  const canCreateHypnosis = useMemo(
    () =>
      canShowCreateHypnosisCTA({
        readyToGenerate,
        messages,
        initializing,
        loading,
        generating,
        isSelectedLocked,
        minimumUserMessages: 3,
      }),
    [readyToGenerate, messages, initializing, loading, generating, isSelectedLocked],
  );

  const cycleVoice = useCallback(() => {
    if (voices.length === 0) return;
    setSelectedVoice((current) => {
      const idx = voices.findIndex((v) => v.id === current);
      return voices[(idx + 1) % voices.length].id;
    });
  }, [voices]);

  const cycleMusic = useCallback(() => {
    setSelectedMusic((current) => {
      const options = ['', ...musicTracks.map((t) => t.filename)];
      const idx = options.indexOf(current);
      return options[(idx + 1) % options.length];
    });
  }, [musicTracks]);

  const visibleMessages = messages;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <OfflineBanner />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {formatTitle(selectedSession)}
            </Text>
            <View style={styles.pillRow}>
              {statusPills(selectedSession).map((pill) => (
                <View key={pill} style={styles.pill}>
                  <Text style={styles.pillText}>{pill}</Text>
                </View>
              ))}
            </View>
          </View>
          <Pressable style={styles.historyButton} onPress={() => setHistoryOpen(true)} accessibilityRole="button">
            <Text style={styles.historyButtonText}>History</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {initializing ? (
            <View style={styles.loadingBubble}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.loadingText}>Loading conversation...</Text>
            </View>
          ) : null}

          {!initializing && messages.length === 0 ? (
            <Text style={styles.emptyText}>
              Start talking normally. You can keep this as a conversation, or create hypnosis later when you want.
            </Text>
          ) : null}

          {visibleMessages.map((msg, index) => {
            if (msg.role === 'system' && msg.eventType === 'hypnosis_generated') {
              return (
                <View key={`${msg.generatedAt || 'event'}-${index}`} style={styles.systemEvent}>
                  <Text style={styles.systemEventLabel}>Hypnosis Generated</Text>
                  <Text style={styles.systemEventText}>{msg.content}</Text>
                  {msg.generatedAt ? (
                    <Text style={styles.systemEventTime}>{formatTimestamp(msg.generatedAt)}</Text>
                  ) : null}
                </View>
              );
            }
            const isUser = msg.role === 'user';
            return (
              <View
                key={`${msg.role}-${index}`}
                style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}
              >
                <Text style={[styles.bubbleText, isUser ? styles.userText : styles.assistantText]}>{msg.content}</Text>
              </View>
            );
          })}

          {loading ? (
            <View style={[styles.bubble, styles.assistantBubble]}>
              <Text style={styles.loadingText}>Processing...</Text>
            </View>
          ) : null}

          {scriptResult ? (
            <View style={styles.resultPanel}>
              <Text style={styles.resultLabel}>Hypnosis Output</Text>
              <Text style={styles.resultTitle}>{scriptResult.title}</Text>
              {scriptResult.sessionSummary ? (
                <Text style={styles.resultSummary}>{scriptResult.sessionSummary}</Text>
              ) : null}

              <View style={styles.resultMeta}>
                <View style={styles.durationPill}>
                  <Text style={styles.durationPillText}>
                    {scriptResult.duration === 'full' ? 'FULL' : 'SHORT'} · ~{scriptResult.estimatedMinutes}m
                  </Text>
                </View>
                {scriptResult.keyThemes?.map((theme, i) => (
                  <Text key={`${theme}-${i}`} style={styles.themePill}>
                    #{theme}
                  </Text>
                ))}
              </View>

              {xpGain ? (
                <View style={styles.xpBanner}>
                  <Text style={styles.xpBannerText}>+{xpGain} XP earned</Text>
                </View>
              ) : null}

              {mysteryBoxData ? (
                <View style={styles.gap8}>
                  <Text style={styles.sectionMini}>Session Reward</Text>
                  <MysteryBox box={mysteryBoxData} />
                </View>
              ) : null}

              {scriptResult.script ? (
                <View style={styles.scriptBox}>{renderScript(scriptResult.script)}</View>
              ) : null}

              {!ratingSubmitted ? (
                <View style={styles.ratingCard}>
                  <Text style={styles.ratingLabel}>Rate this session</Text>
                  <View style={styles.ratingRow}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Pressable
                        key={value}
                        onPress={() => setSessionRating(value)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Rate ${value} star${value === 1 ? '' : 's'}`}
                      >
                        <Text style={[styles.star, value <= sessionRating ? styles.starOn : styles.starOff]}>★</Text>
                      </Pressable>
                    ))}
                    {sessionRating > 0 ? (
                      <Pressable style={styles.ratingSubmit} onPress={submitRating} accessibilityRole="button">
                        <Text style={styles.ratingSubmitText}>Submit</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={styles.ratingDone}>
                  <Text style={styles.ratingDoneText}>Rating recorded.</Text>
                </View>
              )}

              {savedScriptId && !audioGenerated ? (
                <View style={styles.audioControls}>
                  {voices.length > 0 ? (
                    <Pressable style={styles.selectorButton} onPress={cycleVoice} accessibilityRole="button">
                      <Text style={styles.selectorLabel}>Voice</Text>
                      <Text style={styles.selectorValue}>
                        {voices.find((v) => v.id === selectedVoice)?.label || 'Default'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {musicTracks.length > 0 ? (
                    <Pressable style={styles.selectorButton} onPress={cycleMusic} accessibilityRole="button">
                      <Text style={styles.selectorLabel}>Music</Text>
                      <Text style={styles.selectorValue}>
                        {selectedMusic ? musicTracks.find((t) => t.filename === selectedMusic)?.name : 'No music'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {selectedMusic ? (
                    <View style={styles.volumeRow}>
                      <Pressable
                        style={styles.volumeButton}
                        onPress={() => setMusicVolume((v) => Math.max(0.05, Math.round((v - 0.05) * 100) / 100))}
                        accessibilityRole="button"
                      >
                        <Text style={styles.volumeButtonText}>−</Text>
                      </Pressable>
                      <Text style={styles.volumeValue}>{Math.round(musicVolume * 100)}%</Text>
                      <Pressable
                        style={styles.volumeButton}
                        onPress={() => setMusicVolume((v) => Math.min(0.4, Math.round((v + 0.05) * 100) / 100))}
                        accessibilityRole="button"
                      >
                        <Text style={styles.volumeButtonText}>+</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.audioButton, generatingAudio && styles.disabledButton]}
                    onPress={generateAudio}
                    disabled={generatingAudio}
                    accessibilityRole="button"
                  >
                    <Text style={styles.audioButtonText}>{generatingAudio ? 'Generating...' : 'Generate Audio'}</Text>
                  </Pressable>
                </View>
              ) : null}

              {audioGenerated ? (
                <Pressable style={styles.viewAudioButton} onPress={() => router.push('/audios')} accessibilityRole="button">
                  <Text style={styles.viewAudioText}>View in Audios</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {isSelectedLocked ? (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedText}>
              This daily session is locked because hypnosis was already generated. Review it here, or start a new chat
              from History.
            </Text>
          </View>
        ) : null}

        {canCreateHypnosis ? (
          <View style={styles.ctaWrap}>
            <Pressable style={styles.ctaButton} onPress={generateScript} accessibilityRole="button">
              <Text style={styles.ctaButtonText}>
                {selectedSession?.hypnosis_generated_at ? 'Create Updated Hypnosis' : 'Create Hypnosis'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {generating ? (
          <View style={styles.generatingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.generatingText}>Generating your personalized script...</Text>
          </View>
        ) : null}

        {error ? <InlineError message={error} onDismiss={() => setError(null)} /> : null}

        {!isSelectedLocked && !generating ? (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder={initializing ? 'Loading conversation...' : 'Type your message...'}
              placeholderTextColor={colors.textFaint}
              multiline
              value={input}
              onChangeText={setInput}
              editable={!loading && !initializing}
            />
            <Pressable
              style={[styles.sendButton, (!input.trim() || loading || initializing) && styles.disabledButton]}
              onPress={sendMessage}
              disabled={!input.trim() || loading || initializing}
              accessibilityRole="button"
            >
              {loading ? <ActivityIndicator color={colors.background} size="small" /> : <Text style={styles.sendButtonText}>Send</Text>}
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Modal visible={historyOpen} animationType="slide" transparent onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Conversations</Text>
              <Pressable onPress={() => setHistoryOpen(false)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.modalClose}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalActionButton, styles.modalActionPrimary]}
                onPress={() => startConversation('general_chat')}
                accessibilityRole="button"
              >
                <Text style={styles.modalActionPrimaryText}>New Chat</Text>
              </Pressable>
              <Pressable
                style={[styles.modalActionButton, styles.modalActionSecondary]}
                onPress={() => startConversation('daily_hypnosis')}
                accessibilityRole="button"
              >
                <Text style={styles.modalActionSecondaryText}>Daily Session</Text>
              </Pressable>
            </View>
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.modalListContent}
              ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
              ListEmptyComponent={<Text style={styles.modalEmpty}>No conversations yet.</Text>}
              renderItem={({ item }) => {
                const active = item.id === selectedSession?.id;
                return (
                  <Pressable
                    style={[styles.convoRow, active && styles.convoRowActive]}
                    onPress={() => {
                      setHistoryOpen(false);
                      loadConversation(item.id).catch(() => undefined);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.convoTitle}>{formatTitle(item)}</Text>
                    <Text style={styles.convoTime}>
                      {formatTimestamp(item.last_message_at || item.created_at || item.hypnosis_generated_at)}
                    </Text>
                    <View style={styles.pillRow}>
                      {statusPills(item).map((pill) => (
                        <View key={pill} style={styles.pill}>
                          <Text style={styles.pillText}>{pill}</Text>
                        </View>
                      ))}
                    </View>
                    {item.chat_summary ? (
                      <Text style={styles.convoSummary} numberOfLines={2}>
                        {item.chat_summary}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  headerLeft: { flex: 1, gap: 4 },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { backgroundColor: colors.surfaceMuted, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  historyButton: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  historyButtonText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { padding: 14, gap: 10 },
  loadingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  emptyText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border },
  bubble: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, maxWidth: '88%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userText: { color: colors.background },
  assistantText: { color: colors.text },
  systemEvent: { alignSelf: 'center', maxWidth: '90%', alignItems: 'center', backgroundColor: 'rgba(212,168,83,0.12)', borderWidth: 1, borderColor: 'rgba(212,168,83,0.25)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, gap: 4 },
  systemEventLabel: { color: colors.accent, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  systemEventText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  systemEventTime: { color: colors.textFaint, fontSize: 11 },
  resultPanel: { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, gap: 12 },
  resultLabel: { color: colors.accent, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  resultTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  resultSummary: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  resultMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  durationPill: { backgroundColor: 'rgba(212,168,83,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  durationPillText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  themePill: { color: colors.textMuted, fontSize: 12 },
  xpBanner: { backgroundColor: 'rgba(212,168,83,0.12)', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  xpBannerText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  gap8: { gap: 8 },
  sectionMini: { color: colors.textFaint, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  scriptBox: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  scriptParagraph: { color: colors.text, fontSize: 15, lineHeight: 26 },
  scriptBreak: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 },
  scriptBreakLine: { flex: 1, height: 1, backgroundColor: 'rgba(212,168,83,0.3)' },
  scriptBreakLabel: { color: colors.textFaint, fontSize: 10 },
  ratingCard: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
  ratingLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  star: { fontSize: 26 },
  starOn: { color: colors.accent },
  starOff: { color: colors.borderStrong },
  ratingSubmit: { marginLeft: 6, backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  ratingSubmitText: { color: colors.background, fontWeight: '700', fontSize: 13 },
  ratingDone: { backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)', borderRadius: 10, padding: 10 },
  ratingDoneText: { color: colors.success, fontSize: 13 },
  audioControls: { gap: 10 },
  selectorButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectorLabel: { color: colors.textFaint, fontSize: 12 },
  selectorValue: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  volumeButton: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  volumeButtonText: { color: colors.text, fontSize: 20, fontWeight: '700' },
  volumeValue: { color: colors.textSecondary, fontSize: 14, minWidth: 48, textAlign: 'center' },
  audioButton: { backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  audioButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  viewAudioButton: { backgroundColor: colors.success, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  viewAudioText: { color: '#06281A', fontSize: 14, fontWeight: '700' },
  lockedBanner: { backgroundColor: 'rgba(245,158,11,0.1)', borderTopWidth: 1, borderTopColor: 'rgba(245,158,11,0.25)', paddingHorizontal: 16, paddingVertical: 12 },
  lockedText: { color: colors.warning, fontSize: 13, lineHeight: 18 },
  ctaWrap: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  ctaButton: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  ctaButtonText: { color: colors.background, fontSize: 15, fontWeight: '700' },
  generatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  generatingText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
  composer: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, minHeight: 44, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 10 },
  sendButton: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendButtonText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { maxHeight: '85%', backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: colors.border, paddingTop: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  modalClose: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  modalActionButton: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  modalActionPrimary: { backgroundColor: colors.accent },
  modalActionPrimaryText: { color: colors.background, fontWeight: '700', fontSize: 13 },
  modalActionSecondary: { borderWidth: 1, borderColor: colors.borderStrong },
  modalActionSecondaryText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  modalListContent: { padding: 16, gap: 0 },
  modalSeparator: { height: 10 },
  modalEmpty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  convoRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 6 },
  convoRowActive: { borderColor: colors.accent, backgroundColor: 'rgba(212,168,83,0.08)' },
  convoTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  convoTime: { color: colors.textFaint, fontSize: 11 },
  convoSummary: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
