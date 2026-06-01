import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import learnRoutes from './routes/learn.js';
import practiceRoutes from './routes/practice.js';
import hypnosisRoutes from './routes/hypnosis.js';
import audioRoutes from './routes/audio.js';
import profileRoutes from './routes/profile.js';
import identityRoutes from './routes/identity.js';
import gamificationRoutes from './routes/gamification.js';
import quizRoutes from './routes/quiz.js';
import ghlRoutes from './routes/ghl.js';
import analyticsRoutes from './routes/analytics.js';
import provisionRoutes from './routes/provision.js';
import adminKbRoutes from './routes/admin-kb.js';
import stripeWebhookRoutes from './routes/stripe-webhook.js';
import { ensureDefaultUser, ensureUser } from './services/profile.js';
import { initKnowledgeBaseScheduler } from './services/knowledge-base-scheduler.js';
import { buildRuntimeHealthPayload } from './config/runtime-health.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load .env for local dev; Railway/production injects env vars directly
dotenv.config({ path: join(__dirname, '..', '.env'), quiet: true });

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://heart.sovereignty.app',
  'http://localhost:5173',
  'http://localhost:4173',
].filter(Boolean);

// Initialize database and default user
try {
  const userId = ensureDefaultUser();
  console.log(`Database initialized. Default user: ${userId}`);
} catch (err) {
  console.error('Database initialization error:', err.message);
}

