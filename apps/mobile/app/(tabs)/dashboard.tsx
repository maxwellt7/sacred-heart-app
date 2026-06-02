import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../../src/services/api';
import { useApiResource } from '../../src/hooks/useApiResource';
import { dateKeyToDate } from '../../src/lib/date';
import { ErrorState, InlineError, LoadingState } from '../../src/ui/states';
import { OfflineBanner } from '../../src/ui/OfflineBanner';
import { XpBar } from '../../src/ui/XpBar';
import { MysteryBox } from '../../src/ui/MysteryBox';
import { colors } from '../../src/ui/theme';

type DashboardData = {
  profile: any;
  streak: any;
  xp: any;
  sessionCompleted: boolean;
  sessionInProgress: boolean;
  sessions: any[];
  boxes: any[];
  achievements: any[];
};

const MAP_LABELS: Record<string, string> = {
  map1: 'Work / Adult',
  map2: 'Social / Adolescent',
  map3: 'Home / Childhood',
};

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  suppression: { label: 'Suppression', color: colors.warning },
  discharge: { label: 'Discharge', color: '#EF4444' },
  capacity: { label: 'Capacity', color: colors.success },
};

const CAPACITY_KEYS = ['suppression', 'discharge', 'capacity'] as const;
const CAPACITY_COLORS: Record<string, string> = {
  suppression: colors.warning,
  discharge: '#EF4444',
  capacity: colors.success,
};
const FORCE_KEYS = ['subtle', 'clean'] as const;
const FORCE_COLORS: Record<string, string> = { subtle: colors.warning, clean: colors.success };

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function ratingStars(rating: unknown): number {
  return Math.max(0, Math.min(5, Math.floor(num(rating))));
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.min(100, value * 10)}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const [openedBoxIds, setOpenedBoxIds] = useState<Set<string>>(new Set());

  const { data, loading, refreshing, error, refresh, retry } = useApiResource<DashboardData>(
    async () => {
      const [profileData, sessionData] = await Promise.all([api.getProfile(), api.getSessions(7)]);
      let boxes: any[] = [];
      let achievements: any[] = [];
      try {
        const [boxData, achData] = await Promise.all([api.getUnopenedBoxes(), api.getAchievements()]);
        boxes = Array.isArray(boxData?.boxes) ? boxData.boxes : [];
        achievements = Array.isArray(achData?.achievements) ? achData.achievements : [];
      } catch {
        // gamification is optional
      }
      return {
        profile: profileData?.profile ?? null,
        streak: profileData?.streak ?? null,
        xp: profileData?.xp ?? null,
        sessionCompleted: Boolean(profileData?.sessionCompleted),
        sessionInProgress: Boolean(profileData?.sessionInProgress),
        sessions: Array.isArray(sessionData?.sessions) ? sessionData.sessions : [],
        boxes,
        achievements,
      };
    },
    [],
  );

  const goToSession = useCallback(
    () => router.push({ pathname: '/(tabs)/hypnosis', params: { mode: 'daily' } }),
    [router],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <LoadingState label="Loading command center..." />
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
  const xp = data?.xp ?? null;
  const sessions = data?.sessions ?? [];
  const achievements = data?.achievements ?? [];
  const boxes = (data?.boxes ?? []).filter((b) => !openedBoxIds.has(b.id));
  const streakMultiplier = num(xp?.streak_multiplier, 1);
  const metaPrograms: [string, unknown][] = profile?.meta_programs ? Object.entries(profile.meta_programs) : [];
  const detectedMeta = metaPrograms.filter(([, v]) => v && v !== 'unknown');
  const congruence: [string, unknown][] = profile?.congruence ? Object.entries(profile.congruence) : [];
  const victimMarker = Math.max(2, Math.min(98, (num(profile?.victim_healer?.score) + 5) * 10));
  const ctaLabel = data?.sessionCompleted ? 'Review Session' : data?.sessionInProgress ? 'Continue Session' : 'Begin Session';
  const ctaCopy = data?.sessionCompleted
    ? 'Session complete. Review your intel or continue exploring.'
    : data?.sessionInProgress
      ? 'You have an open session. Pick up where you left off.'
      : 'Your next session awaits. Step into the work.';

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        {error ? <InlineError message={error} onRetry={retry} /> : null}
        <View style={styles.hero}>
          <Text style={styles.heroDate}>
            {new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          <Text style={styles.heroGreeting}>{greeting()}</Text>
          <Text style={styles.heroCopy}>{ctaCopy}</Text>
        </View>

        {xp ? (
          <XpBar
            level={num(xp.level, 1)}
            title={xp.title || 'Seeker'}
            totalXp={num(xp.total_xp)}
            progressToNext={num(xp.progressToNext)}
            maxLevel={Boolean(xp.maxLevel)}
          />
        ) : null}

        <Pressable
          style={[styles.cta, data?.sessionCompleted ? styles.ctaMuted : styles.ctaActive]}
          onPress={goToSession}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, data?.sessionCompleted ? styles.ctaTextMuted : styles.ctaTextActive]}>
            {ctaLabel}
          </Text>
        </Pressable>

        {boxes.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Sealed Intel ({boxes.length})</Text>
            {boxes.map((box) => (
              <MysteryBox
                key={box.id}
                box={box}
                onOpened={(opened) => setOpenedBoxIds((prev) => new Set(prev).add(opened.id))}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.statGrid}>
          <StatCard value={num(streak?.current_streak)} label="Streak" />
          <StatCard value={num(streak?.total_sessions)} label="Sessions" />
          <StatCard value={num(streak?.longest_streak)} label="Record" />
        </View>

        {streakMultiplier > 1 ? (
          <View style={styles.multiplierCard}>
            <Text style={styles.multiplierValue}>{streakMultiplier}x</Text>
            <Text style={styles.multiplierLabel}>XP Multiplier</Text>
          </View>
        ) : null}

        {profile?.capacity_index ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Operational Profile</Text>

            <Text style={styles.subLabel}>Emotional Capacity</Text>
            <View style={styles.gap10}>
              {CAPACITY_KEYS.map((key) => {
                const val = num(profile.capacity_index?.[key], 5);
                return (
                  <View key={key} style={styles.gap4}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.metricKey}>{key}</Text>
                      <Text style={[styles.metricVal, { color: CAPACITY_COLORS[key] }]}>{val.toFixed(1)}</Text>
                    </View>
                    <Bar value={val} color={CAPACITY_COLORS[key]} />
                  </View>
                );
              })}
            </View>

            {detectedMeta.length > 0 ? (
              <>
                <Text style={styles.subLabel}>Detected Patterns</Text>
                <View>
                  {detectedMeta.map(([key, value]) => (
                    <View key={key} style={styles.metaRow}>
                      <Text style={styles.metaKey}>{key.replace(/_/g, ' ')}</Text>
                      <Text style={styles.metaValue}>{String(value)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.subLabel}>Victim — Healer Spectrum</Text>
            <View style={styles.spectrumRow}>
              <Text style={styles.spectrumEnd}>V</Text>
              <View style={styles.spectrumTrack}>
                <View style={[styles.spectrumMarker, { left: `${victimMarker}%` }]} />
              </View>
              <Text style={[styles.spectrumEnd, { color: colors.success }]}>H</Text>
            </View>

            {profile.force_audit ? (
              <>
                <Text style={styles.subLabel}>Force vs. Influence</Text>
                <View style={styles.gap10}>
                  {FORCE_KEYS.map((key) => {
                    const val = num(profile.force_audit?.[key], 5);
                    return (
                      <View key={key} style={styles.gap4}>
                        <View style={styles.rowBetween}>
                          <Text style={styles.metricKey}>{key === 'subtle' ? 'Subtle Force' : 'Clean Influence'}</Text>
                          <Text style={[styles.metricVal, { color: FORCE_COLORS[key] }]}>{val.toFixed(1)}</Text>
                        </View>
                        <Bar value={val} color={FORCE_COLORS[key]} />
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {congruence.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Congruence Index</Text>
            <View style={styles.congruenceGrid}>
              {congruence.map(([domain, score]) => {
                const val = num(score);
                return (
                  <View key={domain} style={styles.congruenceItem}>
                    <View style={styles.congruenceCircle}>
                      <Text style={styles.congruenceValue}>{val.toFixed(0)}</Text>
                    </View>
                    <Bar value={val} color={colors.accent} />
                    <Text style={styles.congruenceLabel}>{domain.replace(/_/g, ' ')}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {achievements.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardLabel}>Achievements</Text>
              <Text style={styles.achievementCount}>
                {achievements.filter((a) => a.unlocked).length}/{achievements.length}
              </Text>
            </View>
            <View style={styles.achievementGrid}>
              {achievements.slice(0, 9).map((ach) => (
                <View key={ach.key} style={[styles.achievement, !ach.unlocked && styles.achievementLocked]}>
                  <Text style={styles.achievementIcon}>{ach.unlocked ? ach.icon || '🏅' : '🔒'}</Text>
                  <Text style={[styles.achievementTitle, !ach.unlocked && styles.achievementTitleLocked]} numberOfLines={2}>
                    {ach.title}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {sessions.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Session Log</Text>
            <View style={styles.gap10}>
              {sessions.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.sessionRow}
                  onPress={() => router.push({ pathname: '/(tabs)/hypnosis', params: { sessionId: s.id } })}
                  accessibilityRole="button"
                >
                  <View style={styles.sessionDate}>
                    <Text style={styles.sessionDay}>
                      {dateKeyToDate(s.date_key)?.toLocaleDateString('en', { day: 'numeric' }) ?? '–'}
                    </Text>
                    <Text style={styles.sessionMonth}>
                      {dateKeyToDate(s.date_key)?.toLocaleDateString('en', { month: 'short' }) ?? ''}
                    </Text>
                  </View>
                  <View style={styles.sessionBody}>
                    {s.chat_summary ? (
                      <Text style={styles.sessionSummary} numberOfLines={2}>
                        {s.chat_summary}
                      </Text>
                    ) : null}
                    <View style={styles.sessionMeta}>
                      {s.detected_map ? (
                        <Text style={styles.sessionTag}>{MAP_LABELS[s.detected_map] || s.detected_map}</Text>
                      ) : null}
                      {s.detected_state && STATE_LABELS[s.detected_state] ? (
                        <Text style={[styles.sessionState, { color: STATE_LABELS[s.detected_state].color }]}>
                          {STATE_LABELS[s.detected_state].label}
                        </Text>
                      ) : null}
                      {Array.isArray(s.key_themes)
                        ? s.key_themes.slice(0, 2).map((t: string, i: number) => (
                            <Text key={i} style={styles.sessionTheme}>
                              #{t}
                            </Text>
                          ))
                        : null}
                      {ratingStars(s.user_rating) ? (
                        <Text style={styles.sessionRating}>{'★'.repeat(ratingStars(s.user_rating))}</Text>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
            {sessions.length >= 7 ? (
              <Pressable onPress={() => router.push('/sessions')} accessibilityRole="button">
                <Text style={styles.viewAll}>View full session log</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 60, gap: 16 },
  hero: { borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 4 },
  heroDate: { color: colors.accent, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  heroGreeting: { color: colors.text, fontSize: 26, fontWeight: '700' },
  heroCopy: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  cta: { borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1 },
  ctaActive: { backgroundColor: colors.accent, borderColor: 'rgba(212,168,83,0.3)' },
  ctaMuted: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  ctaText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  ctaTextActive: { color: colors.background },
  ctaTextMuted: { color: colors.textSecondary },
  section: { gap: 10 },
  sectionLabel: { color: colors.textFaint, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  statGrid: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  multiplierCard: { backgroundColor: 'rgba(212,168,83,0.1)', borderWidth: 1, borderColor: 'rgba(212,168,83,0.3)', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  multiplierValue: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  multiplierLabel: { color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  cardLabel: { color: colors.textFaint, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  subLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4 },
  gap10: { gap: 10 },
  gap4: { gap: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricKey: { color: colors.textMuted, fontSize: 12, textTransform: 'capitalize' },
  metricVal: { fontSize: 12, fontWeight: '600' },
  barTrack: { height: 6, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  metaKey: { color: colors.textFaint, fontSize: 12, textTransform: 'capitalize' },
  metaValue: { color: colors.accent, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  spectrumRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spectrumEnd: { color: '#F87171', fontSize: 11, fontWeight: '700', width: 14, textAlign: 'center' },
  spectrumTrack: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden', justifyContent: 'center' },
  spectrumMarker: { position: 'absolute', width: 8, height: '100%', backgroundColor: colors.accent, borderRadius: 999 },
  congruenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  congruenceItem: { width: '21%', minWidth: 64, alignItems: 'center', gap: 6 },
  congruenceCircle: { width: 50, height: 50, borderRadius: 25, borderWidth: 3, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  congruenceValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  congruenceLabel: { color: colors.textMuted, fontSize: 10, textAlign: 'center', textTransform: 'capitalize' },
  achievementCount: { color: colors.textFaint, fontSize: 12 },
  achievementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  achievement: { width: '31%', minWidth: 92, flexGrow: 1, backgroundColor: colors.surfaceMuted, borderRadius: 10, padding: 10, alignItems: 'center', gap: 4 },
  achievementLocked: { opacity: 0.5 },
  achievementIcon: { fontSize: 22 },
  achievementTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  achievementTitleLocked: { color: colors.textFaint },
  sessionRow: { flexDirection: 'row', gap: 12, backgroundColor: colors.surfaceMuted, borderRadius: 10, padding: 12 },
  sessionDate: { width: 40, height: 40, borderRadius: 8, backgroundColor: 'rgba(212,168,83,0.12)', alignItems: 'center', justifyContent: 'center' },
  sessionDay: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  sessionMonth: { color: colors.textFaint, fontSize: 9, textTransform: 'uppercase' },
  sessionBody: { flex: 1, gap: 6 },
  sessionSummary: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  sessionTag: { color: colors.textMuted, fontSize: 10, backgroundColor: colors.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  sessionState: { fontSize: 10, fontWeight: '600' },
  sessionTheme: { color: colors.textFaint, fontSize: 10 },
  sessionRating: { color: colors.accent, fontSize: 10 },
  viewAll: { color: colors.accent, fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 4 },
});
