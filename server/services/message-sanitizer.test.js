import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractReplyField,
  recoverChatReply,
  sanitizeAssistantContent,
  sanitizeMessageHistory,
} from './message-sanitizer.js';

test('extractReplyField recovers a complete reply field', () => {
  const blob = '{"reply": "Hello there.", "readyToGenerate": false}';
  assert.equal(extractReplyField(blob), 'Hello there.');
});

test('extractReplyField recovers a reply from JSON truncated mid-reply (no closing quote)', () => {
  // Reproduces the locked-session bug: max_tokens truncation left the JSON
  // with an unterminated "reply" string, so the old closing-quote regex
  // matched nothing and the raw blob leaked into the chat.
  const truncated = '{\n  "reply": "Maxwell, you have been carrying';
  assert.equal(extractReplyField(truncated), 'Maxwell, you have been carrying');
});

test('extractReplyField drops a dangling escape at a truncation point', () => {
  const truncated = '{"reply": "Take a breath\\';
  assert.equal(extractReplyField(truncated), 'Take a breath');
});

test('sanitizeAssistantContent heals a truncated raw JSON blob into plain text', () => {
  const truncated = '{\n  "reply": "Maxwell, you have been carrying';
  assert.equal(
    sanitizeAssistantContent(truncated),
    'Maxwell, you have been carrying'
  );
});

test('sanitizeMessageHistory heals a stored truncated assistant turn', () => {
  const history = [
    { role: 'assistant', content: '{\n  "reply": "Maxwell, welcome back' },
  ];
  assert.equal(sanitizeMessageHistory(history)[0].content, 'Maxwell, welcome back');
});

test('recoverChatReply uses a clean parsed reply as-is', () => {
  const text = '{"reply": "Welcome back.", "readyToGenerate": false}';
  assert.equal(recoverChatReply(text, 'Welcome back.'), 'Welcome back.');
});

test('recoverChatReply returns plain-text responses that were never JSON', () => {
  assert.equal(recoverChatReply('Just a plain greeting.', undefined), 'Just a plain greeting.');
});

test('recoverChatReply recovers a reply when JSON parsing failed on truncation', () => {
  // /init bug: parse fails, so no parsedReply, but the leading reply is
  // still extractable. Must NOT return the raw blob.
  const truncated = '{\n  "reply": "Maxwell, welcome back to your';
  assert.equal(recoverChatReply(truncated, undefined), 'Maxwell, welcome back to your');
});

test('recoverChatReply returns empty string when only an unusable JSON blob remains', () => {
  // No "reply" field at all — nothing to salvage. Caller should error rather
  // than persist this blob into the chat.
  const blob = '{"profileUpdates": {}, "readyToGenerate": false}';
  assert.equal(recoverChatReply(blob, undefined), '');
});
