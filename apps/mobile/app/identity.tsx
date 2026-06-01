import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/services/api';
import { useApiResource } from '../src/hooks/useApiResource';
import { ErrorState, LoadingState } from '../src/ui/states';
import { OfflineBanner } from '../src/ui/OfflineBanner';
import { colors, scoreColor } from '../src/ui/theme';

type Value = {
  value_name: string;
  confidence: number;
  purity_score: number;
  expression: string;
  pure_expression: string;
  distorted_expression: string;
  evidence_count: number;
};
type Conflict = { value_a: string; value_b: string; conflict_type: string; description: string };
type Statement = { statement_type: string; content: string; confidence: number };
type Scores = {
  value_clarity: number;
  value_alignment: number;
  hierarchy_stability: number;
  purity_ratio: number;
  conflict_awareness: number;
  worthiness_independence: number;
  decision_speed: number;
  overall_congruence: number;
};
type Evidence = { quote: string; interpretation: string; detected_at: string };
type IdentityData = { values: Value[]; conflicts: Conflict[]; statements: Statement[]; scores: Scores | null };

const SCORE_DIMS: { key: keyof Scores; label: string; desc: string }[] = [
  { key: 'value_clarity', label: 'Value Clarity', desc: 'How clearly your core values are defined' },
  { key: 'value_alignment', label: 'Value Alignment', desc: 'How consistently you live by your values' },
  { key: 'hierarchy_stability', label: 'Hierarchy Stability', desc: 'How clear your value priorities are' },
  { key: 'purity_ratio', label: 'Purity Ratio', desc: 'Pure vs distorted value expression' },
  { key: 'conflict_awareness', label: 'Conflict Awareness', desc: 'Awareness of internal value tensions' },
  { key: 'worthiness_independence', label: 'Worthiness Independence', desc: 'Self-worth independent of validation' },
  { key: 'decision_speed', label: 'Decision Speed', desc: 'Clarity and speed in value-aligned decisions' },
  { key: 'overall_congruence', label: 'Overall Congruence', desc: 'Total alignment across all dimensions' },
];

const STATEMENT_TYPES: { type: string; label: string; color: string }[] = [
  { type: 'limiting_belief', label: 'Limiting Beliefs', color: '#EF4444' },
  { type: 'empowering_belief', label: 'Empowering Beliefs', color: colors.success },
  { type: 'core_identity', label: 'Core Identity', color: colors.purple },
  { type: 'worthiness_pattern', label: 'Worthiness Patterns', color: colors.warning },
  { type: 'root_belief', label: 'Root Beliefs', color: '#3B82F6' },
];

const EXPRESSION_COLORS: Record<string, string> = {
  pure: colors.success,
  distorted: '#EF4444',
  mixed: colors.warning,
};