// Initialize Dropbox → Pinecone knowledge-base sync scheduler
try {
  initKnowledgeBaseScheduler();
} catch (err) {
  console.error('Knowledge base scheduler initialization error:', err.message);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (health checks, server-to-server, curl)
    if (!origin) return callback(null, true);
    // Allow any *.vercel.app preview deployment
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    // Allow any *.sovereignty.app subdomain
    if (origin.endsWith('.sovereignty.app')) return callback(null, true);
    // Allow explicitly listed origins
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
// Stripe webhook needs raw body for signature verification — mount BEFORE express.json()
app.use('/api/stripe-webhook', stripeWebhookRoutes);

app.use(express.json({ limit: '1mb' }));

// ─── Manual Clerk JWT verification (no @clerk/express dependency) ───
// Decode the publishable key to get the Clerk Frontend API URL
let clerkFrontendApi = null;
const clerkEnabled = !!process.env.CLERK_SECRET_KEY;

if (clerkEnabled) {
  // The publishable key is base64-encoded: "clerk.<domain>$"
  // We can also derive the JWKS URL from the secret key's issuer
  // Clerk JWKS endpoint: https://<clerk-frontend-api>/.well-known/jwks.json
  const pk = process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY || '';
  if (pk.startsWith('pk_')) {
    try {
      const encoded = pk.replace(/^pk_(live|test)_/, '');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8').replace(/\$$/, '');
      clerkFrontendApi = `https://${decoded}`;
      console.log(`Clerk auth enabled — Frontend API: ${clerkFrontendApi}`);
    } catch (e) {
      console.error('Failed to decode Clerk publishable key:', e.message);
    }
  }
  if (!clerkFrontendApi) {
    console.warn('Could not derive Clerk Frontend API URL — will try to verify JWTs without issuer check');
  }
}

// JWKS cache
let jwksCache = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 3600000; // 1 hour

async function getJwks() {
  const now = Date.now();
  if (jwksCache && (now - jwksCacheTime) < JWKS_CACHE_TTL) return jwksCache;

  if (!clerkFrontendApi) return null;

  try {
    const resp = await fetch(`${clerkFrontendApi}/.well-known/jwks.json`);
    if (!resp.ok) throw new Error(`JWKS fetch failed: ${resp.status}`);
    jwksCache = await resp.json();
    jwksCacheTime = now;
    return jwksCache;
  } catch (err) {
    console.error('Failed to fetch JWKS:', err.message);
    return jwksCache; // return stale cache if available
  }
}

// Convert JWK to PEM for verification
function jwkToPem(jwk) {
  // For RSA keys, construct PEM from n and e
  const n = Buffer.from(jwk.n, 'base64url');
  const e = Buffer.from(jwk.e, 'base64url');

  // DER encode the RSA public key
  function encodeLengthHex(n) {
    if (n <= 127) return Buffer.from([n]);
    const hex = n.toString(16);
    const len = Math.ceil(hex.length / 2);
    const buf = Buffer.alloc(len + 1);
    buf[0] = 0x80 | len;
    Buffer.from(hex.padStart(len * 2, '0'), 'hex').copy(buf, 1);
    return buf;
  }

  function derSequence(...items) {
    const content = Buffer.concat(items);
    return Buffer.concat([Buffer.from([0x30]), encodeLengthHex(content.length), content]);
  }

  function derInteger(buf) {
    // Prepend 0x00 if high bit set
    const needsPad = buf[0] & 0x80;
    const content = needsPad ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
    return Buffer.concat([Buffer.from([0x02]), encodeLengthHex(content.length), content]);
  }

  function derBitString(buf) {
    const content = Buffer.concat([Buffer.from([0x00]), buf]);
    return Buffer.concat([Buffer.from([0x03]), encodeLengthHex(content.length), content]);
  }

  function derOid(oid) {
    return Buffer.from(oid, 'hex');
  }

  // RSA OID: 1.2.840.113549.1.1.1
  const rsaOid = derOid('06092a864886f70d010101');
  const nullParam = Buffer.from([0x05, 0x00]);
  const algorithmIdentifier = derSequence(rsaOid, nullParam);

  const publicKeyInner = derSequence(derInteger(n), derInteger(e));
  const publicKeyInfo = derSequence(algorithmIdentifier, derBitString(publicKeyInner));

  const pem = `-----BEGIN PUBLIC KEY-----\n${publicKeyInfo.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
  return pem;
}

async function verifyClerkJwt(token) {
  if (!token) return null;

  try {
    // Decode header to get kid
    const [headerB64] = token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

    // Get JWKS
    const jwks = await getJwks();
    if (!jwks || !jwks.keys) return null;

    // Find matching key
    const key = jwks.keys.find(k => k.kid === header.kid);
    if (!key) return null;

    // Convert to PEM and verify
    const pem = jwkToPem(key);
    const { createVerify } = await import('crypto');

    // Decode payload
    const parts = token.split('.');
    const signatureInput = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2], 'base64url');

    const verifier = createVerify('RSA-SHA256');
    verifier.update(signatureInput);

    if (!verifier.verify(pem, signature)) return null;

    // Decode and return payload
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) return null;

    return payload;
  } catch (err) {
    console.error('JWT verification error:', err.message);
    return null;
  }
}

// Health check (public, no auth required)
app.get('/api/health', (req, res) => {
  res.json(buildRuntimeHealthPayload({ clerkEnabled }));
});

// Middleware to extract userId from Clerk JWT and ensure user exists in DB
const extractUserId = async (req, res, next) => {
  if (clerkEnabled) {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const payload = await verifyClerkJwt(token);
        if (payload && payload.sub) {
          req.userId = payload.sub;
          try { ensureUser(payload.sub); } catch (e) { console.error('ensureUser error:', e.message); }
        } else {
          req.userId = null;
        }
      } else {
        req.userId = null;
      }
    } catch (err) {
      console.error('extractUserId error:', err.message);
      req.userId = null;
    }
  } else {
    // No Clerk configured — local dev fallback
    req.userId = 'default-user';
    try { ensureUser('default-user'); } catch (e) { console.error('ensureUser fallback error:', e.message); }
  }
  next();
};

// Apply userId extraction to all API routes
app.use('/api', extractUserId);

// Mount routes
app.use('/api/learn', learnRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/hypnosis', hypnosisRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/identity', identityRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/ghl', ghlRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/provision-access', provisionRoutes);
app.use('/api/admin', adminKbRoutes);

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
