import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/services/api';
import { useProgress } from '../../src/hooks/useProgress';
import { InlineError } from '../../src/ui/states';
import { OfflineBanner } from '../../src/ui/OfflineBanner';
import { colors } from '../../src/ui/theme';

const SCENARIOS = [
  { id: 'sales', name: 'Sales Conversation', description: 'Practice Milton Model patterns and meta program matching with a prospect' },
  { id: 'coaching', name: 'Coaching Session', description: 'Run a Personal Breakthrough Session with a client' },
  { id: 'negotiation', name: 'Negotiation', description: 'Practice chunking, Cartesian Coordinates, and rapport in a deal' },
  { id: 'pattern-drill', name: 'Pattern Recognition', description: 'Identify Milton Model patterns in NLP-loaded language' },
  { id: 'free', name: 'Free Practice', description: 'Describe any scenario and practice your NLP skills' },
] as const;

const MAX_MESSAGES = 50;

type Coaching = {
  patternsUsed: string[];
  effectiveness: string;
  suggestions: string[];
  missedOpportunities: string[];
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  hidden?: boolean;
  coaching?: Coaching;
};

type Debrief = {
  summary?: string;
  patternsUsed?: Record<string, number>;
  totalPatterns?: number;
  strengths?: string[];
  areasToImprove?: string[];
};