export default function IdentityScreen() {
  const [expandedValue, setExpandedValue] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  const { data, loading, refreshing, error, refresh, retry } = useApiResource<IdentityData>(
    async () => {
      const payload = await api.getIdentity();
      return {
        values: Array.isArray(payload?.values) ? payload.values : [],
        conflicts: Array.isArray(payload?.conflicts) ? payload.conflicts : [],
        statements: Array.isArray(payload?.statements) ? payload.statements : [],
        scores: payload?.scores ?? null,
      };
    },
    [],
  );

  const loadEvidence = useCallback(
    async (valueName: string) => {
      if (expandedValue === valueName) {
        setExpandedValue(null);
        return;
      }
      setExpandedValue(valueName);
      setEvidence([]);
      setEvidenceLoading(true);
      try {
        const payload = await api.getValueEvidence(valueName);
        setEvidence(Array.isArray(payload?.evidence) ? payload.evidence : []);
      } catch {
        setEvidence([]);
      } finally {
        setEvidenceLoading(false);
      }
    },
    [expandedValue],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <LoadingState label="Loading identity profile..." />
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <ErrorState message={error} onRetry={retry} />
      </SafeAreaView>
    );
  }

  const values = data?.values ?? [];
  const conflicts = data?.conflicts ?? [];
  const statements = data?.statements ?? [];
  const scores = data?.scores ?? null;
  const hasData = values.length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <Text style={styles.title}>Identity & Values</Text>
        <Text style={styles.subtitle}>
          {hasData
            ? 'Your value hierarchy and identity profile, built from daily conversations.'
            : 'Start a coaching session to begin building your identity profile.'}
        </Text>

        {hasData && scores ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Identity Score</Text>
            <View style={styles.scoreGrid}>
              {SCORE_DIMS.map((dim) => {
                const value = scores[dim.key] ?? 0;
                return (
                  <View key={dim.key} style={styles.scoreCard}>
                    <Text style={styles.scoreLabel}>{dim.label}</Text>
                    <Text style={[styles.scoreValue, { color: scoreColor(value) }]}>{value.toFixed(1)}</Text>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.trackFill,
                          { width: `${Math.min(100, value * 10)}%`, backgroundColor: scoreColor(value) },
                        ]}
                      />
                    </View>
                    <Text style={styles.scoreDesc}>{dim.desc}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {hasData ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Value Hierarchy</Text>
            <View style={styles.valueList}>
              {values.map((v, i) => {
                const isExpanded = expandedValue === v.value_name;
                return (
                  <View key={v.value_name}>
                    <Pressable
                      onPress={() => loadEvidence(v.value_name)}
                      style={[styles.valueCard, isExpanded && styles.valueCardActive]}
                      accessibilityRole="button"
                    >
                      <View style={styles.valueHeader}>
                        <View style={styles.valueNameRow}>
                          <Text style={styles.valueRank}>#{i + 1}</Text>
                          <Text style={styles.valueName}>{v.value_name}</Text>
                          {v.expression ? (
                            <View
                              style={[
                                styles.exprBadge,
                                { backgroundColor: EXPRESSION_COLORS[v.expression] || colors.textFaint },
                              ]}
                            >
                              <Text style={styles.exprBadgeText}>{v.expression}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.valueStats}>
                        <Text style={styles.valueStat}>Confidence: {(v.confidence * 100).toFixed(0)}%</Text>
                        <Text style={[styles.valueStat, { color: scoreColor(v.purity_score) }]}>
                          Purity: {v.purity_score.toFixed(1)}/10
                        </Text>
                        <Text style={styles.valueStat}>{v.evidence_count} evidence</Text>
                      </View>
                      {v.pure_expression ? (
                        <Text style={styles.pureExpr}>
                          <Text style={styles.exprStrong}>Pure: </Text>
                          {v.pure_expression}
                        </Text>
                      ) : null}
                      {v.distorted_expression ? (
                        <Text style={styles.distortedExpr}>
                          <Text style={styles.exprStrong}>Distorted: </Text>
                          {v.distorted_expression}
                        </Text>
                      ) : null}
                    </Pressable>
                    {isExpanded ? (
                      <View style={styles.evidenceBox}>
                        <Text style={styles.evidenceTitle}>Evidence Trail</Text>
                        {evidenceLoading ? (
                          <ActivityIndicator color={colors.purple} />
                        ) : evidence.length === 0 ? (
                          <Text style={styles.evidenceEmpty}>
                            No evidence yet. Continue coaching to build evidence.
                          </Text>
                        ) : (
                          evidence.map((e, j) => (
                            <View key={j} style={styles.evidenceItem}>
                              {e.quote ? <Text style={styles.evidenceQuote}>&ldquo;{e.quote}&rdquo;</Text> : null}
                              {e.interpretation ? (
                                <Text style={styles.evidenceInterp}>{e.interpretation}</Text>
                              ) : null}
                              <Text style={styles.evidenceDate}>
                                {new Date(e.detected_at).toLocaleDateString()}
                              </Text>
                            </View>
                          ))
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {conflicts.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Value Conflicts</Text>
            {conflicts.map((c, i) => (
              <View key={i} style={styles.conflictCard}>
                <View style={styles.conflictHeader}>
                  <Text style={styles.conflictValue}>{c.value_a}</Text>
                  <Text style={styles.conflictVs}>vs</Text>
                  <Text style={styles.conflictValue}>{c.value_b}</Text>
                  <Text style={styles.conflictType}>{c.conflict_type}</Text>
                </View>
                {c.description ? <Text style={styles.conflictDesc}>{c.description}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {statements.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Identity Statements</Text>
            {STATEMENT_TYPES.map(({ type, label, color }) => {
              const items = statements.filter((s) => s.statement_type === type);
              if (items.length === 0) return null;
              return (
                <View key={type} style={styles.statementGroup}>
                  <Text style={[styles.statementGroupLabel, { color }]}>{label}</Text>
                  {items.map((s, i) => (
                    <View key={i} style={[styles.statementCard, { borderLeftColor: color }]}>
                      <Text style={styles.statementText}>&ldquo;{s.content}&rdquo;</Text>
                      <Text style={styles.statementConfidence}>
                        Confidence: {(s.confidence * 100).toFixed(0)}%
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ) : null}

        {!hasData ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Your Identity Map is Empty</Text>
            <Text style={styles.emptyBody}>
              Start a daily coaching session. The AI passively detects your values, beliefs, and identity
              patterns from your natural conversation.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 60, gap: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  section: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2D2A3E',
    gap: 12,
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  scoreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  scoreCard: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#16132A', borderRadius: 12, padding: 12, gap: 4 },
  scoreLabel: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreValue: { fontSize: 24, fontWeight: '700' },
  track: { height: 4, backgroundColor: '#2D2A3E', borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 2 },
  scoreDesc: { color: colors.textFaint, fontSize: 10, marginTop: 2 },
  valueList: { gap: 8 },
  valueCard: { backgroundColor: '#16132A', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'transparent', gap: 8 },
  valueCardActive: { borderColor: '#7C3AED' },
  valueHeader: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  valueNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  valueRank: { color: '#7C3AED', fontSize: 18, fontWeight: '700', minWidth: 26 },
  valueName: { color: colors.text, fontSize: 16, fontWeight: '600', textTransform: 'capitalize', flexShrink: 1 },
  exprBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  exprBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  valueStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  valueStat: { color: colors.textMuted, fontSize: 12 },
  pureExpr: { color: colors.success, fontSize: 12 },
  distortedExpr: { color: '#EF4444', fontSize: 12 },
  exprStrong: { fontWeight: '700' },
  evidenceBox: { backgroundColor: '#0F0D1A', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, padding: 14, borderTopWidth: 1, borderTopColor: '#2D2A3E', gap: 8 },
  evidenceTitle: { color: colors.purple, fontSize: 13, fontWeight: '600' },
  evidenceEmpty: { color: colors.textFaint, fontSize: 12 },
  evidenceItem: { backgroundColor: '#16132A', borderRadius: 8, padding: 8, gap: 4 },
  evidenceQuote: { color: colors.text, fontSize: 12, fontStyle: 'italic' },
  evidenceInterp: { color: colors.textMuted, fontSize: 11 },
  evidenceDate: { color: colors.textFaint, fontSize: 10 },
  conflictCard: { backgroundColor: '#16132A', borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#EF4444', gap: 4 },
  conflictHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  conflictValue: { color: colors.text, fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  conflictVs: { color: '#EF4444', fontSize: 12 },
  conflictType: { color: colors.textMuted, fontSize: 11, backgroundColor: '#2D2A3E', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  conflictDesc: { color: colors.textMuted, fontSize: 12 },
  statementGroup: { gap: 6 },
  statementGroupLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  statementCard: { backgroundColor: '#16132A', borderRadius: 8, padding: 10, borderLeftWidth: 3, gap: 4 },
  statementText: { color: colors.text, fontSize: 13 },
  statementConfidence: { color: colors.textFaint, fontSize: 11 },
  emptyCard: { backgroundColor: colors.surfaceAlt, borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#2D2A3E', gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  emptyBody: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
