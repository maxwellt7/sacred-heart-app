import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env'), quiet: true });

function hasUsableKey(value) {
  return Boolean(value && !value.includes('placeholder'));
}

function normalizeContentToString(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object') {
          if (typeof item.text === 'string') {
            return item.text;
          }

          if (item.type === 'text' && typeof item.text === 'string') {
            return item.text;
          }
        }

        return '';
      })
      .join('\n')
      .trim();
  }

  return String(content ?? '');
}

function normalizeOpenAiResponse(response) {
  const rawContent = response?.choices?.[0]?.message?.content;
  const text = normalizeContentToString(rawContent);

  return {
    content: [{ text }],
    usage: {
      input_tokens: response?.usage?.prompt_tokens ?? 0,
      output_tokens: response?.usage?.completion_tokens ?? 0,
    },
    provider: 'openai',
  };
}

function shouldFallbackToOpenAI(error) {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const message = String(
    error?.message ??
    error?.error?.message ??
    error?.cause?.message ??
    ''
  ).toLowerCase();

  if (status === 429) {
    return true;
  }

  return [
    'credit balance',
    'insufficient credit',
    'rate limit',
    'quota',
    'overloaded',
    'capacity',
    'api key',
  ].some((term) => message.includes(term));
}

function toOpenAiPayload(request, fallbackModel) {
  const messages = [];

  if (request.system) {
    messages.push({ role: 'system', content: normalizeContentToString(request.system) });
  }

  for (const message of request.messages ?? []) {
    if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system') {
      continue;
    }

    messages.push({
      role: message.role,
      content: normalizeContentToString(message.content),
    });
  }

  return {
    model: fallbackModel,
    max_tokens: request.max_tokens,
    messages,
    // All current callers ask Claude for JSON in their system prompts.
    // Force OpenAI to honor that contract — without this, gpt-4.1-mini
    // returns prose, JSON parse fails, and downstream flags like
    // readyToGenerate silently default to false.
    response_format: { type: 'json_object' },
  };
}

function toGeminiPayload(request) {
  const contents = [];

  for (const message of request.messages ?? []) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: normalizeContentToString(message.content) }],
    });
  }

  const payload = {
    contents,
    generationConfig: {
      maxOutputTokens: request.max_tokens,
      // Same JSON contract as the OpenAI fallback above.
      responseMimeType: 'application/json',
    },
  };

  if (request.system) {
    payload.systemInstruction = {
      parts: [{ text: normalizeContentToString(request.system) }],
    };
  }

  return payload;
}

function normalizeGeminiResponse(response) {
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('\n').trim();

  return {
    content: [{ text }],
    usage: {
      input_tokens: response?.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: response?.usageMetadata?.candidatesTokenCount ?? 0,
    },
    provider: 'gemini',
  };
}

class GeminiClient {
  constructor({ apiKey, model = 'gemini-2.5-flash' }) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateContent(payload) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const err = new Error(`Gemini API error ${response.status}: ${text.slice(0, 500)}`);
      err.status = response.status;
      throw err;
    }

    return await response.json();
  }
}

export function createMessagesApi({ anthropicClient, openAiClient, geminiClient, fallbackModel }) {
  const resolvedFallbackModel = fallbackModel || process.env.OPENAI_FALLBACK_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  const callOpenAi = async (request) => {
    const openAiResponse = await openAiClient.chat.completions.create(toOpenAiPayload(request, resolvedFallbackModel));
    return normalizeOpenAiResponse(openAiResponse);
  };

  const callGemini = async (request) => {
    const geminiResponse = await geminiClient.generateContent(toGeminiPayload(request));
    return normalizeGeminiResponse(geminiResponse);
  };

  // When every provider fails, throw a single error whose message names
  // each underlying failure. Without this, the route only sees the last
  // error in the chain (Gemini), which is misleading when the actual root
  // cause is Anthropic being out of credits.
  const composeAllProvidersError = (errors) => {
    const parts = errors
      .filter((e) => e && e.error)
      .map(({ name, error }) => `${name}: ${error.message || String(error)}`);
    const composed = new Error(`All LLM providers unavailable — ${parts.join(' | ')}`);
    composed.providerErrors = errors.filter((e) => e && e.error);
    return composed;
  };

  const tryGemini = async (request, priorErrors) => {
    if (!geminiClient) {
      throw composeAllProvidersError(priorErrors);
    }
    try {
      return await callGemini(request);
    } catch (geminiError) {
      throw composeAllProvidersError([
        ...priorErrors,
        { name: 'gemini', error: geminiError },
      ]);
    }
  };

  return {
    async create(request) {
      if (!anthropicClient) {
        if (!openAiClient && !geminiClient) {
          throw new Error('No LLM provider is configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.');
        }

        if (openAiClient) {
          try {
            return await callOpenAi(request);
          } catch (openAiError) {
            console.warn('[LLM] OpenAI failed, falling back to Gemini:', openAiError.message);
            return await tryGemini(request, [{ name: 'openai', error: openAiError }]);
          }
        }

        return await callGemini(request);
      }

      try {
        return await anthropicClient.messages.create(request);
      } catch (error) {
        if (!shouldFallbackToOpenAI(error) || (!openAiClient && !geminiClient)) {
          throw error;
        }

        if (openAiClient) {
          try {
            console.warn('[LLM] Anthropic unavailable, falling back to OpenAI:', error.message);
            return await callOpenAi(request);
          } catch (openAiError) {
            console.warn('[LLM] OpenAI also failed, falling back to Gemini:', openAiError.message);
            return await tryGemini(request, [
              { name: 'anthropic', error },
              { name: 'openai', error: openAiError },
            ]);
          }
        }

        console.warn('[LLM] Anthropic unavailable, falling back to Gemini:', error.message);
        return await tryGemini(request, [{ name: 'anthropic', error }]);
      }
    },
  };
}

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const openAiKey = process.env.OPENAI_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!hasUsableKey(anthropicKey)) {
  console.warn('WARNING: ANTHROPIC_API_KEY is not set or is a placeholder. Anthropic-backed chat will fall back to OpenAI/Gemini when configured.');
}

if (!hasUsableKey(openAiKey)) {
  console.warn('WARNING: OPENAI_API_KEY is not set or is a placeholder. OpenAI fallback is unavailable until a valid key is provided.');
}

if (!hasUsableKey(geminiKey)) {
  console.warn('WARNING: GEMINI_API_KEY is not set or is a placeholder. Gemini fallback is unavailable until a valid key is provided.');
}

const anthropicClient = hasUsableKey(anthropicKey)
  ? new Anthropic({ apiKey: anthropicKey })
  : null;

const openAiClient = hasUsableKey(openAiKey)
  ? new OpenAI({
      apiKey: openAiKey,
      baseURL: process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || undefined,
    })
  : null;

const geminiClient = hasUsableKey(geminiKey)
  ? new GeminiClient({
      apiKey: geminiKey,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    })
  : null;

const anthropic = {
  messages: createMessagesApi({
    anthropicClient,
    openAiClient,
    geminiClient,
    fallbackModel: process.env.OPENAI_FALLBACK_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  }),
};

export { normalizeOpenAiResponse, normalizeGeminiResponse, shouldFallbackToOpenAI, GeminiClient };
export default anthropic;
