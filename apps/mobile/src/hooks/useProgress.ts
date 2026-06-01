import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type LessonProgress = {
  completed: boolean;
  quizScore: number | null;
  completedAt: string | null;
};

type PracticeProgress = {
  sessionsCompleted: number;
  scenarios: Record<string, number>;
};

export type Progress = {
  lessons: Record<string, LessonProgress>;
  practice: PracticeProgress;
  lastAccessed: string;
};

const STORAGE_KEY = 'sacred-heart:progress';

function makeDefault(): Progress {
  return {
    lessons: {},
    practice: {
      sessionsCompleted: 0,
      scenarios: { sales: 0, coaching: 0, negotiation: 0, 'pattern-drill': 0, free: 0 },
    },
    lastAccessed: new Date().toISOString().split('T')[0],
  };
}

/**
 * Local lesson/practice progress backed by AsyncStorage. Mirrors the web hook
 * API (`completeLesson`, `recordPracticeSession`, `resetProgress`) so screens
 * port over without behavioral changes.
 */
export function useProgress() {
  const [progress, setProgress] = useState<Progress>(makeDefault);
  const [loading, setLoading] = useState(true);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (active && raw) {
          setProgress({ ...makeDefault(), ...JSON.parse(raw) });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((next: Progress) => {
    next.lastAccessed = new Date().toISOString().split('T')[0];
    setProgress(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const completeLesson = useCallback(
    (lessonId: string, quizScore: number | null) => {
      persist({
        ...progressRef.current,
        lessons: {
          ...progressRef.current.lessons,
          [lessonId]: { completed: true, quizScore, completedAt: new Date().toISOString().split('T')[0] },
        },
      });
    },
    [persist],
  );

  const recordPracticeSession = useCallback(
    (scenario: string) => {
      const prev = progressRef.current;
      persist({
        ...prev,
        practice: {
          sessionsCompleted: prev.practice.sessionsCompleted + 1,
          scenarios: { ...prev.practice.scenarios, [scenario]: (prev.practice.scenarios[scenario] || 0) + 1 },
        },
      });
    },
    [persist],
  );

  const resetProgress = useCallback(() => {
    persist(makeDefault());
  }, [persist]);

  return { progress, loading, completeLesson, recordPracticeSession, resetProgress };
}
