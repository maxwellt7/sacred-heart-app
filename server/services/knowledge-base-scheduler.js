// Periodic Dropbox → Pinecone sync.
//
// Polls every KB_SYNC_INTERVAL_MINUTES (default 5). Skips silently if
// Dropbox or Pinecone aren't configured, so a partially-set-up environment
// doesn't crash the boot.

import cron from 'node-cron';
import { isConfigured as dropboxConfigured, runSyncOnce } from './dropbox-sync.js';
import { isEnabled as kbEnabled } from './knowledge-base.js';

// Tightened from 30 → 5 min so files appear in the index quickly after
// upload. Well under any Dropbox / Pinecone free-tier rate limit.
export const DEFAULT_INTERVAL_MIN = 5;

export function intervalToCron(minutes) {
  const m = Math.max(5, Math.min(720, Number(minutes) || DEFAULT_INTERVAL_MIN));
  // Run at the top of every Nth minute, chosen so the schedule actually
  // ticks rather than waiting on a divisible boundary that may not exist.
  if (m === 60) return '0 * * * *';
  if (m % 60 === 0) return `0 */${m / 60} * * *`;
  return `*/${m} * * * *`;
}

let started = false;

export function initKnowledgeBaseScheduler() {
  if (started) return;
  if (!dropboxConfigured() || !kbEnabled()) {
    console.log('[KB Scheduler] disabled — Dropbox or Pinecone not configured');
    return;
  }

  // Surface the active Dropbox folder at boot so operators can confirm in
  // logs (Vercel / Railway) that the right path is being watched. An empty
  // value means "walk all of Dropbox", which is worth flagging explicitly.
  const folder = process.env.DROPBOX_KNOWLEDGE_FOLDER;
  const folderLabel = folder === '' ? '<root of Dropbox>' : (folder || '<unset>');
  console.log(`[KB Scheduler] watching folder=${JSON.stringify(folderLabel)}`);

  const expr = intervalToCron(process.env.KB_SYNC_INTERVAL_MINUTES);
  console.log(`[KB Scheduler] cron registered: ${expr}`);

  cron.schedule(expr, async () => {
    try {
      const summary = await runSyncOnce();
      console.log('[KB Scheduler] tick complete:', JSON.stringify(summary));
    } catch (err) {
      console.error('[KB Scheduler] tick failed:', err.message);
    }
  });

  // Also run once on startup so the index reflects current state.
  setImmediate(async () => {
    try {
      const summary = await runSyncOnce();
      console.log('[KB Scheduler] startup sync:', JSON.stringify(summary));
    } catch (err) {
      console.error('[KB Scheduler] startup sync failed:', err.message);
    }
  });

  started = true;
}
