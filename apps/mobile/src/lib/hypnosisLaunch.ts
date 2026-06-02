export type HypnosisSessionType = 'daily_hypnosis' | 'general_chat';

export interface HypnosisConversationTarget {
  id: string;
  session_type: HypnosisSessionType;
}

export type InitialHypnosisTarget =
  | { action: 'load'; sessionId: string }
  | { action: 'start'; sessionType: HypnosisSessionType };

/**
 * Resolves which conversation to open on mount. Mirrors the web launch logic:
 * explicit sessionId wins, then `mode=daily`, then the most recent
 * conversation, finally a fresh general chat.
 */
export function resolveInitialHypnosisTarget(
  params: { sessionId?: string | null; mode?: string | null },
  conversations: HypnosisConversationTarget[],
): InitialHypnosisTarget {
  if (params.sessionId) {
    return { action: 'load', sessionId: params.sessionId };
  }

  if (params.mode === 'daily') {
    return { action: 'start', sessionType: 'daily_hypnosis' };
  }

  const [mostRecent] = conversations;
  if (mostRecent) {
    return { action: 'load', sessionId: mostRecent.id };
  }

  return { action: 'start', sessionType: 'general_chat' };
}
