import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DEFAULT_MAX_TURNS } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'mastermind.db');

fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS experts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    avatar_url TEXT DEFAULT '/avatars/default.png',
    description TEXT NOT NULL,
    llm_model TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','concluded')),
    max_turns INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_TURNS},
    current_turn INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS thread_experts (
    thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    expert_id INTEGER NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (thread_id, expert_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    expert_id INTEGER REFERENCES experts(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK(role IN ('user','expert','system')),
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS message_likes (
    message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations — add columns that may not exist yet
try {
  db.exec('ALTER TABLE threads ADD COLUMN wrapping_up INTEGER NOT NULL DEFAULT 0');
} catch {
  // Column already exists
}

try {
  db.exec("ALTER TABLE messages ADD COLUMN llm_model TEXT DEFAULT NULL");
} catch {
  // Column already exists
}

try {
  db.exec("ALTER TABLE experts ADD COLUMN specialty TEXT NOT NULL DEFAULT 'General'");
} catch {
  // Column already exists
}

try {
  db.exec('ALTER TABLE threads ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
} catch {
  // Column already exists
}

try {
  db.exec("ALTER TABLE threads ADD COLUMN language TEXT NOT NULL DEFAULT 'en'");
} catch {
  // Column already exists
}

// Data migrations — revert mistaken Gemini 3.1 upgrade (model doesn't exist yet)
db.exec(`
  UPDATE experts SET llm_model = 'google/gemini-3-flash-preview'
  WHERE llm_model = 'google/gemini-3.1-flash-preview'
`);
db.exec(`
  UPDATE experts SET llm_model = 'google/gemini-3-pro-preview'
  WHERE llm_model = 'google/gemini-3.1-pro-preview'
`);

export default db;
