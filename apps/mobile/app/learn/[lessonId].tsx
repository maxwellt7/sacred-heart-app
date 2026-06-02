import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { api } from '../../src/services/api';
import { useApiResource } from '../../src/hooks/useApiResource';
import { useProgress } from '../../src/hooks/useProgress';
import { ErrorState, InlineError, LoadingState } from '../../src/ui/states';
import { OfflineBanner } from '../../src/ui/OfflineBanner';
import { LessonContent } from '../../src/ui/LessonContent';
import { Quiz, type QuizQuestion, type QuizResults } from '../../src/ui/Quiz';
import { colors } from '../../src/ui/theme';

type LessonData = {
  lesson: { title: string; description?: string };
  content: { data: unknown }[];
};

export default function LessonScreen() {
  const params = useLocalSearchParams<{ lessonId?: string | string[] }>();
  const lessonId = Array.isArray(params.lessonId) ? params.lessonId[0] : params.lessonId;
  const { completeLesson } = useProgress();

  const [showQuiz, setShowQuiz] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [quizResults, setQuizResults] = useState<QuizResults | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  const { data, loading, error, retry } = useApiResource<LessonData>(
    () => {
      if (!lessonId) throw new Error('Lesson not found.');
      return api.getLesson(lessonId);
    },
    [lessonId],
  );

  const startQuiz = useCallback(async () => {
    if (!lessonId) return;
    setQuizLoading(true);
    setQuizError(null);
    try {
      const result = await api.generateQuiz(lessonId);
      setQuestions(Array.isArray(result?.questions) ? result.questions : []);
      setShowQuiz(true);
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : 'Failed to generate quiz');
    } finally {
      setQuizLoading(false);
    }
  }, [lessonId]);

  const submitQuiz = useCallback(
    async (answers: string[]) => {
      if (!lessonId || !questions) return;
      setQuizLoading(true);
      setQuizError(null);
      try {
        const results: QuizResults = await api.evaluateQuiz(lessonId, questions, answers);
        setQuizResults(results);
        completeLesson(lessonId, results.overallScore);
      } catch (err) {
        setQuizError(err instanceof Error ? err.message : 'Failed to evaluate quiz');
      } finally {
        setQuizLoading(false);
      }
    },
    [lessonId, questions, completeLesson],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <LoadingState label="Loading lesson..." />
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

  const lesson = data?.lesson;
  const content = Array.isArray(data?.content) ? data.content : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{lesson?.title}</Text>
        {lesson?.description ? <Text style={styles.description}>{lesson.description}</Text> : null}

        {!showQuiz ? (
          <>
            <View style={styles.contentBlock}>
              {content.map((section, i) => (
                <LessonContent key={i} data={section.data} />
              ))}
            </View>
            <Pressable
              style={[styles.primaryButton, quizLoading && styles.disabledButton]}
              onPress={startQuiz}
              disabled={quizLoading}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>{quizLoading ? 'Generating Quiz...' : 'Take Quiz'}</Text>
            </Pressable>
            {quizError ? <InlineError message={quizError} onDismiss={() => setQuizError(null)} /> : null}
          </>
        ) : questions ? (
          <>
            <Text style={styles.quizHeading}>Quiz</Text>
            {quizError ? (
              <InlineError message={quizError} onDismiss={() => setQuizError(null)} onRetry={startQuiz} />
            ) : null}
            <Quiz questions={questions} onSubmit={submitQuiz} results={quizResults} loading={quizLoading} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 60, gap: 14 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  contentBlock: { gap: 16 },
  primaryButton: { backgroundColor: colors.info, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  disabledButton: { opacity: 0.5 },
  quizHeading: { color: colors.text, fontSize: 19, fontWeight: '600' },
});
