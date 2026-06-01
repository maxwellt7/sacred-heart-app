import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../../src/services/api';
import { OfflineBanner } from '../../src/ui/OfflineBanner';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export default function HypnosisScreen() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Ready');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loadingReply, setLoadingReply] = useState(false);
  const [readyToGenerate, setReadyToGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationJobId, setGenerationJobId] = useState<string | null>(null);
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const startSession = async (): Promise<string | null> => {
    try {
      setError(null);
      setStatus('Starting...');
      const session = await api.hypnosisInit({ sessionType: 'daily' });
      const nextSessionId = session?.sessionId || null;
      setSessionId(nextSessionId);
      setStatus('Session initialized');
      return nextSessionId;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Unable to initialize session');
      setError(err instanceof Error ? err.message : 'Unable to initialize session');
      return null;
    }
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || loadingReply || generating) return;

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = await startSession();
    }
    if (!activeSessionId) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    };
    const updated = [...messages, userMessage];
    setMessages(updated);
    setInput('');
    setLoadingReply(true);
    setError(null);
    setGeneratedScript(null);

    try {
      const result = await api.hypnosisChat(
        updated.map((message) => ({ role: message.role, content: message.content })),
        activeSessionId,
      );
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result?.reply || 'No reply received.',
      };
      setMessages([...updated, assistantMessage]);
      setReadyToGenerate(Boolean(result?.readyToGenerate));
      setStatus('Conversation updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message');
      setMessages(messages);
    } finally {
      setLoadingReply(false);
    }
  };

  const generateScript = async () => {
    if (!sessionId || generating || loadingReply || messages.length === 0) return;
    setGenerating(true);
    setError(null);
    setStatus('Starting script generation...');
    try {
      const started = await api.hypnosisGenerateStart(
        messages.map((message) => ({ role: message.role, content: message.content })),
        sessionId,
      );
      setGenerationJobId(started.jobId);
    } catch (err) {
      setGenerating(false);
      setError(err instanceof Error ? err.message : 'Unable to start generation');
      setStatus('Generation failed to start');
    }
  };

  useEffect(() => {
    if (!generationJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isPolling = false;

    const poll = async () => {
      if (cancelled || isPolling) return;
      isPolling = true;
      try {
        const result = await api.hypnosisGenerateStatus(generationJobId);
        if (cancelled) return;

        if (result.status === 'complete') {
          setGeneratedScript(result.result?.script || 'Script generated, but no script body was returned.');
          setStatus('Hypnosis script generated');
          setGenerating(false);
          setGenerationJobId(null);
          return;
        }
        if (result.status === 'failed') {
          setError(result.error || 'Script generation failed');
          setStatus('Generation failed');
          setGenerating(false);
          setGenerationJobId(null);
          return;
        }

        setStatus(result.status === 'running' ? 'Generating script...' : 'Queued for generation...');
        timer = setTimeout(poll, 3000);
      } catch (err) {
        if (cancelled) return;
        setStatus('Retrying script generation status...');
        setError(err instanceof Error ? err.message : 'Polling failed');
        timer = setTimeout(poll, 5000);
      } finally {
        isPolling = false;
      }
    };

    poll().catch(() => undefined);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
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
  }, [generationJobId]);

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const canGenerate = useMemo(
    () => messages.some((message) => message.role === 'user') && !loadingReply && !generating,
    [messages, loadingReply, generating],
  );

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.assistantMessageText]}>
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Session</Text>
          <Text style={styles.headerMeta}>{sessionId ? `Session ${sessionId.slice(0, 8)}...` : 'No active session'}</Text>
          <Text style={styles.headerMeta}>{status}</Text>
        </View>

        <FlatList
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Start a daily session and send your first message to begin the hypnosis flow.
            </Text>
          }
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {generatedScript ? (
          <View style={styles.scriptCard}>
            <Text style={styles.scriptTitle}>Generated Script</Text>
            <Text style={styles.scriptText}>{generatedScript}</Text>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          <Pressable style={styles.secondaryButton} onPress={() => startSession()} disabled={loadingReply || generating}>
            <Text style={styles.secondaryButtonText}>Start Daily Session</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, !canGenerate && styles.buttonDisabled]}
            onPress={generateScript}
            disabled={!canGenerate}
          >
            <Text style={styles.primaryButtonText}>
              {generating ? 'Generating...' : readyToGenerate ? 'Generate Hypnosis' : 'Generate Script'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="What do you want to work through today?"
            placeholderTextColor="#64748B"
            multiline
            value={input}
            onChangeText={setInput}
            editable={!loadingReply && !generating}
          />
          <Pressable
            style={[styles.sendButton, (!input.trim() || loadingReply || generating) && styles.buttonDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || loadingReply || generating}
          >
            {loadingReply ? (
              <ActivityIndicator color="#0B0F19" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    gap: 3,
  },
  headerTitle: {
    color: '#D4A853',
    fontSize: 22,
    fontWeight: '700',
  },
  headerMeta: {
    color: '#94A3B8',
    fontSize: 12,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  emptyText: {
    color: '#94A3B8',
    lineHeight: 20,
  },
  messageBubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: '88%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#D4A853',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#0B0F19',
  },
  assistantMessageText: {
    color: '#E2E8F0',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontWeight: '600',
    fontSize: 13,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#D4A853',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: '#0B0F19',
    fontWeight: '700',
    fontSize: 13,
  },
  composer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    color: '#F8FAFC',
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    backgroundColor: '#D4A853',
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#0B0F19',
    fontWeight: '700',
    fontSize: 14,
  },
  scriptCard: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    maxHeight: 180,
  },
  scriptTitle: {
    color: '#D4A853',
    fontWeight: '700',
  },
  scriptText: {
    color: '#E2E8F0',
    lineHeight: 20,
  },
  errorText: {
    color: '#FB7185',
    marginHorizontal: 14,
    marginBottom: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
