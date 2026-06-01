import { getCalendars } from 'expo-localization';
import { env } from '../config/env';

const BASE = `${env.apiUrl.replace(/\/$/, '')}/api`;

let getToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(fn: (() => Promise<string | null>) | null) {
  getToken = fn;
}

function getDeviceTimezone(): string | null {
  try {
    const calendars = getCalendars();
    if (!calendars || calendars.length === 0) {
      return null;
    }
    return calendars[0]?.timeZone ?? null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!env.apiUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_URL');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  };

  const timezone = getDeviceTimezone();
  if (timezone) {
    headers['X-User-Timezone'] = timezone;
  }

  if (getToken) {
    try {
      const token = await getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Continue unauthenticated on token errors.
    }
  }

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Profile and session history
  getProfile: () => request<any>('/profile'),
  updateProfile: (data: any) =>
    request<any>('/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getSessions: (limit = 30, offset = 0) =>
    request<any>(`/profile/sessions?limit=${limit}&offset=${offset}`),
  getSession: (sessionId: string) =>
    request<any>(`/profile/sessions/${sessionId}`),
  rateSession: (sessionId: string, rating: number, feedback?: string) =>
    request<any>(`/profile/sessions/${sessionId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    }),
  getStreak: () => request<any>('/profile/streak'),

  // Coaching and hypnosis
  hypnosisInit: (options?: { sessionId?: string; sessionType?: string; forceNew?: boolean; title?: string }) =>
    request<any>('/hypnosis/init', { method: 'POST', body: JSON.stringify(options ?? {}) }),
  hypnosisChat: (messages: any[], sessionId?: string, moodBefore?: number, sessionType?: string, title?: string) =>
    request<any>('/hypnosis/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, sessionId, moodBefore, sessionType, title }),
    }),
  hypnosisGenerateStart: (messages: any[], sessionId?: string) =>
    request<{ jobId: string; status: 'queued' | 'running' | 'complete' | 'failed' }>('/hypnosis/generate', {
      method: 'POST',
      body: JSON.stringify({ messages, sessionId }),
    }),
  hypnosisGenerateStatus: (jobId: string) =>
    request<{
      jobId: string;
      status: 'queued' | 'running' | 'complete' | 'failed';
      result?: any;
      error?: string;
    }>(`/hypnosis/generate-status/${encodeURIComponent(jobId)}`),
  hypnosisGetActiveJob: (sessionId: string) =>
    request<{ jobId: string | null; status?: 'queued' | 'running' }>(
      `/hypnosis/generate-active/${encodeURIComponent(sessionId)}`,
    ),

  // Learn
  getModules: () => request<any>('/learn/modules'),
  getLesson: (lessonId: string) => request<any>(`/learn/lesson/${lessonId}`),
  generateQuiz: (lessonId: string) =>
    request<any>('/learn/quiz', { method: 'POST', body: JSON.stringify({ lessonId }) }),
  evaluateQuiz: (lessonId: string, questions: any[], userAnswers: any[]) =>
    request<any>('/learn/quiz/evaluate', {
      method: 'POST',
      body: JSON.stringify({ lessonId, questions, userAnswers }),
    }),

  // Practice
  sendMessage: (scenario: string, messages: any[], coached: boolean, scenarioSetup?: string) => {
    const conversationHistory = messages.slice(0, -1);
    const message = messages.length > 0 ? messages[messages.length - 1].content : '';
    return request<any>('/practice/chat', {
      method: 'POST',
      body: JSON.stringify({ scenario, message, conversationHistory, coached, customSetup: scenarioSetup }),
    });
  },
  getDebrief: (scenario: string, messages: any[]) =>
    request<any>('/practice/debrief', {
      method: 'POST',
      body: JSON.stringify({ scenario, conversationHistory: messages }),
    }),

  // Audio and scripts
  listScripts: () => request<any>('/audio/scripts'),
  listVoices: () => request<any>('/audio/voices'),
  saveScript: (script: { title: string; duration: string; estimatedMinutes: number; script: string }) =>
    request<any>('/audio/scripts', { method: 'POST', body: JSON.stringify(script) }),
  audioGenerateStart: (scriptId: string, musicTrack?: string, musicVolume?: number, voiceId?: string) =>
    request<{ jobId: string; status: 'queued' | 'running' | 'complete' | 'failed' }>(
      `/audio/generate-audio/${scriptId}`,
      {
        method: 'POST',
        body: JSON.stringify({ musicTrack, musicVolume, voiceId }),
      },
    ),
  audioGenerateStatus: (jobId: string) =>
    request<{
      jobId: string;
      status: 'queued' | 'running' | 'complete' | 'failed';
      result?: any;
      error?: string;
    }>(`/audio/audio-status/${encodeURIComponent(jobId)}`),
  audioGetActiveJob: (scriptId: string) =>
    request<{ jobId: string | null; status?: 'queued' | 'running' }>(
      `/audio/audio-active/${encodeURIComponent(scriptId)}`,
    ),
  listMusic: () => request<any>('/audio/music'),
  deleteScript: (scriptId: string) =>
    request<any>(`/audio/scripts/${scriptId}`, { method: 'DELETE' }),
  getAudioUrl: (filename: string) => `${BASE}/audio/audio/${filename}`,

  // Identity and values
  getIdentity: () => request<any>('/identity'),
  getValueEvidence: (valueName: string) =>
    request<any>(`/identity/values/${encodeURIComponent(valueName)}/evidence`),

  // Reference
  getReference: () => request<any>('/learn/reference'),

  // Gamification
  getXp: () => request<any>('/gamification/xp'),
  getXpHistory: (limit = 20) => request<any>(`/gamification/xp/history?limit=${limit}`),
  getMysteryBoxes: (limit = 20) => request<any>(`/gamification/mystery-boxes?limit=${limit}`),
  getUnopenedBoxes: () => request<any>('/gamification/mystery-boxes/unopened'),
  openMysteryBox: (boxId: string) =>
    request<any>(`/gamification/mystery-boxes/${boxId}/open`, { method: 'POST' }),
  getAchievements: () => request<any>('/gamification/achievements'),
  getGamificationSummary: () => request<any>('/gamification/summary'),
};
