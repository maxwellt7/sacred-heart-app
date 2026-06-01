import test from 'node:test';
import assert from 'node:assert/strict';

test('buildRuntimeHealthPayload reports commit, auth state, and OpenAI fallback readiness', async () => {
  const mod = await import('./runtime-health.js');

  assert.equal(typeof mod.buildRuntimeHealthPayload, 'function');

  const payload = mod.buildRuntimeHealthPayload({
    clerkEnabled: true,
    env: {
      RAILWAY_GIT_COMMIT_SHA: '0df6bba16f8a6716afcf2a263e1f33e5af284636',
      OPENAI_API_KEY: 'sk-test-123',
      OPENAI_FALLBACK_MODEL: 'gpt-4.1-mini',
    },
  });

  assert.deepEqual(payload, {
    status: 'ok',
    auth: true,
    runtime: {
      commit: '0df6bba16f8a6716afcf2a263e1f33e5af284636',
      openAiConfigured: true,
      openAiFallbackModel: 'gpt-4.1-mini',
      geminiConfigured: false,
      geminiFallbackModel: 'gemini-2.5-flash',
      pineconeEnabled: false,
      pineconeIndex: null,
      dropboxConfigured: false,
      dropboxAuthMode: 'unconfigured',
      dropboxFolder: null,
    },
  });
});

test('buildRuntimeHealthPayload reports Gemini fallback readiness when GEMINI_API_KEY is set', async () => {
  const mod = await import('./runtime-health.js');

  const payload = mod.buildRuntimeHealthPayload({
    clerkEnabled: true,
    env: {
      GEMINI_API_KEY: 'AIzaSy-test-key',
      GEMINI_MODEL: 'gemini-2.5-flash',
    },
  });

  assert.equal(payload.runtime.geminiConfigured, true);
  assert.equal(payload.runtime.geminiFallbackModel, 'gemini-2.5-flash');
});

test('buildRuntimeHealthPayload reports Dropbox configured (refresh-token flow) and surfaces the watched folder', async () => {
  const mod = await import('./runtime-health.js');

  const payload = mod.buildRuntimeHealthPayload({
    clerkEnabled: true,
    env: {
      DROPBOX_REFRESH_TOKEN: 'rt-xxx',
      DROPBOX_APP_KEY: 'ak-xxx',
      DROPBOX_APP_SECRET: 'as-xxx',
      DROPBOX_KNOWLEDGE_FOLDER: '/01. Professional/AI Tools/Sacred Heart/wlu coaching',
    },
  });

  assert.equal(payload.runtime.dropboxConfigured, true);
  assert.equal(payload.runtime.dropboxAuthMode, 'refresh_token');
  assert.equal(
    payload.runtime.dropboxFolder,
    '/01. Professional/AI Tools/Sacred Heart/wlu coaching'
  );
});

test('buildRuntimeHealthPayload omits false confidence when commit or OpenAI key are missing', async () => {
  const mod = await import('./runtime-health.js');

  const payload = mod.buildRuntimeHealthPayload({
    clerkEnabled: false,
    env: {},
  });

  assert.deepEqual(payload, {
    status: 'ok',
    auth: false,
    runtime: {
      commit: null,
      openAiConfigured: false,
      openAiFallbackModel: 'gpt-4.1-mini',
      geminiConfigured: false,
      geminiFallbackModel: 'gemini-2.5-flash',
      pineconeEnabled: false,
      pineconeIndex: null,
      dropboxConfigured: false,
      dropboxAuthMode: 'unconfigured',
      dropboxFolder: null,
    },
  });
});
