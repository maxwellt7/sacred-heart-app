// Admin-only Dropbox → Pinecone sync trigger.
//
// The scheduler polls every KB_SYNC_INTERVAL_MINUTES (5 by default), so new
// files appear in the chat's RAG context within a few minutes. This route
// is for "I just added a file and don't want to wait" — admins can hit it
// to force an immediate sync and see the result.

import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { runSyncOnce } from '../services/dropbox-sync.js';

// Exposed as a factory so the test can inject a fake `runSync` and verify
// the response shaping without touching Dropbox / Pinecone for real.
export function syncKbHandler({ runSync }) {
  return async function handler(_req, res) {
    try {
      const summary = await runSync();
      if (summary && summary.skipped) {
        return res.status(503).json({
          ok: false,
          skipped: summary.skipped,
        });
      }
      return res.status(200).json({ ok: true, summary });
    } catch (err) {
      console.error('[admin/sync-kb] failed:', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  };
}

const router = Router();

// POST /api/admin/sync-kb — force an immediate Dropbox → Pinecone sync.
router.post('/sync-kb', requireAdmin, syncKbHandler({ runSync: runSyncOnce }));

export default router;
