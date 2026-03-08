import crypto from 'crypto';
import db from './db.js';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

// Prepared statements for session management (initialized lazily)
let _stmts;
function stmts() {
  if (!_stmts) {
    _stmts = {
      insert: db.prepare('INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)'),
      find: db.prepare('SELECT token FROM sessions WHERE token = ? AND expires_at > ?'),
      remove: db.prepare('DELETE FROM sessions WHERE token = ?'),
      cleanup: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    };
  }
  return _stmts;
}

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
  const now = Date.now();
  stmts().insert.run(token, now, now + SESSION_MAX_AGE_MS);
  return token;
}

function parseSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').find(c => c.trim().startsWith('session='));
  if (!match) return null;
  return match.split('=')[1]?.trim();
}

export function isValidSession(token) {
  return !!stmts().find.get(token, Date.now());
}

export function removeSession(token) {
  stmts().remove.run(token);
}

export function cleanupExpiredSessions() {
  stmts().cleanup.run(Date.now());
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

export function logoutRoute(req, res) {
  const token = parseSessionCookie(req.headers.cookie);
  if (token) removeSession(token);
  res.clearCookie('session');
  res.json({ ok: true });
}

export function checkAuthRoute(req, res) {
  const token = parseSessionCookie(req.headers.cookie);
  if (token && isValidSession(token)) {
    return res.json({ authenticated: true, moderatorName: getModeratorName() });
  }
  res.json({ authenticated: false });
}

// --- Moderator name ---

export function getModeratorName() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'moderator_name'").get();
  return row?.value || null;
}

export function setModeratorName(name) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('moderator_name', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(name);
}

// --- OpenRouter API key ---

export function getApiKey() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'openrouter_api_key'").get();
  return row?.value || null;
}

export function setApiKey(key) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('openrouter_api_key', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key);
}

export function getApiKeyMasked() {
  const key = getApiKey();
  if (!key) return null;
  if (key.length <= 8) return '****';
  return key.slice(0, 5) + '...' + key.slice(-4);
}

// --- Password change ---

export async function changePassword(currentPassword, newPassword) {
  const valid = await verifyPassword(currentPassword);
  if (!valid) return { ok: false, error: 'Current password is incorrect' };
  await setPassword(newPassword);
  return { ok: true };
}