export default function PracticeScreen() {
  const [scenario, setScenario] = useState<string | null>(null);
  const [coached, setCoached] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [freeSetup, setFreeSetup] = useState('');
  const [sessionStarted, setSessionStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<Message>>(null);
  const { recordPracticeSession } = useProgress();

  const startSession = async () => {
    if (!scenario) return;
    setSessionStarted(true);
    setMessages([]);
    setDebrief(null);
    setError(null);

    if (scenario !== 'free') {
      setLoading(true);
      try {
        const initContent = 'Start the scenario. Give me your opening line in character.';
        const data = await api.sendMessage(scenario, [{ role: 'user', content: initContent }], coached);
        const parsed = data.response || data;
        setMessages([
          { role: 'user', content: initContent, hidden: true },
          {
            role: 'assistant',
            content: parsed.dialogue || parsed.content || JSON.stringify(parsed),
            coaching: parsed.coaching,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start session');
        setSessionStarted(false);
      } finally {
        setLoading(false);
      }
    }
  };

  const sendMessage = useCallback(
    async (content: string) => {
      if (!scenario || !content.trim() || loading || messages.length >= MAX_MESSAGES) return;
      const userMsg: Message = { role: 'user', content };
      const updated = [...messages, userMsg];
      setMessages(updated);
      setInput('');
      setLoading(true);
      setError(null);

      try {
        const apiMessages = updated.map((m) => ({ role: m.role, content: m.content }));
        const data = await api.sendMessage(
          scenario,
          apiMessages,
          coached,
          scenario === 'free' ? freeSetup : undefined,
        );
        const parsed = data.response || data;
        setMessages([
          ...updated,
          {
            role: 'assistant',
            content: parsed.dialogue || parsed.content || JSON.stringify(parsed),
            coaching: parsed.coaching,
          },
        ]);
        setLastFailedMessage(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get response');
        setLastFailedMessage(content);
        setMessages(messages);
      } finally {
        setLoading(false);
      }
    },
    [scenario, loading, messages, coached, freeSetup],
  );

  const endSession = async () => {
    if (!scenario || messages.length === 0) return;
    setLoading(true);
    try {
      const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));
      const result = await api.getDebrief(scenario, apiMessages);
      setDebrief(result.debrief || result);
      recordPracticeSession(scenario);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate debrief. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetSession = () => {
    setScenario(null);
    setMessages([]);
    setDebrief(null);
    setSessionStarted(false);
    setFreeSetup('');
    setError(null);
    setLastFailedMessage(null);
    setInput('');
  };

  // Debrief view
  if (debrief) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Session Debrief</Text>
          {debrief.summary ? (
            <View style={styles.card}>
              <Text style={styles.summaryText}>{debrief.summary}</Text>
            </View>
          ) : null}
          {debrief.patternsUsed ? (
            <View style={styles.card}>
              <Text style={styles.cardHeading}>Patterns Used ({debrief.totalPatterns || 0} total)</Text>
              <View style={styles.chipWrap}>
                {Object.entries(debrief.patternsUsed).map(([pattern, count]) => (
                  <Text key={pattern} style={styles.patternChip}>
                    {pattern}: {count}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
          {debrief.strengths && debrief.strengths.length > 0 ? (
            <View style={[styles.card, styles.strengthsCard]}>
              <Text style={styles.strengthsHeading}>Strengths</Text>
              {debrief.strengths.map((s, i) => (
                <Text key={i} style={styles.bullet}>
                  - {s}
                </Text>
              ))}
            </View>
          ) : null}
          {debrief.areasToImprove && debrief.areasToImprove.length > 0 ? (
            <View style={[styles.card, styles.improveCard]}>
              <Text style={styles.improveHeading}>Areas to Improve</Text>
              {debrief.areasToImprove.map((s, i) => (
                <Text key={i} style={styles.bullet}>
                  - {s}
                </Text>
              ))}
            </View>
          ) : null}
          <Pressable style={styles.primaryButton} onPress={resetSession} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>New Session</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Scenario selection
  if (!sessionStarted) {
    const canStart = Boolean(scenario) && !(scenario === 'free' && !freeSetup.trim());
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Practice NLP</Text>
          <View style={styles.scenarioList}>
            {SCENARIOS.map((s) => {
              const active = scenario === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setScenario(s.id)}
                  style={[styles.scenarioCard, active && styles.scenarioCardActive]}
                  accessibilityRole="button"
                >
                  <Text style={styles.scenarioName}>{s.name}</Text>
                  <Text style={styles.scenarioDesc}>{s.description}</Text>
                </Pressable>
              );
            })}
          </View>

          {scenario === 'free' ? (
            <TextInput
              style={styles.freeSetup}
              value={freeSetup}
              onChangeText={setFreeSetup}
              placeholder="Describe the scenario: who is the other person, what's the situation, what do you want to practice?"
              placeholderTextColor={colors.textFaint}
              multiline
            />
          ) : null}

          <View style={styles.coachRow}>
            <Switch
              value={coached}
              onValueChange={setCoached}
              trackColor={{ true: colors.info, false: colors.border }}
              thumbColor="#FFFFFF"
              accessibilityRole="switch"
              accessibilityLabel="Real-time coaching"
            />
            <Text style={styles.coachLabel}>Real-time coaching</Text>
          </View>

          {error ? <InlineError message={error} onDismiss={() => setError(null)} /> : null}

          <Pressable
            style={[styles.primaryButton, !canStart && styles.disabledButton]}
            onPress={startSession}
            disabled={!canStart}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Start Session</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Active session
  const atLimit = messages.length >= MAX_MESSAGES;
  const visibleMessages = messages.filter((m) => !m.hidden);

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={styles.messageWrap}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.bubbleText, isUser ? styles.userText : styles.assistantText]}>{item.content}</Text>
        </View>
        {coached && item.coaching ? (
          <View style={styles.coachingBox}>
            <Text style={styles.coachingTitle}>Coaching</Text>
            {item.coaching.patternsUsed?.length > 0 ? (
              <Text style={styles.coachingLine}>
                <Text style={styles.coachingAccent}>Patterns used: </Text>
                {item.coaching.patternsUsed.join(', ')}
              </Text>
            ) : null}
            {item.coaching.effectiveness ? (
              <Text style={styles.coachingMuted}>{item.coaching.effectiveness}</Text>
            ) : null}
            {item.coaching.suggestions?.length > 0 ? (
              <Text style={styles.coachingMuted}>
                <Text style={styles.coachingTry}>Try: </Text>
                {item.coaching.suggestions[0]}
              </Text>
            ) : null}
            {item.coaching.missedOpportunities?.length > 0 ? (
              <Text style={styles.coachingMuted}>
                <Text style={styles.coachingMissed}>Missed: </Text>
                {item.coaching.missedOpportunities[0]}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <OfflineBanner />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sessionHeader}>
          <View style={styles.sessionHeaderLeft}>
            <Text style={styles.sessionScenario}>{scenario?.replace('-', ' ')}</Text>
            {coached ? (
              <View style={styles.coachedBadge}>
                <Text style={styles.coachedBadgeText}>Coached</Text>
              </View>
            ) : null}
            <Text style={styles.messageCount}>
              {visibleMessages.length}/{MAX_MESSAGES}
            </Text>
          </View>
          <Pressable
            style={[styles.endButton, (loading || messages.length === 0) && styles.disabledButton]}
            onPress={endSession}
            disabled={loading || messages.length === 0}
            accessibilityRole="button"
          >
            <Text style={styles.endButtonText}>End Session</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={visibleMessages}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderMessage}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={
            loading ? (
              <View style={[styles.bubble, styles.assistantBubble]}>
                <Text style={styles.thinkingText}>Thinking...</Text>
              </View>
            ) : null
          }
        />

        {error ? (
          <InlineError
            message={error}
            onDismiss={() => setError(null)}
            onRetry={lastFailedMessage ? () => sendMessage(lastFailedMessage) : undefined}
          />
        ) : null}

        {atLimit ? (
          <Text style={styles.limitNotice}>Message limit reached. End the session for your debrief.</Text>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            value={input}
            onChangeText={setInput}
            placeholder="Type your message..."
            placeholderTextColor={colors.textFaint}
            multiline
            editable={!loading && !atLimit}
          />
          <Pressable
            style={[styles.sendButton, (!input.trim() || loading || atLimit) && styles.disabledButton]}
            onPress={() => sendMessage(input.trim())}
            disabled={!input.trim() || loading || atLimit}
            accessibilityRole="button"
          >
            {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.sendButtonText}>Send</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 10 },
  summaryText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  cardHeading: { color: colors.text, fontSize: 15, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  patternChip: { backgroundColor: 'rgba(99,102,241,0.3)', color: '#A5B4FC', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, fontSize: 13, overflow: 'hidden' },
  strengthsCard: { backgroundColor: 'rgba(6,78,59,0.3)', borderColor: 'rgba(6,95,70,0.5)' },
  strengthsHeading: { color: '#34D399', fontSize: 15, fontWeight: '700' },
  improveCard: { backgroundColor: 'rgba(120,53,15,0.3)', borderColor: 'rgba(146,64,14,0.5)' },
  improveHeading: { color: '#FBBF24', fontSize: 15, fontWeight: '700' },
  bullet: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  scenarioList: { gap: 12 },
  scenarioCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, gap: 4 },
  scenarioCardActive: { borderColor: colors.info, backgroundColor: 'rgba(49,46,129,0.3)' },
  scenarioName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  scenarioDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  freeSetup: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachLabel: { color: colors.textSecondary, fontSize: 14 },
  primaryButton: { backgroundColor: colors.info, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  sessionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  sessionScenario: { color: colors.text, fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  coachedBadge: { backgroundColor: 'rgba(6,78,59,0.5)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  coachedBadgeText: { color: '#34D399', fontSize: 11 },
  messageCount: { color: colors.textFaint, fontSize: 11 },
  endButton: { backgroundColor: '#D97706', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  endButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  chatContent: { padding: 14, gap: 14 },
  messageWrap: { gap: 8 },
  bubble: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, maxWidth: '90%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.info },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userText: { color: '#FFFFFF' },
  assistantText: { color: colors.text },
  thinkingText: { color: colors.textMuted, fontSize: 14 },
  coachingBox: { alignSelf: 'flex-start', maxWidth: '85%', marginLeft: 8, backgroundColor: 'rgba(6,78,59,0.4)', borderWidth: 1, borderColor: 'rgba(6,95,70,0.5)', borderRadius: 10, padding: 12, gap: 4 },
  coachingTitle: { color: '#34D399', fontSize: 12, fontWeight: '700' },
  coachingLine: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  coachingMuted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  coachingAccent: { color: '#34D399' },
  coachingTry: { color: '#FBBF24' },
  coachingMissed: { color: '#F87171' },
  limitNotice: { color: '#FBBF24', fontSize: 13, textAlign: 'center', paddingHorizontal: 16, paddingVertical: 6 },
  composer: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: colors.border },
  composerInput: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, minHeight: 44, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 10 },
  sendButton: { backgroundColor: colors.info, borderRadius: 10, paddingHorizontal: 18, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
