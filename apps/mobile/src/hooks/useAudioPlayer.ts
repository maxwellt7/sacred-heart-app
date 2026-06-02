import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio, type AVPlaybackStatus } from 'expo-av';

/**
 * Single-track audio player. Only one sound plays at a time; toggling the
 * currently-playing track stops it. Each toggle is assigned a monotonically
 * increasing token so a load that resolves after a newer toggle (or after
 * unmount) is discarded and unloaded immediately, preventing orphaned sounds.
 */
export function useAudioPlayer() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const tokenRef = useRef(0);
  const mountedRef = useRef(true);
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
    tokenRef.current += 1; // cancel any in-flight load
    await unload();
    if (mountedRef.current) setPlayingId(null);
  }, [unload]);

  const toggle = useCallback(
    async (id: string, uri: string) => {
      if (mountedRef.current) setError(null);
      if (playingId === id) {
        await stop();
        return;
      }
      const token = (tokenRef.current += 1);
      await unload();
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });

        // A newer toggle/stop happened, or we unmounted, while loading.
        if (!mountedRef.current || token !== tokenRef.current) {
          sound.unloadAsync().catch(() => undefined);
          return;
        }

        soundRef.current = sound;
        setPlayingId(id);
        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (token !== tokenRef.current || !mountedRef.current) return;
          if (!status.isLoaded) {
            if (status.error) {
              setError('Failed to play audio');
              setPlayingId(null);
            }
            return;
          }
          if (status.didJustFinish) {
            unload().catch(() => undefined);
            if (mountedRef.current) setPlayingId(null);
          }
        });
      } catch {
        if (mountedRef.current && token === tokenRef.current) {
          setError('Failed to play audio');
          setPlayingId(null);
        }
      }
    },
    [playingId, stop, unload],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      tokenRef.current += 1;
      unload().catch(() => undefined);
    };
  }, [unload]);

  return { playingId, error, toggle, stop, clearError: () => setError(null) };
}
