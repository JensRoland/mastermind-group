import crypto from 'crypto';
import db from './db.js';

// In-memory session store (sessions don't survive server restart)
const sessions = new Map();

const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}

export async function setPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await hashPassword(password, salt);
  const value = `${salt}:${hash}`;

  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES ('password_hash', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  upsert.run(value);
}

export function hasPassword() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'password_hash'").get();
  return !!row;
}

async function verifyPassword(password) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'password_hash'").get();
  if (!row) return false;

  const [salt, storedHash] = row.value.split(':');
  const hash = await hashPassword(password, salt);

  const a = Buffer.from(storedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  return crypto.timingSafeEqual(a, b);
}

function isThrottled() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'last_failed_login'").get();
  if (!row) return false;

  const lastFailed = parseInt(row.value, 10);
  return Date.now() - lastFailed < THROTTLE_MS;
}

function recordFailedAttempt() {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES ('last_failed_login', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  upsert.run(String(Date.now()));
}

function getThrottleRemaining() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'last_failed_login'").get();
  if (!row) return 0;
  const lastFailed = parseInt(row.value, 10);
  const remaining = THROTTLE_MS - (Date.now() - lastFailed);
  return Math.max(0, Math.ceil(remaining / 1000));
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function parseSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').find(c => c.trim().startsWith('session='));
  if (!match) return null;
  return match.split('=')[1]?.trim();
}

export function isValidSession(token) {
  return sessions.has(token);
}

export function loginRoute(req, res) {
  (async () => {
    if (!hasPassword()) {
      return res.status(503).json({ error: 'No password configured. Run: node server/setup-password.js' });
    }

    if (isThrottled()) {
      const remaining = getThrottleRemaining();
      return res.status(429).json({
        error: 'Too many attempts. Try again later.',
        retryAfterSeconds: remaining,
      });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      recordFailedAttempt();
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = createSession();
    res.cookie('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    res.json({ ok: true });
  })().catch(err => {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal error' });
  });
}

export function requireAuth(req, res, next) {
  const token = parseSessionCookie(req.headers.cookie);
  if (!token || !isValidSession(token)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export function authenticateWs(req) {
  const token = parseSessionCookie(req.headers.cookie);
  return token && isValidSession(token);
}

export function checkAuthRoute(req, res) {
  const token = parseSessionCookie(req.headers.cookie);
  if (token && isValidSession(token)) {
    return res.json({ authenticated: true });
  }
  res.json({ authenticated: false });
}
