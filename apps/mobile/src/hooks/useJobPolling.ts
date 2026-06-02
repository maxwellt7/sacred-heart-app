import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export type JobStatus<R> = {
  status: 'queued' | 'running' | 'complete' | 'failed';
  result?: R;
  error?: string;
};

type Handlers<R> = {
  onComplete: (result: R | undefined) => void | Promise<void>;
  onFailed: (error?: string) => void;
};

/**
 * Polls a background job until it reaches a terminal state. The work lives on
 * the server, so polling survives backgrounding: it pauses (the OS suspends
 * timers) and fires an immediate catch-up poll when the app returns to the
 * foreground. A `terminal` latch prevents a foreground re-poll from racing the
 * in-flight completion into duplicate handler calls.
 */
export function useJobPolling<R>(
  jobId: string | null,
  fetchStatus: (jobId: string) => Promise<JobStatus<R>>,
  handlers: Handlers<R>,
  intervalMs = 3500,
  errorMs = 6000,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const fetchRef = useRef(fetchStatus);
  fetchRef.current = fetchStatus;

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let terminal = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled || inFlight || terminal) return;
      inFlight = true;
      try {
        const result = await fetchRef.current(jobId);
        if (cancelled || terminal) return;
        if (result.status === 'complete') {
          terminal = true;
          await handlersRef.current.onComplete(result.result);
          return;
        }
        if (result.status === 'failed') {
          terminal = true;
          handlersRef.current.onFailed(result.error);
          return;
        }
        timer = setTimeout(poll, intervalMs);
      } catch {
        if (!cancelled && !terminal) timer = setTimeout(poll, errorMs);
      } finally {
        inFlight = false;
      }
    };

    poll().catch(() => undefined);

    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || cancelled || terminal) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!inFlight) poll().catch(() => undefined);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [jobId, intervalMs, errorMs]);
}
