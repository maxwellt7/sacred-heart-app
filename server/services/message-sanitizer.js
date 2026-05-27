// Heals assistant messages that were persisted as raw JSON blobs when a
// previous AI response failed to parse cleanly (typically max_tokens
// truncation in the coaching pipeline). Used both for outbound responses to
// the frontend and for context fed back into the model on subsequent turns.

export function extractReplyField(text) {
  if (typeof text !== 'string') return '';
  // Normal case: a fully-formed "reply": "..." string with a closing quote.
  let match = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  // Truncation fallback: max_tokens cut the response off mid-reply, so there
  // is no closing quote. Capture from the opening quote to end-of-string,
  // tolerating a dangling backslash (a half-written escape) so the trailing
  // partial escape doesn't block the match. Without this, a truncated blob
  // leaks raw JSON into the chat.
  if (!match) {
    match = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)\\?$/);
  }
  if (!match) return '';
  const raw = match[1];
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
}

export function extractReadyFlag(text) {
  if (typeof text !== 'string') return false;
  const match = text.match(/"readyToGenerate"\s*:\s*(true|false)/);
  return Boolean(match && match[1] === 'true');
}

export function looksLikeRawJson(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('{') &&
    /"reply"|"readyToGenerate"|"profileUpdates"|"valueDetections"/.test(trimmed)
  );
}

export function sanitizeAssistantContent(content) {
  if (typeof content !== 'string') return content;
  if (!looksLikeRawJson(content)) return content;
  const recovered = extractReplyField(content);
  if (recovered && !looksLikeRawJson(recovered)) {
    return recovered;
  }
  return content;
}

// Derives a chat-safe assistant message from a model response. Prefers an
// already-parsed reply, falls back to extracting/healing the raw text, and
// returns '' when nothing usable can be salvaged — signalling the caller to
// surface an error instead of persisting a raw JSON blob into the chat.
export function recoverChatReply(text, parsedReply) {
  if (typeof parsedReply === 'string' && parsedReply.trim() && !looksLikeRawJson(parsedReply)) {
    return parsedReply;
  }
  const cleaned = sanitizeAssistantContent(typeof text === 'string' ? text : '');
  if (typeof cleaned === 'string' && cleaned.trim() && !looksLikeRawJson(cleaned)) {
    return cleaned;
  }
  return '';
}

export function sanitizeMessageHistory(list = []) {
  return list.map((m) => {
    if (m && m.role === 'assistant' && typeof m.content === 'string') {
      return { ...m, content: sanitizeAssistantContent(m.content) };
    }
    return m;
  });
}
