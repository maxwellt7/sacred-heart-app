import { useCallback, useEffect, useRef, useState } from 'react';
import { useNetwork } from './useNetwork';

type ResourceState<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
};

/**
 * Standardized async resource loader: exposes loading/refreshing/error state,
 * pull-to-refresh, and retry. The fetcher is supplied fresh each render but the
 * load callback identity is keyed on `deps` so effects do not loop.
 */
export function useApiResource<T>(fetcher: () => Promise<T>, deps: ReadonlyArray<unknown> = []) {
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    loading: true,
    refreshing: false,
    error: null,
  });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mountedRef = useRef(true);
  const stateRef = useRef(state);
  stateRef.current = state;
  const { isOffline } = useNetwork();
  const wasOfflineRef = useRef(isOffline);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      setState((prev) => ({
        data: prev.data,
        loading: mode === 'initial',
        refreshing: mode === 'refresh',
        error: null,
      }));
      try {
        const data = await fetcherRef.current();
        if (!mountedRef.current) return;
        setState({ data, loading: false, refreshing: false, error: null });
      } catch (err) {
        if (!mountedRef.current) return;
        setState((prev) => ({
          data: prev.data,
          loading: false,
          refreshing: false,
          error: err instanceof Error ? err.message : 'Something went wrong',
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    load('initial').catch(() => undefined);
  }, [load]);

  // Auto-recover when connectivity returns after a failed/empty load.
  useEffect(() => {
    const cameBackOnline = wasOfflineRef.current && !isOffline;
    wasOfflineRef.current = isOffline;
    if (cameBackOnline && (stateRef.current.error || stateRef.current.data === null)) {
      load('initial').catch(() => undefined);
    }
  }, [isOffline, load]);

  const refresh = useCallback(() => load('refresh'), [load]);
  const retry = useCallback(() => load('initial'), [load]);
  const setData = useCallback((updater: T | null | ((prev: T | null) => T | null)) => {
    setState((prev) => ({
      ...prev,
      data: typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev.data) : updater,
    }));
  }, []);

  return { ...state, refresh, retry, setData };
}
