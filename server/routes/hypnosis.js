import { Router } from 'express';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import anthropic from '../config/anthropic.js';
import { getProfileForPrompt, updateProfile, updateStreak, resolveUserTimezone } from '../services/profile.js';
import {
  buildMemoryContext,
  createConversationSession,
  createSession,
  getSessionForUser,
  getTodaySession,
  isSessionLocked,
  markHypnosisGenerated,
  updateSessionMessages,
  updateSessionMetadata,
} from '../services/memory.js';
import { processValueDetections, processIdentityStatements, buildIdentityContext } from '../services/identity.js';
import { onSessionComplete, updateStreakMultiplier } from '../services/gamification.js';
import { generateChunkedScript } from '../services/hypnosis-script-generator.js';
import {
  createJob,
  setJobRunning,
  setJobComplete,
  setJobFailed,
  getJob,
  getActiveJobForSession,
} from '../services/hypnosis-jobs.js';
import {
  retrieveByCategory,
  formatRetrievedForPrompt,
  isEnabled as kbEnabled,
  CATEGORY_NLP,
  CATEGORY_COACHING,
} from '../services/knowledge-base.js';
import { saveScriptForUser } from '../services/scripts.js';
import {
  extractReplyField,
  extractReadyFlag,
  looksLikeRawJson,
  recoverChatReply,
  sanitizeAssistantContent,
  sanitizeMessageHistory,
} from '../services/message-sanitizer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const promptsDir = join(dataDir, 'prompts');

const router = Router();

function resolveRequestTimezone(req) {
  return resolveUserTimezone(req.userId, req.get('X-User-Timezone'));
}

// Cache for NLP content
let nlpContentCache = null;
function loadNlpContent() {
  if (nlpContentCache) return nlpContentCache;
  const files = readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== 'modules.json' && f !== 'coaching-frameworks.json');
  const allContent = {};
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'));
      allContent[file.replace('.json', '')] = data;
    } catch (err) {
      console.warn(`Skipping data file ${file}: ${err.message}`);
    }
  }
  nlpContentCache = allContent;
  return allContent;
}

// Load coaching frameworks
let coachingCache = null;
function loadCoachingFrameworks() {
  if (coachingCache) return coachingCache;
  try {
    coachingCache = JSON.parse(readFileSync(join(dataDir, 'coaching-frameworks.json'), 'utf-8'));
  } catch (err) {
    console.warn('Could not load coaching frameworks:', err.message);
    coachingCache = {};
  }
  return coachingCache;
}

// Build the full system prompt with all context injected.
// `retrievalQuery` (optional) drives the user-knowledge-base RAG step — pass
// the last user message (or a short summary) when you want chunks pulled
// from Pinecone. Pass falsy to skip retrieval entirely (init / pre-conversation).
async function buildSystemPrompt(userId, phase, retrievalQuery = '') {
  const template = readFileSync(join(promptsDir, 'daily-coach.txt'), 'utf-8');
  const nlpContent = loadNlpContent();
  const coachingFrameworks = loadCoachingFrameworks();
  const profile = getProfileForPrompt(userId);
  const memoryContext = buildMemoryContext(userId);

  const identityContext = buildIdentityContext(userId);

  // Phase-aware retrieval. During GENERATION the script needs heavier NLP
  // technique density (induction structure, Milton patterns, embedded commands)
  // so we pull more NLP chunks than coaching ones. During COACHING the
  // conversational reply leans on Max's voice from transcripts.
  let nlpBlock = '(no NLP excerpts retrieved for this query)';
  let coachingBlock = '(no coaching transcripts retrieved for this query)';
  if (kbEnabled() && retrievalQuery && retrievalQuery.trim()) {
    try {
      const isGenerationPhase = phase === 'generation';
      const grouped = await retrieveByCategory(retrievalQuery, {
        categories: [CATEGORY_NLP, CATEGORY_COACHING],
        topKPerCategory: isGenerationPhase ? 6 : 3,
      });
      const nlp = grouped[CATEGORY_NLP] || [];
      const coaching = grouped[CATEGORY_COACHING] || [];
      // For coaching phase, flip the bias: more transcript voice, less technique.
      const trimmedNlp = isGenerationPhase ? nlp : nlp.slice(0, 2);
      const trimmedCoaching = isGenerationPhase ? coaching.slice(0, 3) : coaching;
      const formattedNlp = formatRetrievedForPrompt(trimmedNlp);
      const formattedCoaching = formatRetrievedForPrompt(trimmedCoaching);
      if (formattedNlp) nlpBlock = formattedNlp;
      if (formattedCoaching) coachingBlock = formattedCoaching;
    } catch (err) {
      console.warn('[hypnosis] RAG retrieval failed; continuing without it:', err.message);
    }
  }

  let prompt = template
    .replace('{{NLP_CONTENT}}', JSON.stringify(nlpContent, null, 2))
    .replace('{{COACHING_FRAMEWORKS}}', JSON.stringify(coachingFrameworks, null, 2))
    .replace('{{USER_PROFILE}}', profile ? JSON.stringify(profile, null, 2) : 'No profile data yet — this is a new user.')
    .replace('{{MEMORY_CONTEXT}}', memoryContext)
    .replace('{{IDENTITY_CONTEXT}}', identityContext)
    .replace('{{NLP_RETRIEVED}}', nlpBlock)
    .replace('{{COACHING_RETRIEVED}}', coachingBlock);

  if (phase === 'coaching') {
    prompt += '\n\nYou are in COACHING phase. Conduct the daily coaching conversation. Ask ONE question at a time. Respond in the COACHING JSON format.';
  } else if (phase === 'generation') {
    prompt += '\n\nYou are in GENERATION phase. Based on the coaching conversation, generate the complete personalized hypnosis script. Respond in the GENERATION JSON format.';
  }

  return prompt;
}

