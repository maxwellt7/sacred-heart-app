import express from 'express';
import crypto from 'crypto';

const router = express.Router();

// Meta CAPI config
const PIXEL_ID = '2035820893688270';
const CAPI_TOKEN = process.env.META_CAPI_TOKEN || '';
const CAPI_URL = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`;

// ── In-memory lead storage (persists in SQLite below) ──

import db from '../db/index.js';
import { handleQuizLead } from '../services/ghl.js';

// Ensure quiz_leads table exists
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS quiz_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      name TEXT,
      score INTEGER,
      tier TEXT,
      answers TEXT,
      source_url TEXT,
      user_agent TEXT,
      fbp TEXT,
      fbc TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      user_id TEXT,
      email TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
} catch (err) {
  console.error('Failed to create quiz_leads table:', err.message);
}

// ── POST /api/quiz/lead — Store quiz lead + fire CAPI Lead event ──
router.post('/lead', async (req, res) => {
  try {
    const { email, name, score, tier, answers, sourceUrl, userAgent, fbp, fbc } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Store in database
    db.prepare(`
      INSERT INTO quiz_leads (email, name, score, tier, answers, source_url, user_agent, fbp, fbc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      email,
      name || null,
      score || null,
      tier || null,
      answers ? JSON.stringify(answers) : null,
      sourceUrl || null,
      userAgent || null,
      fbp || null,
      fbc || null
    );

    // Fire CAPI Lead event
    await sendCapiEvent('Lead', {
      email,
      sourceUrl,
      userAgent,
      fbp,
      fbc,
      customData: {
        content_name: 'Alignment Assessment Email',
        content_category: 'quiz_funnel',
        value: 0,
        currency: 'USD',
      },
    });

    // Push to GoHighLevel CRM (async, don't block response)
    handleQuizLead({ email, name, score, tier, answers }).catch(err => {
      console.error('[GHL] Quiz lead push failed:', err.message);
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Quiz lead error:', err.message);
    res.status(500).json({ error: 'Failed to save lead' });
  }
});

// ── POST /api/quiz/event — Fire arbitrary CAPI events ──
router.post('/event', async (req, res) => {
  try {
    const { eventName, email, score, tier, step, sourceUrl, userAgent, fbp, fbc } = req.body;

    if (!eventName) {
      return res.status(400).json({ error: 'eventName is required' });
    }

    // Map custom event names to standard Meta events where applicable
    const eventMap = {
      'ViewContent': 'ViewContent',
      'Lead': 'Lead',
      'Subscribe': 'Subscribe',
      'StartTrial': 'StartTrial',
      'AddToCart': 'AddToCart',
      'Purchase': 'Purchase',
      'AddPaymentInfo': 'AddPaymentInfo',
      'QuizStart': 'ViewContent',
      'QuizComplete': 'ViewContent',
      'QuizProgress': 'ViewContent',
    };

    const mappedEvent = eventMap[eventName] || eventName;

    const customData = {
      content_name: 'Alignment Assessment',
      content_category: 'quiz_funnel',
    };

    if (score !== undefined) customData.score = score;
    if (tier) customData.tier = tier;
    if (step !== undefined) customData.step = step;

    db.prepare(`
      INSERT INTO analytics_events (event_type, email, metadata)
      VALUES (?, ?, ?)
    `).run(
      eventName,
      email || null,
      JSON.stringify({
        score,
        tier,
        step,
        sourceUrl: sourceUrl || null,
      })
    );

    await sendCapiEvent(mappedEvent, {
      email,
      sourceUrl,
      userAgent,
      fbp,
      fbc,
      customData,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Quiz event error:', err.message);
    res.status(500).json({ error: 'Failed to send event' });
  }
});

// ── GET /api/quiz/leads — List leads (for admin) ──
router.get('/leads', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const leads = db.prepare(
      'SELECT * FROM quiz_leads ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM quiz_leads').get();
    res.json({ leads, total: total.count });
  } catch (err) {
    console.error('Quiz leads list error:', err.message);
    res.status(500).json({ error: 'Failed to list leads' });
  }
});

// ── Meta Conversions API Helper ──

async function sendCapiEvent(eventName, { email, sourceUrl, userAgent, fbp, fbc, customData }) {
  if (!CAPI_TOKEN || CAPI_TOKEN === 'YOUR_CAPI_TOKEN') {
    console.log(`[CAPI] Skipping ${eventName} — no token configured`);
    return;
  }

  try {
    const eventData = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: sourceUrl || 'https://heart.sovereignty.app/quiz',
      action_source: 'website',
      user_data: {},
    };

    // Hash PII for Meta (SHA-256, lowercase, trimmed)
    if (email) {
      eventData.user_data.em = [hashForMeta(email.toLowerCase().trim())];
    }

    // Browser identifiers
    if (fbp) eventData.user_data.fbp = fbp;
    if (fbc) eventData.user_data.fbc = fbc;
    if (userAgent) eventData.user_data.client_user_agent = userAgent;

    // Custom data
    if (customData) {
      eventData.custom_data = customData;
    }

    const response = await fetch(CAPI_URL + `?access_token=${CAPI_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [eventData],
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error(`[CAPI] ${eventName} failed:`, result);
    } else {
      console.log(`[CAPI] ${eventName} sent successfully`);
    }
  } catch (err) {
    console.error(`[CAPI] ${eventName} error:`, err.message);
  }
}

function hashForMeta(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export default router;
