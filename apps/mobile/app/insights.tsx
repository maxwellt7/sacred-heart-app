import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/services/api';
import { useApiResource } from '../src/hooks/useApiResource';
import { EmptyState, ErrorState, LoadingState } from '../src/ui/states';
import { OfflineBanner } from '../src/ui/OfflineBanner';
import { colors } from '../src/ui/theme';

type InsightsData = { profile: any; streak: any };

const FOUR_STAGES = [
  { label: 'Unconscious Unskilled', desc: "Don't know what you don't know", color: '#4B5563' },
  { label: 'Conscious Unskilled', desc: 'Aware of gaps — danger zone', color: '#D97706' },
  { label: 'Conscious Skilled', desc: 'Adopting through repetition', color: colors.info },
  { label: 'Unconscious Skilled', desc: 'Mastery — exponential results', color: '#059669' },
];

const CAPACITY_ITEMS = [
  { key: 'suppression', label: 'Suppression', desc: 'Hiding, minimizing, numbing feelings', color: '#F59E0B' },
  { key: 'discharge', label: 'Discharge', desc: 'Spraying emotions onto others', color: '#EF4444' },
  { key: 'capacity', label: 'Capacity', desc: 'Holding feelings with ownership', color: '#10B981' },
];

const CONTEXT_MAPS = [
  { key: 'map1_health', label: 'Work / Adult', desc: 'Belonging through contribution', icon: '💼' },
  { key: 'map2_health', label: 'Social / Adolescent', desc: 'Belonging through performing', icon: '🎭' },
  { key: 'map3_health', label: 'Home / Childhood', desc: 'Belonging through being', icon: '🏠' },
];

