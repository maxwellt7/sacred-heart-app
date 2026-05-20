import express from 'express';
import crypto from 'crypto';
import {
  handleQuizLead,
  handleSignup,
  handleSubscription,
  handleChurn,
  updateEngagement,
  isConfigured,
} from '../services/ghl.js';
import { registerTrialSignup, triggerWinBack } from '../services/emailScheduler.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// ── POST /api/ghl/quiz-lead — Push quiz lead to GHL ──
// Admin-only: the public quiz funnel uses /api/quiz/lead instead.
router.post('/quiz-lead', requireAdmin, async (req, res) => {
  try {
    const { email, name, score, tier, answers } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const contact = await handleQuizLead({ email, name, score, tier, answers });
    res.json({ success: true, contactId: contact?.id || null });
  } catch (err) {
    console.error('[GHL Route] quiz-lead error:', err.message);
    res.status(500).json({ error: 'Failed to process quiz lead' });
  }
});

// ── POST /api/ghl/signup — Push signup to GHL ──
// Signed-in user only (called by SignupTracker on first dashboard load).
router.post('/signup', requireAuth, async (req, res) => {
  try {
    const { email, clerkUserId, name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const contact = await handleSignup({ email, clerkUserId, name });
    res.json({ success: true, contactId: contact?.id || null });
  } catch (err) {
    console.error('[GHL Route] signup error:', err.message);
    res.status(500).json({ error: 'Failed to process signup' });
  }
});

// ── POST /api/ghl/subscription — Push subscription to GHL ──
router.post('/subscription', requireAdmin, async (req, res) => {
  try {
    const { email, plan, amount } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const contact = await handleSubscription({ email, plan, amount });
    res.json({ success: true, contactId: contact?.id || null });
  } catch (err) {
    console.error('[GHL Route] subscription error:', err.message);
    res.status(500).json({ error: 'Failed to process subscription' });
  }
});

// ── POST /api/ghl/churn — Push churn to GHL ──
router.post('/churn', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const contact = await handleChurn({ email });
    res.json({ success: true, contactId: contact?.id || null });
  } catch (err) {
    console.error('[GHL Route] churn error:', err.message);
    res.status(500).json({ error: 'Failed to process churn' });
  }
});

// ── POST /api/ghl/engagement — Update engagement metrics ──
router.post('/engagement', requireAdmin, async (req, res) => {
  try {
    const { email, sessionsCompleted, lastActiveDate } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    await updateEngagement({ email, sessionsCompleted, lastActiveDate });
    res.json({ success: true });
  } catch (err) {
    console.error('[GHL Route] engagement error:', err.message);
    res.status(500).json({ error: 'Failed to update engagement' });
  }
});

// ── GET /api/ghl/status — Check GHL integration status ──
router.get('/status', requireAdmin, (req, res) => {
  res.json({
    configured: isConfigured(),
    locationId: process.env.GHL_LOCATION_ID || '5aJWX4BRf7medN5RImNo',
  });
});

// ── POST /api/ghl/webhook — Receive GHL stage-change notifications ────────────
// Configure this URL in GHL → Settings → Webhooks.
// Listens for OpportunityStageUpdate events and triggers email sequences:
//   signed_up stage  → register for free_trial nurture sequence
//   churned stage    → trigger win_back sequence
//
// Optional: set GHL_WEBHOOK_SECRET env var to verify HMAC-SHA256 signatures.

const SIGNED_UP_STAGE_ID = process.env.GHL_STAGE_SIGNED_UP || '5f36d393-1641-47f0-9936-2b042a158878';
const CHURNED_STAGE_ID   = process.env.GHL_STAGE_CHURNED   || 'ed85b2f0-a1bd-4eba-897e-b10ba0d60136';

router.post('/webhook', (req, res) => {
  // Verify signature if secret is configured
  const webhookSecret = process.env.GHL_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers['x-ghl-signature'] || req.headers['x-wh-signature'] || '';
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  }

  try {
    const { type, opportunity, contact } = req.body || {};

    // Only handle opportunity stage-change events
    const isStageUpdate =
      type === 'OpportunityStageUpdate' ||
      type === 'opportunity.stageUpdate' ||
      type === 'opportunity_stage_update';

    if (!isStageUpdate) {
      return res.json({ ok: true, skipped: true, type });
    }

    const stageId = opportunity?.pipelineStageId;
    const email   = contact?.email;

    if (!stageId || !email) {
      console.warn('[GHL Webhook] Missing stageId or email in payload');
      return res.status(400).json({ error: 'Missing stageId or email in payload' });
    }

    const name = contact?.firstName
      ? `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ''}`
      : null;

    if (stageId === SIGNED_UP_STAGE_ID) {
      registerTrialSignup({ email, name });
      console.log(`[GHL Webhook] Signed up → registered trial nurture: ${email}`);
    } else if (stageId === CHURNED_STAGE_ID) {
      triggerWinBack({ email, name });
      console.log(`[GHL Webhook] Churned → triggered win-back: ${email}`);
    } else {
      console.log(`[GHL Webhook] Unhandled stage ${stageId} for ${email} — no action`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[GHL Webhook] error:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
