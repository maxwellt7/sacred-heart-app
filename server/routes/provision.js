/**
 * Provision Access Route
 * 
 * Public API endpoint called by the funnel site (start.sovereignty.app)
 * after a successful Stripe payment. Provisions paid access for the user.
 * 
 * POST /api/provision-access
 * Authorization: Bearer <PROVISION_SECRET>
 * Body: { email, name, stripeSessionId, stripeCustomerId }
 */

import express from 'express';
import db from '../db/index.js';
import { ensureUser } from '../services/profile.js';
import { handleSubscription, upsertContact, addTags } from '../services/ghl.js';

const router = express.Router();

const PROVISION_SECRET = process.env.PROVISION_SECRET || '';

// Admin emails/domains that always have full access
const ADMIN_EMAILS = [
  'maxwellmayes@gmail.com',
  'maxwell@sovereignty.app',
  'max@maxwellmayes.com',
];
const ADMIN_DOMAINS = ['sovereignty.app', 'maxwellmayes.com'];

function isAdminEmail(email) {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  if (ADMIN_EMAILS.some(e => e.toLowerCase() === lower)) return true;
  const domain = lower.split('@')[1];
  if (domain && ADMIN_DOMAINS.some(d => d === domain)) return true;
  return false;
}

// Ensure paid_users table exists
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS paid_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      name TEXT,
      clerk_user_id TEXT,
      stripe_session_id TEXT,
      stripe_customer_id TEXT,
      paid_status TEXT DEFAULT 'active',
      amount INTEGER DEFAULT 7,
      plan TEXT DEFAULT 'alignment-engine-full-access',
      provisioned_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(email)
    );
  `);
  console.log('paid_users table ready');
} catch (err) {
  console.error('Failed to create paid_users table:', err.message);
}

/**
 * Verify the provisioning secret token
 */
function verifyProvisionAuth(req, res, next) {
  if (!PROVISION_SECRET) {
    console.error('[Provision] PROVISION_SECRET not configured — rejecting all requests');
    return res.status(503).json({ error: 'Provisioning not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  if (token !== PROVISION_SECRET) {
    return res.status(403).json({ error: 'Invalid provisioning token' });
  }

  next();
}

/**
 * POST /api/provision-access
 * Called by start.sovereignty.app after successful Stripe payment
 */
router.post('/', verifyProvisionAuth, async (req, res) => {
  try {
    const { email, name, stripeSessionId, stripeCustomerId } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log(`[Provision] Processing paid access for: ${email}`);

    // Check if already provisioned
    const existing = db.prepare('SELECT * FROM paid_users WHERE email = ?').get(email.toLowerCase().trim());

    if (existing) {
      // Update existing record
      db.prepare(`
        UPDATE paid_users 
        SET paid_status = 'active', 
            stripe_session_id = COALESCE(?, stripe_session_id),
            stripe_customer_id = COALESCE(?, stripe_customer_id),
            name = COALESCE(?, name),
            updated_at = datetime('now')
        WHERE email = ?
      `).run(
        stripeSessionId || null,
        stripeCustomerId || null,
        name || null,
        email.toLowerCase().trim()
      );

      console.log(`[Provision] Updated existing paid user: ${email}`);
    } else {
      // Create new paid user record
      db.prepare(`
        INSERT INTO paid_users (email, name, stripe_session_id, stripe_customer_id, paid_status)
        VALUES (?, ?, ?, ?, 'active')
      `).run(
        email.toLowerCase().trim(),
        name || null,
        stripeSessionId || null,
        stripeCustomerId || null
      );

      console.log(`[Provision] Created new paid user: ${email}`);
    }

    // Push to GHL — move to Subscribed stage with $7 value
    try {
      await handleSubscription({
        email: email.toLowerCase().trim(),
        plan: 'Alignment Engine Full Access ($7)',
        amount: 7,
      });
      console.log(`[Provision] GHL subscription updated for: ${email}`);
    } catch (ghlErr) {
      console.error(`[Provision] GHL update failed (non-blocking):`, ghlErr.message);
    }

    // Fire Meta CAPI Purchase event
    try {
      await sendCapiPurchaseEvent(email, 7);
    } catch (capiErr) {
      console.error(`[Provision] CAPI event failed (non-blocking):`, capiErr.message);
    }

    res.json({
      success: true,
      message: `Access provisioned for ${email}`,
      status: 'active',
    });

  } catch (err) {
    console.error('[Provision] Error:', err.message);
    res.status(500).json({ error: 'Failed to provision access' });
  }
});

/**
 * GET /api/provision-access/check?email=...
 * Check if an email has paid access (called by frontend after Clerk auth)
 * This is a public check — the frontend uses Clerk auth + email to verify
 */
router.get('/check', (req, res) => {
  try {
    const email = req.query.email?.toLowerCase()?.trim();
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Admin bypass — always grant access for admin emails
    if (isAdminEmail(email)) {
      console.log(`[Provision] Admin access granted for: ${email}`);
      return res.json({
        hasAccess: true,
        status: 'admin',
        plan: 'admin',
        since: '2024-01-01',
      });
    }

    const paidUser = db.prepare(
      'SELECT paid_status, plan, provisioned_at FROM paid_users WHERE email = ? AND paid_status = ?'
    ).get(email, 'active');

    if (paidUser) {
      res.json({
        hasAccess: true,
        status: paidUser.paid_status,
        plan: paidUser.plan,
        since: paidUser.provisioned_at,
      });
    } else {
      res.json({
        hasAccess: false,
        status: 'unpaid',
        purchaseUrl: 'https://start.sovereignty.app',
      });
    }
  } catch (err) {
    console.error('[Provision] Check error:', err.message);
    res.status(500).json({ error: 'Failed to check access' });
  }
});

/**
 * POST /api/provision-access/link-clerk
 * Called by the frontend when a paid user signs into Clerk — links their Clerk ID to the paid record
 * Uses Clerk auth (req.userId) from the extractUserId middleware
 */
router.post('/link-clerk', (req, res) => {
  try {
    const { email } = req.body;
    const clerkUserId = req.userId;

    if (!email || !clerkUserId) {
      return res.status(400).json({ error: 'Email and authenticated user required' });
    }

    db.prepare(`
      UPDATE paid_users SET clerk_user_id = ?, updated_at = datetime('now') WHERE email = ?
    `).run(clerkUserId, email.toLowerCase().trim());

    console.log(`[Provision] Linked Clerk user ${clerkUserId} to paid email ${email}`);

    res.json({ success: true });
  } catch (err) {
    console.error('[Provision] Link error:', err.message);
    res.status(500).json({ error: 'Failed to link Clerk user' });
  }
});

/**
 * Meta CAPI Purchase event
 */
async function sendCapiPurchaseEvent(email, amount) {
  const PIXEL_ID = '2035820893688270';
  const CAPI_TOKEN = process.env.META_CAPI_TOKEN;
  if (!CAPI_TOKEN) return;

  const crypto = await import('crypto');
  const hashedEmail = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');

  const eventData = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: 'https://start.sovereignty.app',
    action_source: 'website',
    user_data: {
      em: [hashedEmail],
    },
    custom_data: {
      currency: 'USD',
      value: amount,
      content_name: 'Alignment Engine Full Access',
      content_ids: ['alignment-engine-full-access'],
      content_type: 'product',
    },
  };

  await fetch(`https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${CAPI_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [eventData] }),
  });

  console.log(`[CAPI] Purchase event sent for ${email}`);
}

export default router;
