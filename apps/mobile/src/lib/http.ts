export const DEFAULT_TIMEOUT_MS = 30000;

export class TimeoutError extends Error {
  constructor(message = 'Request timed out. Please check your connection and try again.') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * fetch with a hard timeout. Without this a hung connection never settles and
 * screens stay stuck on a loading spinner forever. Aborts after `timeoutMs`
 * and surfaces a TimeoutError that callers can render as a normal error state.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
