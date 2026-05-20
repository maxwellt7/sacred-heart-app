/**
 * Auth middleware — `requireAuth` and `requireAdmin`.
 *
 * Relies on `extractUserId` (mounted globally on /api) to populate `req.userId`
 * from a verified Clerk JWT. These middlewares enforce that. `requireAdmin`
 * resolves the user's primary email via Clerk Backend API (5-min in-memory
 * cache) and compares against the admin allow-list below — kept in sync with
 * `src/hooks/useAccessGate.ts` and `src/pages/Admin.tsx`.
 */

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || '';

export const ADMIN_EMAILS = [
  'maxwellmayes@gmail.com',
  'maxwell@sovereignty.app',
  'max@maxwellmayes.com',
];

export const ADMIN_DOMAINS = ['sovereignty.app', 'maxwellmayes.com'];

export function isAdminEmail(email) {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  if (ADMIN_EMAILS.some((e) => e.toLowerCase() === lower)) return true;
  const domain = lower.split('@')[1];
  if (domain && ADMIN_DOMAINS.includes(domain)) return true;
  return false;
}

// userId -> { email, expiresAt }
const emailCache = new Map();
const EMAIL_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchClerkUserEmail(userId) {
  if (!CLERK_SECRET_KEY || !userId) return null;

  const cached = emailCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.email;

  try {
    const resp = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${CLERK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!resp.ok) {
      console.error('[Auth] Clerk user fetch failed:', resp.status);
      return null;
    }
    const u = await resp.json();
    const primaryId = u.primary_email_address_id;
    const primary = (u.email_addresses || []).find((e) => e.id === primaryId);
    const email =
      primary?.email_address ||
      u.email_addresses?.[0]?.email_address ||
      null;
    emailCache.set(userId, { email, expiresAt: Date.now() + EMAIL_CACHE_TTL_MS });
    return email;
  } catch (err) {
    console.error('[Auth] Clerk user fetch error:', err.message);
    return null;
  }
}

export function requireAuth(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export async function requireAdmin(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const email = await fetchClerkUserEmail(req.userId);
  if (!isAdminEmail(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  req.userEmail = email;
  next();
}
