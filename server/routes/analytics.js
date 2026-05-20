import express from 'express';
import db from '../db/index.js';
import { buildFunnelBreakdown } from '../services/funnel-breakdown.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// ── Ensure analytics tables exist ──
try {
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

  db.prepare(`
    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      user_id TEXT,
      referrer TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
} catch (err) {
  console.error('Failed to create analytics tables:', err.message);
}

// In-memory cache for /overview. Keyed by `days` param. Resets on process restart.
const overviewCache = new Map();
const OVERVIEW_CACHE_TTL_MS = 60_000;

// ── POST /api/analytics/event — Track an analytics event ──
router.post('/event', (req, res) => {
  try {
    const { eventType, userId, email, metadata } = req.body;
    if (!eventType) return res.status(400).json({ error: 'eventType required' });

    db.prepare(`
      INSERT INTO analytics_events (event_type, user_id, email, metadata)
      VALUES (?, ?, ?, ?)
    `).run(
      eventType,
      userId || null,
      email || null,
      metadata ? JSON.stringify(metadata) : '{}'
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Analytics event error:', err.message);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// ── POST /api/analytics/pageview — Track a page view ──
router.post('/pageview', (req, res) => {
  try {
    const { path, userId, referrer, userAgent } = req.body;
    db.prepare(`
      INSERT INTO page_views (path, user_id, referrer, user_agent)
      VALUES (?, ?, ?, ?)
    `).run(path || '/', userId || null, referrer || null, userAgent || null);

    res.json({ success: true });
  } catch (err) {
    console.error('Pageview error:', err.message);
    res.status(500).json({ error: 'Failed to track pageview' });
  }
});

// ── GET /api/analytics/overview — Main dashboard overview (admin only) ──
router.get('/overview', requireAdmin, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const cacheKey = `overview:${days}`;
    const cached = overviewCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    }
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // Quiz funnel metrics
    const quizLeads = db.prepare(
      `SELECT COUNT(*) as count FROM quiz_leads WHERE created_at >= ?`
    ).get(since);

    const quizLeadsTotal = db.prepare(
      `SELECT COUNT(*) as count FROM quiz_leads`
    ).get();

    const quizPageViews = db.prepare(
      `SELECT COUNT(*) as count FROM page_views WHERE created_at >= ? AND path LIKE '/quiz%'`
    ).get(since);

    const offerClicks = db.prepare(`
      SELECT COUNT(*) as count
      FROM analytics_events
      WHERE created_at >= ? AND event_type IN ('StartTrial', 'QuizOfferClick')
    `).get(since);

    const purchases = db.prepare(`
      SELECT COUNT(*) as count
      FROM paid_users
      WHERE provisioned_at >= ?
    `).get(since);

    const funnelBreakdown = buildFunnelBreakdown({
      quizPageViews: quizPageViews?.count || 0,
      quizLeads: quizLeads?.count || 0,
      offerClicks: offerClicks?.count || 0,
      purchases: purchases?.count || 0,
    });

    // Quiz leads by day
    const quizLeadsByDay = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count
      FROM quiz_leads
      WHERE created_at >= ?
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).all(since);

    // Quiz tier distribution
    const tierDistribution = db.prepare(`
      SELECT tier, COUNT(*) as count
      FROM quiz_leads
      WHERE tier IS NOT NULL
      GROUP BY tier
      ORDER BY count DESC
    `).all();

    // User metrics
    const totalUsers = db.prepare(
      `SELECT COUNT(*) as count FROM users`
    ).get();

    const recentUsers = db.prepare(
      `SELECT COUNT(*) as count FROM users WHERE created_at >= ?`
    ).get(since);

    // Session metrics
    const totalSessions = db.prepare(
      `SELECT COUNT(*) as count FROM sessions`
    ).get();

    const recentSessions = db.prepare(
      `SELECT COUNT(*) as count FROM sessions WHERE created_at >= ?`
    ).get(since);

    const sessionsByDay = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count
      FROM sessions
      WHERE created_at >= ?
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).all(since);

    // Streak data
    const streakData = db.prepare(`
      SELECT
        AVG(current_streak) as avg_streak,
        MAX(longest_streak) as max_streak,
        SUM(total_sessions) as total_completed,
        COUNT(*) as active_users
      FROM streaks
      WHERE total_sessions > 0
    `).get();

    // XP / Level distribution
    const levelDistribution = db.prepare(`
      SELECT level, COUNT(*) as count
      FROM user_xp
      GROUP BY level
      ORDER BY level ASC
    `).all();

    // Scripts generated
    const totalScripts = db.prepare(
      `SELECT COUNT(*) as count FROM scripts`
    ).get();

    const recentScripts = db.prepare(
      `SELECT COUNT(*) as count FROM scripts WHERE created_at >= ?`
    ).get(since);

    // Analytics events
    const eventCounts = db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM analytics_events
      WHERE created_at >= ?
      GROUP BY event_type
      ORDER BY count DESC
    `).all(since);

    // Page views
    const pageViewsByPath = db.prepare(`
      SELECT path, COUNT(*) as count
      FROM page_views
      WHERE created_at >= ?
      GROUP BY path
      ORDER BY count DESC
      LIMIT 20
    `).all(since);

    const totalPageViews = db.prepare(
      `SELECT COUNT(*) as count FROM page_views WHERE created_at >= ?`
    ).get(since);

    // Recent leads
    const recentLeads = db.prepare(`
      SELECT email, name, score, tier, created_at
      FROM quiz_leads
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

    // Email metrics
    const emailMetrics = (() => {
      try {
        const totalSent   = db.prepare('SELECT COUNT(*) as count FROM email_sends').get();
        const totalOpened = db.prepare('SELECT COUNT(*) as count FROM email_sends WHERE opened_at IS NOT NULL').get();
        const totalClicked = db.prepare('SELECT COUNT(*) as count FROM email_sends WHERE clicked_at IS NOT NULL').get();
        const totalUnsub  = db.prepare('SELECT COUNT(*) as count FROM email_preferences WHERE unsubscribed = 1').get();

        const sent    = totalSent?.count    || 0;
        const opened  = totalOpened?.count  || 0;
        const clicked = totalClicked?.count || 0;
        const unsub   = totalUnsub?.count   || 0;

        const bySequence = db.prepare(`
          SELECT
            sequence_type,
            COUNT(*) as sent,
            SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
            SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked
          FROM email_sends
          GROUP BY sequence_type
          ORDER BY sent DESC
        `).all();

        return {
          sent,
          opened,
          clicked,
          unsubscribed: unsub,
          openRate:  sent > 0 ? Math.round((opened  / sent) * 1000) / 10 : 0,
          clickRate: sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : 0,
          bySequence: bySequence || [],
        };
      } catch {
        return { sent: 0, opened: 0, clicked: 0, unsubscribed: 0, openRate: 0, clickRate: 0, bySequence: [] };
      }
    })();

    const payload = {
      period: { days, since },
      funnel: {
        quizLeads: quizLeads?.count || 0,
        quizLeadsTotal: quizLeadsTotal?.count || 0,
        quizLeadsByDay: quizLeadsByDay || [],
        tierDistribution: tierDistribution || [],
        breakdown: funnelBreakdown,
        purchases: purchases?.count || 0,
        quizTraffic: quizPageViews?.count || 0,
        offerClicks: offerClicks?.count || 0,
      },
      users: {
        total: totalUsers?.count || 0,
        recent: recentUsers?.count || 0,
      },
      sessions: {
        total: totalSessions?.count || 0,
        recent: recentSessions?.count || 0,
        byDay: sessionsByDay || [],
      },
      engagement: {
        avgStreak: streakData?.avg_streak || 0,
        maxStreak: streakData?.max_streak || 0,
        totalCompleted: streakData?.total_completed || 0,
        activeUsers: streakData?.active_users || 0,
      },
      gamification: {
        levelDistribution: levelDistribution || [],
      },
      content: {
        totalScripts: totalScripts?.count || 0,
        recentScripts: recentScripts?.count || 0,
      },
      email: emailMetrics,
      events: eventCounts || [],
      pageViews: {
        total: totalPageViews?.count || 0,
        byPath: pageViewsByPath || [],
      },
      recentLeads: recentLeads || [],
    };

    overviewCache.set(cacheKey, { data: payload, expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS });
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    console.error('Analytics overview error:', err.message);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// ── GET /api/analytics/leads — Paginated lead list (admin only) ──
router.get('/leads', requireAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const leads = db.prepare(
      'SELECT * FROM quiz_leads ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM quiz_leads').get();
    res.json({ leads, total: total?.count || 0 });
  } catch (err) {
    console.error('Analytics leads error:', err.message);
    res.status(500).json({ error: 'Failed to load leads' });
  }
});

// ── GET /api/analytics/users — User list with engagement data (admin only) ──
router.get('/users', requireAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const users = db.prepare(`
      SELECT
        u.id,
        u.created_at,
        COALESCE(s.current_streak, 0) as current_streak,
        COALESCE(s.longest_streak, 0) as longest_streak,
        COALESCE(s.total_sessions, 0) as total_sessions,
        s.last_session_date,
        COALESCE(x.level, 1) as level,
        COALESCE(x.total_xp, 0) as total_xp,
        COALESCE(x.title, 'Seeker') as title
      FROM users u
      LEFT JOIN streaks s ON u.id = s.user_id
      LEFT JOIN user_xp x ON u.id = x.user_id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM users').get();
    res.json({ users, total: total?.count || 0 });
  } catch (err) {
    console.error('Analytics users error:', err.message);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

export default router;