function lastUserMessageContent(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role === 'user' && typeof m.content === 'string' && m.content.trim()) {
      return m.content;
    }
  }
  return '';
}

function parseJsonResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1].trim());
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) return JSON.parse(objMatch[0]);
    throw new Error('Could not parse JSON from AI response');
  }
}

function tryParseChatJson(text) {
  try {
    return parseJsonResponse(text);
  } catch {
    return null;
  }
}

const SLIM_CHAT_INSTRUCTION =
  '\n\nIMPORTANT: Your previous response was truncated. Respond again with ONLY the "reply", "readyToGenerate", and "profileUpdates" fields. OMIT "valueDetections" and "identityStatements" entirely so the response fits the token budget. Keep the reply concise.';

function parseStoredMessages(rawMessages) {
  if (!rawMessages) return null;
  try {
    const parsed = JSON.parse(typeof rawMessages === 'string' ? rawMessages : JSON.stringify(rawMessages));
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function deriveConversationTitle(messages = []) {
  const firstUserMessage = messages.find((message) => message.role === 'user' && String(message.content || '').trim());
  if (!firstUserMessage) return '';
  return String(firstUserMessage.content).trim().replace(/\s+/g, ' ').slice(0, 80);
}

// POST /init — generate the AI's opening message to start the session
router.post('/init', async (req, res) => {
  try {
    const userId = req.userId;
    const effectiveTimezone = resolveRequestTimezone(req);
    const {
      sessionId: requestedSessionId,
      sessionType = 'daily_hypnosis',
      forceNew = false,
      title = '',
    } = req.body || {};

    let session = requestedSessionId ? getSessionForUser(requestedSessionId, userId) : null;
    if (requestedSessionId && !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session && !forceNew && sessionType === 'daily_hypnosis') {
      session = getTodaySession(userId, effectiveTimezone);
    }

    if (session) {
      const resumeMessages = parseStoredMessages(session.chat_messages);
      if (resumeMessages) {
        return res.json({
          reply: null,
          sessionId: session.id,
          resumeMessages: sanitizeMessageHistory(resumeMessages),
          session,
          completed: isSessionLocked(session),
          sessionSummary: session.chat_summary || null,
        });
      }

      if (isSessionLocked(session)) {
        return res.json({
          reply: null,
          sessionId: session.id,
          resumeMessages: [],
          session,
          completed: true,
          sessionSummary: session.chat_summary || null,
        });
      }
    }

    if (!session) {
      session = sessionType === 'general_chat'
        ? createConversationSession(userId, {
            sessionType: 'general_chat',
            title: title || '',
          })
        : createSession(userId, null, effectiveTimezone);
    }

    // /init has no user query yet, so we skip RAG retrieval here.
    const systemPrompt = await buildSystemPrompt(userId, 'coaching');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt + '\n\nThis is the START of a new session. The user just opened the app. Generate your opening message — greet them naturally, reference any relevant context from past sessions, and ask your first coaching question. Do NOT wait for them to speak first. Respond in the COACHING JSON format.',
      messages: [
        { role: 'user', content: session.session_type === 'general_chat' ? '[SESSION_START] The user has opened a general coaching conversation.' : '[SESSION_START] The user has opened the app for their daily hypnosis session.' }
      ],
    });

    const text = response?.content?.[0]?.text || '';
    const parsed = tryParseChatJson(text);

    // Derive a chat-safe opening message. recoverChatReply prefers a clean
    // parsed reply, heals truncated JSON, and returns '' when only an
    // unusable blob remains — so we never persist raw JSON into the session
    // (the bug that left a locked session showing `{"reply": "Maxwell,`).
    const openingMessage = recoverChatReply(text, parsed?.reply);
    if (!openingMessage) {
      console.error('[hypnosis/init] Unrecoverable opening response, len=%d, stop_reason=%s', text.length, response?.stop_reason);
      return res.status(502).json({
        error: 'I had trouble starting your session. Please try again.',
      });
    }

    updateSessionMessages(session.id, [
      { role: 'assistant', content: openingMessage }
    ]);

    res.json({
      reply: openingMessage,
      sessionId: session.id,
      resumeMessages: null,
      session: getSessionForUser(session.id, userId),
    });
  } catch (error) {
    console.error('Hypnosis init error:', error.message);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// POST /chat — daily coaching conversation
router.post('/chat', async (req, res) => {
  try {
    const {
      messages,
      sessionId,
      moodBefore,
      sessionType = 'daily_hypnosis',
      title = '',
    } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const userId = req.userId;
    const effectiveTimezone = resolveRequestTimezone(req);
    let session = sessionId ? getSessionForUser(sessionId, userId) : null;

    if (sessionId && !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session) {
      session = sessionType === 'general_chat'
        ? createConversationSession(userId, {
            sessionType: 'general_chat',
            title: title || deriveConversationTitle(messages),
            moodBefore: moodBefore || null,
          })
        : (getTodaySession(userId, effectiveTimezone) || createSession(userId, moodBefore || null, effectiveTimezone));
    }

    if (isSessionLocked(session)) {
      return res.status(409).json({ error: 'This session is locked and can no longer be updated.' });
    }

    const currentSessionId = session.id;

    if (messages.length > 50) {
      return res.status(400).json({ error: 'Conversation too long. Please start a new session.' });
    }

    // RAG: use the last user message as the retrieval query so the model
    // sees chunks relevant to what the user just said.
    const systemPrompt = await buildSystemPrompt(userId, 'coaching', lastUserMessageContent(messages));

    const apiMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role,
        content: m.role === 'assistant'
          ? sanitizeAssistantContent(String(m.content))
          : String(m.content),
      }));

    if (apiMessages.length === 0) {
      return res.status(400).json({ error: 'No valid messages provided' });
    }

    const baseChatRequest = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: apiMessages,
    };

    let response = await anthropic.messages.create(baseChatRequest);
    let text = response?.content?.[0]?.text || '';
    let parsed = tryParseChatJson(text);

    // Self-heal: if the model returned unparseable JSON (typically because it
    // ran out of tokens emitting valueDetections / identityStatements), retry
    // once with an instruction to drop the heavy fields so the reply still
    // lands. We accept losing this turn's value detection in exchange for a
    // working coaching flow.
    if (!parsed) {
      console.warn('[hypnosis/chat] First response unparseable (stop_reason=%s); retrying in slim mode', response?.stop_reason);
      response = await anthropic.messages.create({
        ...baseChatRequest,
        system: systemPrompt + SLIM_CHAT_INSTRUCTION,
      });
      text = response?.content?.[0]?.text || '';
      parsed = tryParseChatJson(text);
    }

    // Last-resort recovery: if both calls failed but the leading "reply"
    // field is still extractable, use it. Better than dumping JSON into
    // the chat.
    if (!parsed) {
      const recoveredReply = extractReplyField(text);
      if (recoveredReply && !looksLikeRawJson(recoveredReply)) {
        parsed = {
          reply: recoveredReply,
          readyToGenerate: extractReadyFlag(text),
          profileUpdates: {},
        };
      }
    }

    // Nothing we can salvage — surface a graceful error and DO NOT persist
    // a broken assistant turn into the session history.
    if (!parsed || !parsed.reply || looksLikeRawJson(parsed.reply)) {
      console.error('[hypnosis/chat] Unrecoverable model response, len=%d, stop_reason=%s', text.length, response?.stop_reason);
      return res.status(502).json({
        error: 'I had trouble responding to that. Please try sending your message again.',
      });
    }

    // Save messages to session
    updateSessionMessages(currentSessionId, messages.concat([
      { role: 'assistant', content: parsed.reply }
    ]));

    updateSessionMetadata(currentSessionId, {
      session_status: parsed.readyToGenerate === true ? 'ready_for_hypnosis' : 'active',
    });

    if (session.session_type === 'general_chat' && !(session.title || '').trim()) {
      const derivedTitle = title || deriveConversationTitle(messages);
      if (derivedTitle) {
        updateSessionMetadata(currentSessionId, { title: derivedTitle });
      }
    }

    // Apply profile updates if detected
    if (parsed.profileUpdates) {
      const pu = parsed.profileUpdates;
      const profileUpdate = {};

      if (pu.detected_map) {
        updateSessionMetadata(currentSessionId, { detected_map: pu.detected_map });
      }
      if (pu.detected_state) {
        updateSessionMetadata(currentSessionId, { detected_state: pu.detected_state });
      }
      if (pu.key_themes && pu.key_themes.length > 0) {
        updateSessionMetadata(currentSessionId, { key_themes: pu.key_themes });
      }

      // Update meta-programs if detected
      if (pu.meta_programs) {
        const currentProfile = getProfileForPrompt(userId);
        const currentMeta = currentProfile?.meta_programs || {};
        const newMeta = { ...currentMeta };
        for (const [key, value] of Object.entries(pu.meta_programs)) {
          if (value && value !== null) {
            newMeta[key] = value;
          }
        }
        profileUpdate.meta_programs = newMeta;
      }

      // Update capacity index based on detected state
      if (pu.detected_state) {
        const currentProfile = getProfileForPrompt(userId);
        const cap = currentProfile?.capacity_index || { suppression: 5, discharge: 5, capacity: 5 };
        if (pu.detected_state === 'suppression') { cap.suppression = Math.min(10, cap.suppression + 0.5); cap.capacity = Math.max(0, cap.capacity - 0.3); }
        if (pu.detected_state === 'discharge') { cap.discharge = Math.min(10, cap.discharge + 0.5); cap.capacity = Math.max(0, cap.capacity - 0.3); }
        if (pu.detected_state === 'capacity') { cap.capacity = Math.min(10, cap.capacity + 0.5); cap.suppression = Math.max(0, cap.suppression - 0.2); cap.discharge = Math.max(0, cap.discharge - 0.2); }
        profileUpdate.capacity_index = cap;
      }

      // Update force audit
      if (pu.force_pattern) {
        const currentProfile = getProfileForPrompt(userId);
        const force = currentProfile?.force_audit || { overt: 0, subtle: 5, clean: 5 };
        if (pu.force_pattern === 'subtle') { force.subtle = Math.min(10, force.subtle + 0.5); force.clean = Math.max(0, force.clean - 0.3); }
        if (pu.force_pattern === 'clean') { force.clean = Math.min(10, force.clean + 0.5); force.subtle = Math.max(0, force.subtle - 0.2); }
        profileUpdate.force_audit = force;
      }

      // Update victim/healer
      if (pu.victim_healer) {
        const currentProfile = getProfileForPrompt(userId);
        const vh = currentProfile?.victim_healer || { score: 0, trending: 'stable' };
        if (pu.victim_healer === 'victim') { vh.score = Math.max(-5, vh.score - 0.5); vh.trending = 'declining'; }
        if (pu.victim_healer === 'healer') { vh.score = Math.min(5, vh.score + 0.5); vh.trending = 'improving'; }
        if (pu.victim_healer === 'mixed') { vh.trending = 'stable'; }
        profileUpdate.victim_healer = vh;
      }

      if (Object.keys(profileUpdate).length > 0) {
        updateProfile(userId, profileUpdate);
      }
    }

    // Process identity data
    if (parsed.valueDetections) {
      try {
        processValueDetections(userId, currentSessionId, parsed.valueDetections);
      } catch (err) {
        console.warn('Value detection processing error:', err.message);
      }
    }
    if (parsed.identityStatements) {
      try {
        processIdentityStatements(userId, currentSessionId, parsed.identityStatements);
      } catch (err) {
        console.warn('Identity statement processing error:', err.message);
      }
    }

    res.json({
      reply: parsed.reply,
      readyToGenerate: parsed.readyToGenerate === true,
      sessionId: currentSessionId,
      profileUpdates: parsed.profileUpdates || {},
      session: getSessionForUser(currentSessionId, userId),
    });
  } catch (error) {
    console.error('Hypnosis chat error:', error.message);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// POST /generate — kicks off chunked hypnosis generation as a background job.
// The 4-call chunked pipeline takes 60-90s, long enough that mobile
// backgrounding / network blips kill synchronous HTTP. We return a jobId
// immediately and the frontend polls /generate-status/:jobId.
router.post('/generate', async (req, res) => {
  try {
    const { messages, sessionId } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    if (messages.length > 50) {
      return res.status(400).json({ error: 'Conversation too long.' });
    }

    const userId = req.userId;
    const effectiveTimezone = resolveRequestTimezone(req);
    const currentSession = sessionId ? getSessionForUser(sessionId, userId) : getTodaySession(userId, effectiveTimezone);
    if (!currentSession) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (isSessionLocked(currentSession) && currentSession.session_type === 'daily_hypnosis') {
      return res.status(409).json({ error: 'This daily hypnosis session is already locked.' });
    }

    // If a job is already in flight for this session, return its id instead of
    // double-firing the LLM (saves money + avoids racing writes).
    const existing = getActiveJobForSession(userId, currentSession.id);
    if (existing) {
      return res.status(202).json({ jobId: existing.id, status: existing.status });
    }

    const apiMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: String(m.content) }));
    const messagesSnapshot = messages;

    // Build prompt up front (including RAG retrieval) so any prompt-build
    // failure surfaces before we mint a job. The retrieval query is the most
    // recent user message — the focal point of what the script needs to address.
    const systemPrompt = await buildSystemPrompt(userId, 'generation', lastUserMessageContent(messages));

    const job = createJob(userId, currentSession.id);
    res.status(202).json({ jobId: job.id, status: 'queued' });

    setImmediate(async () => {
      try {
        setJobRunning(job.id);
        const parsed = await generateChunkedScript({
          systemPrompt,
          apiMessages,
          llm: (payload) => anthropic.messages.create(payload),
          parseJson: parseJsonResponse,
        });

        updateSessionMetadata(currentSession.id, {
          chat_summary: parsed.sessionSummary || '',
          key_themes: parsed.keyThemes || [],
        });

        const hypnosisEvent = {
          role: 'system',
          eventType: 'hypnosis_generated',
          content: 'Hypnosis generated for this conversation.',
          generatedAt: new Date().toISOString(),
          sessionType: currentSession.session_type,
        };

        updateSessionMessages(currentSession.id, messagesSnapshot.concat([hypnosisEvent]));
        markHypnosisGenerated(currentSession.id);

        // Persist the stitched script server-side BEFORE marking the job
        // complete. This eliminates the client-side polling race that
        // previously caused multiple saves when the user backgrounded the
        // tab mid-generation. The frontend just consumes savedScript from
        // the job result.
        let savedScript = null;
        try {
          savedScript = saveScriptForUser({
            userId,
            title: parsed.title || 'Hypnosis Script',
            duration: 'full',
            estimatedMinutes: parsed.estimatedMinutes || 20,
            script: parsed.script,
          });
        } catch (saveErr) {
          console.error('[hypnosis/generate] failed to save script:', saveErr.message);
          throw saveErr;
        }

        let gamificationResults = null;
        if (currentSession.session_type === 'daily_hypnosis') {
          const streakResult = updateStreak(userId, effectiveTimezone);
          if (streakResult) {
            updateStreakMultiplier(userId, streakResult.current_streak);
          }
          try {
            gamificationResults = onSessionComplete(userId, currentSession.id, {
              vulnerabilityDetected: parsed.vulnerabilityDetected || false,
            });
          } catch (err) {
            console.warn('Gamification processing error:', err.message);
          }
        }

        setJobComplete(job.id, {
          title: parsed.title || 'Hypnosis Script',
          duration: 'full',
          estimatedMinutes: parsed.estimatedMinutes || 20,
          script: parsed.script,
          sessionSummary: parsed.sessionSummary || '',
          keyThemes: parsed.keyThemes || [],
          savedScript, // full record incl. id; client uses this directly
          gamification: gamificationResults,
          hypnosisEvent,
          session: getSessionForUser(currentSession.id, userId),
        });
      } catch (err) {
        console.error('[hypnosis/generate] job failed:', err.message);
        setJobFailed(job.id, err.message || 'Generation failed');
      }
    });
  } catch (error) {
    console.error('Hypnosis generate error:', error.message);
    res.status(500).json({ error: 'Failed to start generation' });
  }
});

// GET /generate-status/:jobId — poll endpoint for the chunked-generation job.
router.get('/generate-status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId, req.userId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({
    jobId: job.id,
    status: job.status,
    result: job.status === 'complete' ? job.result : undefined,
    error: job.status === 'failed' ? job.error : undefined,
  });
});

// GET /generate-active/:sessionId — frontend recovery: "is there an in-flight
// generation I should be polling?" Used after a refresh or reopen.
router.get('/generate-active/:sessionId', (req, res) => {
  const job = getActiveJobForSession(req.userId, req.params.sessionId);
  if (!job) return res.json({ jobId: null });
  res.json({ jobId: job.id, status: job.status });
});

export default router;
