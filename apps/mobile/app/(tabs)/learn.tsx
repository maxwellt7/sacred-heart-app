import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../../src/services/api';
import { useApiResource } from '../../src/hooks/useApiResource';
import { useProgress } from '../../src/hooks/useProgress';
import { EmptyState, ErrorState, LoadingState } from '../../src/ui/states';
import { OfflineBanner } from '../../src/ui/OfflineBanner';
import { colors } from '../../src/ui/theme';

type LessonItem = { id: string; title: string; description?: string };
type ModuleItem = { id: string; title: string; description?: string; lessons: LessonItem[] };

export default function LearnScreen() {
  const router = useRouter();
  const { progress } = useProgress();

  const { data, loading, refreshing, error, refresh, retry } = useApiResource<ModuleItem[]>(
    async () => {
      const payload = await api.getModules();
      return Array.isArray(payload?.modules) ? payload.modules : [];
    },
    [],
  );

  const openLesson = useCallback(
    (lessonId: string) => {
      router.push(`/learn/${lessonId}`);
    },
    [router],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <LoadingState label="Loading curriculum..." />
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

  const modules = data ?? [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <Text style={styles.title}>Learn NLP</Text>
        {modules.length === 0 ? (
          <EmptyState title="No curriculum yet" message="Check back soon for lessons." />
        ) : (
          modules.map((mod) => {
            const lessons = Array.isArray(mod.lessons) ? mod.lessons : [];
            const completedCount = lessons.filter((l) => progress.lessons[l.id]?.completed).length;
            return (
              <View key={mod.id} style={styles.moduleCard}>
                <View style={styles.moduleHeader}>
                  <View style={styles.moduleHeaderRow}>
                    <Text style={styles.moduleTitle}>{mod.title}</Text>
                    <Text style={styles.moduleCount}>
                      {completedCount}/{lessons.length}
                    </Text>
                  </View>
                  {mod.description ? <Text style={styles.moduleDescription}>{mod.description}</Text> : null}
                </View>
                <View>
                  {lessons.map((lesson, i) => {
                    const lp = progress.lessons[lesson.id];
                    return (
                      <Pressable
                        key={lesson.id}
                        onPress={() => openLesson(lesson.id)}
                        style={[styles.lessonRow, i > 0 && styles.lessonRowBordered]}
                        accessibilityRole="button"
                      >
                        <View style={styles.lessonInfo}>
                          <Text style={styles.lessonTitle}>{lesson.title}</Text>
                          {lesson.description ? (
                            <Text style={styles.lessonDescription}>{lesson.description}</Text>
                          ) : null}
                        </View>
                        <View style={styles.lessonStatus}>
                          {lp?.quizScore != null ? (
                            <Text style={[styles.score, lp.quizScore >= 80 ? styles.scoreGood : styles.scoreOk]}>
                              {lp.quizScore}%
                            </Text>
                          ) : null}
                          {lp?.completed ? <Text style={styles.check}>✓</Text> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  moduleCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  moduleHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 },
  moduleHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  moduleTitle: { color: colors.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  moduleCount: { color: colors.textMuted, fontSize: 13 },
  moduleDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  lessonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, gap: 10 },
  lessonRowBordered: { borderTopWidth: 1, borderTopColor: colors.border },
  lessonInfo: { flex: 1, gap: 2 },
  lessonTitle: { color: colors.text, fontSize: 14, fontWeight: '500' },
  lessonDescription: { color: colors.textFaint, fontSize: 12, lineHeight: 16 },
  lessonStatus: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  score: { fontSize: 12 },
  scoreGood: { color: colors.success },
  scoreOk: { color: colors.warning },
  check: { color: colors.success, fontSize: 14 },
});