const FORCE_ITEMS = [
  { key: 'subtle', label: 'Subtle Force', desc: 'Overexplaining, hinting, managing reactions', color: '#F59E0B' },
  { key: 'clean', label: 'Clean Influence', desc: 'Creating conditions where people want to follow', color: '#10B981' },
];

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function Bar({ value, color, height = 12 }: { value: number; color: string; height?: number }) {
  return (
    <View style={[styles.barTrack, { height }]}>
      <View style={[styles.barFill, { width: `${Math.min(100, value * 10)}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function InsightsScreen() {
  const { data, loading, refreshing, error, refresh, retry } = useApiResource<InsightsData>(
    async () => {
      const payload = await api.getProfile();
      return { profile: payload?.profile ?? null, streak: payload?.streak ?? null };
    },
    [],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <LoadingState label="Loading insights..." />
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

  const profile = data?.profile ?? null;
  const streak = data?.streak ?? null;

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <EmptyState
          title="Insights"
          message="Complete a few sessions to start seeing your patterns and progress."
        />
      </SafeAreaView>
    );
  }

  const totalSessions = num(streak?.total_sessions, 0);
  let stageIndex = 0;
  if (totalSessions >= 60) stageIndex = 3;
  else if (totalSessions >= 21) stageIndex = 2;
  else if (totalSessions >= 5) stageIndex = 1;

  const victimScore = num(profile.victim_healer?.score, 0);
  const victimMarker = Math.max(2, Math.min(98, (victimScore + 5) * 10));
  const trending = profile.victim_healer?.trending;
  const congruence: [string, unknown][] = profile.congruence ? Object.entries(profile.congruence) : [];
  const metaPrograms: [string, unknown][] = profile.meta_programs ? Object.entries(profile.meta_programs) : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <Text style={styles.title}>Your Insights</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Four Stages of Competence</Text>
          <View style={styles.stageList}>
            {FOUR_STAGES.map((stage, i) => {
              const active = i === stageIndex;
              return (
                <View key={stage.label} style={styles.stageRow}>
                  <View style={[styles.dot, { backgroundColor: i <= stageIndex ? stage.color : '#374151' }]} />
                  <View style={styles.stageBody}>
                    <Text style={[styles.stageLabel, active ? styles.stageActive : styles.stageInactive]}>
                      {stage.label}
                    </Text>
                    <Text style={styles.stageDesc}>{stage.desc}</Text>
                  </View>
                  {active ? (
                    <View style={styles.youAreHere}>
                      <Text style={styles.youAreHereText}>You are here</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Text style={styles.footnote}>
            Based on {totalSessions} total sessions. Consistency moves you through the stages.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Emotional Capacity Spectrum</Text>
          <View style={styles.gap16}>
            {CAPACITY_ITEMS.map((item) => {
              const val = num(profile.capacity_index?.[item.key], 5);
              return (
                <View key={item.key} style={styles.gap4}>
                  <View style={styles.spaceBetween}>
                    <Text style={[styles.barLabel, { color: item.color }]}>{item.label}</Text>
                    <Text style={styles.barValue}>{val.toFixed(1)} / 10</Text>
                  </View>
                  <Bar value={val} color={item.color} />
                  <Text style={styles.barDesc}>{item.desc}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.note}>
            <Text style={styles.noteText}>
              <Text style={styles.noteStrong}>Goal: </Text>
              The opposite of suppression is NOT expression — it's capacity. As you build capacity,
              suppression and discharge naturally decrease.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Context Maps Health</Text>
          <View style={styles.mapGrid}>
            {CONTEXT_MAPS.map((map) => {
              const val = num(profile.context_maps?.[map.key], 5);
              return (
                <View key={map.key} style={styles.mapCard}>
                  <Text style={styles.mapIcon}>{map.icon}</Text>
                  <Text style={styles.mapLabel}>{map.label}</Text>
                  <Text style={styles.mapValue}>{val.toFixed(0)}/10</Text>
                  <Text style={styles.mapDesc}>{map.desc}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Victim — Healer Spectrum</Text>
          <View style={styles.spectrumRow}>
            <Text style={styles.spectrumEndLeft}>Victim</Text>
            <View style={styles.spectrumTrack}>
              <View style={[styles.spectrumMarker, { left: `${victimMarker}%` }]} />
            </View>
            <Text style={styles.spectrumEndRight}>Healer</Text>
          </View>
          <Text style={styles.spectrumScore}>
            Score: {victimScore.toFixed(1)} / 5
            {trending && trending !== 'stable' ? (
              <Text style={{ color: trending === 'improving' ? '#10B981' : '#F59E0B' }}> ({trending})</Text>
            ) : null}
          </Text>
          <View style={styles.note}>
            <Text style={styles.noteText}>
              <Text style={styles.noteStrong}>Responsibility 2.0: </Text>
              Not something you TAKE (heavy load) — it's a LENS for power. Preference vs. Judgment.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Force vs. Clean Influence</Text>
          <View style={styles.gap16}>
            {FORCE_ITEMS.map((item) => {
              const val = num(profile.force_audit?.[item.key], 5);
              return (
                <View key={item.key} style={styles.gap4}>
                  <View style={styles.spaceBetween}>
                    <Text style={styles.barLabelNeutral}>{item.label}</Text>
                    <Text style={styles.barValue}>{val.toFixed(1)}</Text>
                  </View>
                  <Bar value={val} color={item.color} height={8} />
                  <Text style={styles.barDesc}>{item.desc}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {congruence.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Life Congruence</Text>
            <View style={styles.congruenceGrid}>
              {congruence.map(([domain, score]) => {
                const val = num(score, 0);
                return (
                  <View key={domain} style={styles.congruenceItem}>
                    <View style={styles.congruenceCircle}>
                      <Text style={styles.congruenceValue}>{val.toFixed(0)}</Text>
                    </View>
                    <Bar value={val} color={colors.info} height={4} />
                    <Text style={styles.congruenceLabel}>{domain.replace(/_/g, ' ')}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {metaPrograms.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Detected Meta-Programs</Text>
            <View style={styles.metaGrid}>
              {metaPrograms.map(([key, value]) => {
                const known = value && value !== 'unknown';
                return (
                  <View key={key} style={styles.metaItem}>
                    <Text style={styles.metaKey}>{key.replace(/_/g, ' ')}</Text>
                    <Text style={[styles.metaValue, !known && styles.metaValueUnknown]}>
                      {String(value) === 'unknown' ? '—' : String(value)}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.footnote}>
              Meta-programs are detected through your language patterns during coaching sessions.
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
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 14 },
  cardTitle: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  footnote: { color: colors.textFaint, fontSize: 12, lineHeight: 17 },
  gap16: { gap: 16 },
  gap4: { gap: 4 },
  spaceBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stageList: { gap: 12 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  stageBody: { flex: 1 },
  stageLabel: { fontSize: 14, fontWeight: '500' },
  stageActive: { color: colors.text },
  stageInactive: { color: colors.textFaint },
  stageDesc: { color: '#4B5563', fontSize: 12 },
  youAreHere: { backgroundColor: 'rgba(99,102,241,0.3)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  youAreHereText: { color: '#A5B4FC', fontSize: 11 },
  barTrack: { backgroundColor: colors.border, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  barLabel: { fontSize: 14, fontWeight: '500' },
  barLabelNeutral: { color: colors.textSecondary, fontSize: 14 },
  barValue: { color: colors.textFaint, fontSize: 12 },
  barDesc: { color: '#4B5563', fontSize: 12 },
  note: { backgroundColor: 'rgba(31,41,55,0.5)', borderRadius: 10, padding: 12 },
  noteText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  noteStrong: { color: colors.textSecondary, fontWeight: '700' },
  mapGrid: { flexDirection: 'row', gap: 10 },
  mapCard: { flex: 1, backgroundColor: 'rgba(31,41,55,0.5)', borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
  mapIcon: { fontSize: 22 },
  mapLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '500', textAlign: 'center' },
  mapValue: { color: '#818CF8', fontSize: 18, fontWeight: '700' },
  mapDesc: { color: '#4B5563', fontSize: 10, textAlign: 'center' },
  spectrumRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spectrumEndLeft: { color: '#F87171', fontSize: 13, width: 50, textAlign: 'right' },
  spectrumEndRight: { color: '#34D399', fontSize: 13, width: 50 },
  spectrumTrack: { flex: 1, height: 16, backgroundColor: colors.border, borderRadius: 999, overflow: 'hidden', justifyContent: 'center' },
  spectrumMarker: { position: 'absolute', width: 8, height: '100%', backgroundColor: '#FFFFFF', borderRadius: 999 },
  spectrumScore: { color: colors.textFaint, fontSize: 12, textAlign: 'center' },
  congruenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  congruenceItem: { width: '21%', alignItems: 'center', gap: 6, minWidth: 64 },
  congruenceCircle: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: colors.info, alignItems: 'center', justifyContent: 'center' },
  congruenceValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  congruenceLabel: { color: colors.textMuted, fontSize: 11, textAlign: 'center', textTransform: 'capitalize' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaItem: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(31,41,55,0.5)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  metaKey: { color: colors.textFaint, fontSize: 11, textTransform: 'capitalize', flexShrink: 1 },
  metaValue: { color: '#A5B4FC', fontSize: 12, fontWeight: '500' },
  metaValueUnknown: { color: '#4B5563' },
});
