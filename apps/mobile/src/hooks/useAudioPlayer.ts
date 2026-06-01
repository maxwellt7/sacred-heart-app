import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio, type AVPlaybackStatus } from 'expo-av';

/**
 * Single-track audio player. Only one sound plays at a time; toggling the
 * currently-playing track stops it. Sound resources are always unloaded on
 * stop and on unmount to avoid leaks.
 */
export function useAudioPlayer() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unload = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch {
        // ignore unload races
      }
    }
  }, []);

  const stop = useCallback(async () => {
    await unload();
    setPlayingId(null);
  }, [unload]);

  const toggle = useCallback(
    async (id: string, uri: string) => {
      setError(null);
      if (playingId === id) {
        await stop();
        return;
      }
      await unload();
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
        soundRef.current = sound;
        setPlayingId(id);
        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (!status.isLoaded) {
            if (status.error) {
              setError('Failed to play audio');
              setPlayingId(null);
            }
            return;
          }
          if (status.didJustFinish) {
            unload().catch(() => undefined);
            setPlayingId(null);
          }
        });
      } catch {
        setError('Failed to play audio');
        setPlayingId(null);
      }
    },
    [playingId, stop, unload],
  );

  useEffect(() => {
    return () => {
      unload().catch(() => undefined);
    };
  }, [unload]);

  return { playingId, error, toggle, stop, clearError: () => setError(null) };
}
