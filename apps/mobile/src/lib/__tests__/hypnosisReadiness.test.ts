import { describe, expect, it } from '@jest/globals';
import {
  canShowCreateHypnosisCTA,
  countUserMessages,
  getLastSubstantiveMessage,
  isSessionMarkedReady,
} from '../hypnosisReadiness';

type Msg = { role: 'user' | 'assistant' | 'system'; content: string };

const conversation: Msg[] = [
  { role: 'assistant', content: 'Welcome. What is on your mind?' },
  { role: 'user', content: 'I keep avoiding hard conversations.' },
  { role: 'assistant', content: 'Tell me about a recent example.' },
  { role: 'user', content: 'Yesterday with my manager.' },
  { role: 'assistant', content: 'What did you feel?' },
  { role: 'user', content: 'Anxious and small.' },
  { role: 'assistant', content: 'We have enough to work with.' },
];

const baseInput = {
  readyToGenerate: true,
  messages: conversation,
  initializing: false,
  loading: false,
  generating: false,
  isSelectedLocked: false,
  minimumUserMessages: 3,
};

describe('countUserMessages', () => {
  it('counts only non-empty user turns', () => {
    expect(countUserMessages(conversation)).toBe(3);
    expect(countUserMessages([{ role: 'user', content: '   ' }])).toBe(0);
    expect(countUserMessages([])).toBe(0);
  });
});

describe('getLastSubstantiveMessage', () => {
  it('returns the last message with content', () => {
    expect(getLastSubstantiveMessage(conversation)?.content).toBe('We have enough to work with.');
  });
  it('skips trailing blank messages', () => {
    const msgs: Msg[] = [...conversation, { role: 'assistant', content: '   ' }];
    expect(getLastSubstantiveMessage(msgs)?.content).toBe('We have enough to work with.');
  });
  it('returns null for empty input', () => {
    expect(getLastSubstantiveMessage([])).toBeNull();
  });
});

describe('isSessionMarkedReady', () => {
  it('is true only for ready_for_hypnosis', () => {
    expect(isSessionMarkedReady('ready_for_hypnosis')).toBe(true);
    expect(isSessionMarkedReady('active')).toBe(false);
    expect(isSessionMarkedReady(null)).toBe(false);
    expect(isSessionMarkedReady(undefined)).toBe(false);
  });
});

describe('canShowCreateHypnosisCTA', () => {
  it('shows the CTA when all gates pass', () => {
    expect(canShowCreateHypnosisCTA(baseInput)).toBe(true);
  });

  it('hides when backend has not flagged readiness', () => {
    expect(canShowCreateHypnosisCTA({ ...baseInput, readyToGenerate: false })).toBe(false);
  });

  it('hides while busy or locked', () => {
    expect(canShowCreateHypnosisCTA({ ...baseInput, initializing: true })).toBe(false);
    expect(canShowCreateHypnosisCTA({ ...baseInput, loading: true })).toBe(false);
    expect(canShowCreateHypnosisCTA({ ...baseInput, generating: true })).toBe(false);
    expect(canShowCreateHypnosisCTA({ ...baseInput, isSelectedLocked: true })).toBe(false);
  });

  it('hides before the minimum number of user messages', () => {
    const short: Msg[] = [
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Ready when you are.' },
    ];
    expect(canShowCreateHypnosisCTA({ ...baseInput, messages: short })).toBe(false);
  });

  it('hides when the user spoke last (assistant should have the final turn)', () => {
    const endsWithUser: Msg[] = [...conversation, { role: 'user', content: 'One more thing.' }];
    expect(canShowCreateHypnosisCTA({ ...baseInput, messages: endsWithUser })).toBe(false);
  });
});
