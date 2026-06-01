import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ProgressState = Record<string, boolean>;

const STORAGE_KEY = 'sacred-heart:progress';

export function useProgress() {
  const [progress, setProgress] = useState<ProgressState>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProgress = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setProgress(JSON.parse(raw));
        }
      } catch {
        setProgress({});
      } finally {
        setLoading(false);
      }
    };

    loadProgress().catch(() => undefined);
  }, []);

  const save = useCallback(async (next: ProgressState) => {
    setProgress(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const markComplete = useCallback(
    async (id: string) => {
      await save({ ...progress, [id]: true });
    },
    [progress, save],
  );

  const clearProgress = useCallback(async () => {
    setProgress({});
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return useMemo(
    () => ({
      progress,
      loading,
      markComplete,
      clearProgress,
      isComplete: (id: string) => Boolean(progress[id]),
    }),
    [progress, loading, markComplete, clearProgress],
  );
}
