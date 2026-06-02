import { describe, expect, it } from '@jest/globals';
import { resolveInitialHypnosisTarget, type HypnosisConversationTarget } from '../hypnosisLaunch';

const conversations: HypnosisConversationTarget[] = [
  { id: 'most-recent', session_type: 'general_chat' },
  { id: 'older', session_type: 'daily_hypnosis' },
];

describe('resolveInitialHypnosisTarget', () => {
  it('loads an explicit sessionId param above everything else', () => {
    expect(resolveInitialHypnosisTarget({ sessionId: 'abc', mode: 'daily' }, conversations)).toEqual({
      action: 'load',
      sessionId: 'abc',
    });
  });

  it('starts a daily session when mode=daily and no sessionId', () => {
    expect(resolveInitialHypnosisTarget({ mode: 'daily' }, conversations)).toEqual({
      action: 'start',
      sessionType: 'daily_hypnosis',
    });
  });

  it('loads the most recent conversation when no params are given', () => {
    expect(resolveInitialHypnosisTarget({}, conversations)).toEqual({
      action: 'load',
      sessionId: 'most-recent',
    });
  });

  it('starts a general chat when there are no conversations', () => {
    expect(resolveInitialHypnosisTarget({}, [])).toEqual({
      action: 'start',
      sessionType: 'general_chat',
    });
  });

  it('ignores empty/null params', () => {
    expect(resolveInitialHypnosisTarget({ sessionId: null, mode: null }, [])).toEqual({
      action: 'start',
      sessionType: 'general_chat',
    });
  });
});
