interface ReadinessMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface CreateHypnosisGuardInput {
  readyToGenerate: boolean;
  messages: ReadinessMessage[];
  initializing: boolean;
  loading: boolean;
  generating: boolean;
  isSelectedLocked: boolean;
  minimumUserMessages?: number;
}

export function countUserMessages(messages: ReadinessMessage[] = []) {
  return messages.filter((message) => message.role === 'user' && message.content.trim()).length;
}

export function getLastSubstantiveMessage(messages: ReadinessMessage[] = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.content?.trim()) return message;
  }
  return null;
}

export function isSessionMarkedReady(sessionStatus?: string | null) {
  return sessionStatus === 'ready_for_hypnosis';
}

/**
 * The Create Hypnosis CTA is gated on backend readiness plus a minimum amount of
 * conversation, and only when the last substantive turn was the assistant's.
 * Backend `readyToGenerate` is the source of truth.
 */
export function canShowCreateHypnosisCTA({
  readyToGenerate,
  messages,
  initializing,
  loading,
  generating,
  isSelectedLocked,
  minimumUserMessages = 3,
}: CreateHypnosisGuardInput) {
  if (!readyToGenerate || initializing || loading || generating || isSelectedLocked) {
    return false;
  }

  if (countUserMessages(messages) < minimumUserMessages) {
    return false;
  }

  const lastMessage = getLastSubstantiveMessage(messages);
  if (!lastMessage || lastMessage.role !== 'assistant') {
    return false;
  }

  return true;
}
