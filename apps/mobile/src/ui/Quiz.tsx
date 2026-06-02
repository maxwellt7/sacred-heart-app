import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from './theme';

export type QuizQuestion = {
  type: string;
  question?: string;
  prompt?: string;
  scenario?: string;
  options?: string[];
  correctAnswer?: string;
  expectedPatterns?: string[];
};

export type QuizResult = {
  questionIndex: number;
  correct: boolean;
  score: number;
  feedback: string;
};

export type QuizResults = { results: QuizResult[]; overallScore: number; summary: string };

type Props = {
  questions: QuizQuestion[];
  onSubmit: (answers: string[]) => void;
  results: QuizResults | null;
  loading: boolean;
};

function questionLabel(q?: QuizQuestion): string {
  if (!q) return '';
  return q.question || q.prompt || q.scenario || '';
}

export function Quiz({ questions, onSubmit, results, loading }: Props) {
  const [answers, setAnswers] = useState<string[]>(() => new Array(questions.length).fill(''));

  useEffect(() => {
    setAnswers(new Array(questions.length).fill(''));
  }, [questions]);

  const setAnswer = (idx: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  if (results) {
    const resultRows = Array.isArray(results.results) ? results.results : [];
    return (
      <View style={styles.container}>
        <View style={styles.scoreCard}>
          <Text style={styles.overallScore}>{Number(results.overallScore) || 0}%</Text>
          {results.summary ? <Text style={styles.summary}>{results.summary}</Text> : null}
        </View>
        {resultRows.map((r, i) => (
          <View key={i} style={[styles.resultCard, r.correct ? styles.resultCorrect : styles.resultWrong]}>
            <Text style={styles.resultQuestion}>
              Q{i + 1}: {questionLabel(questions[i])}
            </Text>
            <Text style={styles.resultAnswer}>Your answer: {answers[i]}</Text>
            <Text style={styles.resultFeedback}>{r.feedback}</Text>
          </View>
        ))}
      </View>
    );
  }

  const canSubmit = !loading && !answers.some((a) => !a.trim());

  return (
    <View style={styles.container}>
      {questions.map((q, i) => (
        <View key={i} style={styles.questionCard}>
          <Text style={styles.questionText}>
            Q{i + 1}: {questionLabel(q)}
          </Text>
          {q.options ? (
            <View style={styles.options}>
              {q.options.map((opt) => {
                const selected = answers[i] === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setAnswer(i, opt)}
                    style={styles.optionRow}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <Text style={styles.optionText}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <TextInput
              style={styles.input}
              value={answers[i]}
              onChangeText={(value) => setAnswer(i, value)}
              placeholder="Type your answer..."
              placeholderTextColor={colors.textFaint}
              multiline
            />
          )}
        </View>
      ))}
      <Pressable
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        onPress={() => onSubmit(answers)}
        disabled={!canSubmit}
        accessibilityRole="button"
      >
        <Text style={styles.submitText}>{loading ? 'Evaluating...' : 'Submit Answers'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  scoreCard: { backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: 20, alignItems: 'center', gap: 8 },
  overallScore: { color: '#818CF8', fontSize: 36, fontWeight: '700' },
  summary: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  resultCard: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 4 },
  resultCorrect: { borderColor: 'rgba(6,95,70,0.6)', backgroundColor: 'rgba(6,78,59,0.3)' },
  resultWrong: { borderColor: 'rgba(153,27,27,0.6)', backgroundColor: 'rgba(127,29,29,0.3)' },
  resultQuestion: { color: colors.text, fontSize: 14, fontWeight: '500' },
  resultAnswer: { color: colors.textSecondary, fontSize: 13 },
  resultFeedback: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  questionCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 },
  questionText: { color: colors.text, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  options: { gap: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.info },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.info },
  optionText: { color: colors.textSecondary, fontSize: 14, flex: 1 },
  input: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, fontSize: 14, minHeight: 72, textAlignVertical: 'top' },
  submit: { backgroundColor: colors.info, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
