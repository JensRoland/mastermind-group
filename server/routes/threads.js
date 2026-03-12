import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { marked } from 'marked';
import db from '../db.js';
import { broadcast, broadcastGlobal } from '../ws.js';
import { getThinkingExpert } from '../orchestrator.js';
import { DEFAULT_MAX_TURNS } from '../config.js';
import { getModeratorName } from '../auth.js';
import { callLLM } from '../llm.js';
import { getLanguage, getAvailableLanguages, t } from '../languages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const avatarDir = path.join(__dirname, '..', '..', 'public', 'avatars');

marked.setOptions({ breaks: true, gfm: true });

const TITLE_MODEL = 'google/gemini-3.1-flash-lite-preview';

const router = Router();

function threadTag(thread) {
  const tag = thread.title.length > 32 ? thread.title.slice(0, 32) + '…' : thread.title;
  return `[${tag}]`;
}

// GET /api/threads/languages
router.get('/languages', (_req, res) => {
  res.json(getAvailableLanguages());
});

// GET /api/threads
router.get('/', (req, res) => {
  const { status } = req.query;
  let threads;
  if (status) {
    threads = db.prepare('SELECT * FROM threads WHERE status = ? AND archived = 0 ORDER BY created_at DESC').all(status);
  } else {
    threads = db.prepare('SELECT * FROM threads WHERE archived = 0 ORDER BY created_at DESC').all();
  }

  // Attach expert info to each thread
  const getExperts = db.prepare(
    `SELECT e.id, e.name, e.avatar_url FROM thread_experts te
     JOIN experts e ON e.id = te.expert_id
     WHERE te.thread_id = ? ORDER BY te.sort_order`
  );

  threads = threads.map(t => ({
    ...t,
    experts: getExperts.all(t.id),
  }));

  res.json(threads);
});

// GET /api/threads/:id
router.get('/:id', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const experts = db.prepare(
    `SELECT e.*, te.sort_order FROM thread_experts te
     JOIN experts e ON e.id = te.expert_id
     WHERE te.thread_id = ? ORDER BY te.sort_order`
  ).all(thread.id);

  const messages = db.prepare(
    `SELECT m.*, e.name as expert_name, e.avatar_url as expert_avatar,
            CASE WHEN ml.message_id IS NOT NULL THEN 1 ELSE 0 END as liked
     FROM messages m
     LEFT JOIN experts e ON m.expert_id = e.id
     LEFT JOIN message_likes ml ON ml.message_id = m.id
     WHERE m.thread_id = ?
     ORDER BY m.created_at ASC`
  ).all(thread.id);

  const thinkingExpert = getThinkingExpert(thread.id);
  res.json({ thread, experts, messages, thinkingExpert });
});

// POST /api/threads
router.post('/', (req, res) => {
  const { title, topic, expertIds, maxTurns, language } = req.body;
  if (!topic || !expertIds?.length || expertIds.length < 2) {
    return res.status(400).json({ error: 'Topic and at least 2 experts are required' });
  }

  const threadLanguage = language || 'en';

  // Use provided title or a placeholder that will be replaced by LLM
  const initialTitle = title || topic.slice(0, 60);

  const insertThread = db.prepare(
    'INSERT INTO threads (title, topic, max_turns, language) VALUES (?, ?, ?, ?)'
  );
  const insertExpert = db.prepare(
    'INSERT INTO thread_experts (thread_id, expert_id, sort_order) VALUES (?, ?, ?)'
  );
  const insertSystemMsg = db.prepare(
    "INSERT INTO messages (thread_id, expert_id, role, content) VALUES (?, NULL, 'system', ?)"
  );
  const insertMsg = db.prepare(
    "INSERT INTO messages (thread_id, expert_id, role, content) VALUES (?, NULL, 'user', ?)"
  );
  const getExpert = db.prepare('SELECT id, name FROM experts WHERE id = ?');

  const createThread = db.transaction(() => {
    const result = insertThread.run(initialTitle, topic, maxTurns || DEFAULT_MAX_TURNS, threadLanguage);
    const threadId = Number(result.lastInsertRowid);

    expertIds.forEach((eid, i) => {
      insertExpert.run(threadId, eid, i);
    });

    // Build participant list for the opening system message
    const lang = getLanguage(threadLanguage);
    const experts = expertIds.map(eid => getExpert.get(eid)).filter(Boolean);
    const participantList = experts.map(e => e.name).join(', ');
    insertSystemMsg.run(threadId, `${lang.exportParticipants}: ${participantList}`);

    // Seed with the topic as the first message
    insertMsg.run(threadId, topic);

    return threadId;
  });

  const threadId = createThread();
  console.log(`[${initialTitle.length > 32 ? initialTitle.slice(0, 32) + '…' : initialTitle}] New thread started with ${expertIds.length} experts (max ${maxTurns || DEFAULT_MAX_TURNS} turns)`);
  broadcastGlobal({ type: 'thread_list_update' });
  res.status(201).json({ id: threadId });

  // Auto-generate title if none was provided
  if (!title) {
    generateThreadTitle(threadId, topic, threadLanguage);
  }
});

async function generateThreadTitle(threadId, topic, language) {
  const lang = getLanguage(language);
  try {
    const generated = await callLLM(TITLE_MODEL, [
      {
        role: 'system',
        content: lang.titleSystemPrompt,
      },
      { role: 'user', content: topic },
    ]);
    const newTitle = generated.trim().replace(/^["']|["']$/g, '').slice(0, 80);
    if (newTitle) {
      db.prepare('UPDATE threads SET title = ? WHERE id = ?').run(newTitle, threadId);
      broadcastGlobal({ type: 'thread_list_update' });
      broadcast(threadId, { type: 'thread_title_update', threadId, title: newTitle });
      console.log(`[Thread ${threadId}] Auto-titled: "${newTitle}"`);
    }
  } catch (err) {
    console.error(`[Thread ${threadId}] Failed to generate title:`, err.message);
  }
}

// PATCH /api/threads/:id/title — rename thread
router.patch('/:id/title', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

  const newTitle = title.trim().slice(0, 80);
  db.prepare('UPDATE threads SET title = ? WHERE id = ?').run(newTitle, thread.id);

  console.log(`${threadTag(thread)} Renamed to "${newTitle}"`);
  broadcastGlobal({ type: 'thread_list_update' });
  broadcast(thread.id, { type: 'thread_title_update', threadId: thread.id, title: newTitle });

  res.json({ ok: true, title: newTitle });
});

// POST /api/threads/:id/message — user interruption
router.post('/:id/message', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });

  // If concluded, reopen the thread with extended turns
  if (thread.status === 'concluded') {
    const extraTurns = 10;
    const newMaxTurns = thread.current_turn + extraTurns;
    db.prepare('UPDATE threads SET status = ?, max_turns = ?, wrapping_up = 0 WHERE id = ?')
      .run('active', newMaxTurns, thread.id);
    console.log(`${threadTag(thread)} Reopened via user message (extended to ${newMaxTurns} turns)`);

    const lang = getLanguage(thread.language);
    const modLabel = getModeratorName() || 'The moderator';
    const reopenText = t(lang.reopenedMessage, { moderatorName: modLabel });
    const reopenMsg = db.prepare(
      "INSERT INTO messages (thread_id, expert_id, role, content) VALUES (?, NULL, 'system', ?)"
    ).run(thread.id, reopenText);

    broadcast(thread.id, {
      type: 'new_message',
      message: {
        id: Number(reopenMsg.lastInsertRowid),
        thread_id: thread.id,
        expert_id: null,
        role: 'system',
        content: reopenText,
        created_at: new Date().toISOString(),
      },
    });
    broadcast(thread.id, {
      type: 'thread_status',
      threadId: thread.id,
      status: 'active',
      max_turns: newMaxTurns,
      current_turn: thread.current_turn,
    });
    broadcastGlobal({ type: 'thread_list_update' });
  }

  // If paused, resume the thread
  if (thread.status === 'paused') {
    db.prepare('UPDATE threads SET status = ? WHERE id = ?').run('active', thread.id);
    console.log(`${threadTag(thread)} Resumed via user message`);
    broadcast(thread.id, {
      type: 'thread_status',
      threadId: thread.id,
      status: 'active',
    });
    broadcastGlobal({ type: 'thread_list_update' });
  }

  const result = db.prepare(
    "INSERT INTO messages (thread_id, expert_id, role, content) VALUES (?, NULL, 'user', ?)"
  ).run(thread.id, content);

  const message = {
    id: Number(result.lastInsertRowid),
    thread_id: thread.id,
    expert_id: null,
    expert_name: null,
    expert_avatar: null,
    role: 'user',
    content,
    created_at: new Date().toISOString(),
  };

  broadcast(thread.id, { type: 'new_message', message });
  res.json(message);
});

// POST /api/threads/:id/wrapup
router.post('/:id/wrapup', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const experts = db.prepare(
    'SELECT COUNT(*) as count FROM thread_experts WHERE thread_id = ?'
  ).get(thread.id);

  const lang = getLanguage(thread.language);
  const modLabel = getModeratorName() || 'The moderator';
  const wrapupMessage = t(lang.wrapUpMessage, { moderatorName: modLabel });

  db.prepare(
    "INSERT INTO messages (thread_id, expert_id, role, content, message_type) VALUES (?, NULL, 'system', ?, 'wrapup')"
  ).run(thread.id, wrapupMessage);

  // Set max_turns so everyone speaks exactly once more
  const newMaxTurns = thread.current_turn + experts.count;
  db.prepare('UPDATE threads SET max_turns = ?, status = ?, wrapping_up = 1 WHERE id = ?')
    .run(newMaxTurns, 'active', thread.id);

  broadcast(thread.id, {
    type: 'new_message',
    message: {
      id: null,
      thread_id: thread.id,
      expert_id: null,
      role: 'system',
      content: wrapupMessage,
      created_at: new Date().toISOString(),
    },
  });

  broadcast(thread.id, {
    type: 'thread_status',
    threadId: thread.id,
    status: 'active',
    max_turns: newMaxTurns,
    current_turn: thread.current_turn,
  });

  res.json({ ok: true, max_turns: newMaxTurns });
});

// POST /api/threads/:id/extend
router.post('/:id/extend', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const { turns } = req.body;
  const extraTurns = turns || 10;
  const newMaxTurns = thread.max_turns + extraTurns;

  // If the thread was paused due to max turns, resume it
  const newStatus = thread.status === 'paused' ? 'active' : thread.status;

  db.prepare('UPDATE threads SET max_turns = ?, status = ? WHERE id = ?')
    .run(newMaxTurns, newStatus, thread.id);

  if (newStatus === 'active' && thread.status === 'paused') {
    console.log(`${threadTag(thread)} Resumed (extended to ${newMaxTurns} turns)`);
  } else {
    console.log(`${threadTag(thread)} Extended to ${newMaxTurns} turns`);
  }

  broadcast(thread.id, {
    type: 'thread_status',
    threadId: thread.id,
    status: newStatus,
    max_turns: newMaxTurns,
    current_turn: thread.current_turn,
  });

  broadcastGlobal({ type: 'thread_list_update' });

  res.json({ ok: true, max_turns: newMaxTurns, status: newStatus });
});

// PUT /api/threads/:id/status
router.put('/:id/status', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const { status } = req.body;
  if (!['active', 'paused', 'concluded'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  db.prepare('UPDATE threads SET status = ? WHERE id = ?').run(status, thread.id);

  const labels = { active: 'Resumed', paused: 'Paused', concluded: 'Concluded' };
  console.log(`${threadTag(thread)} ${labels[status]}`);

  broadcast(thread.id, {
    type: 'thread_status',
    threadId: thread.id,
    status,
  });

  broadcastGlobal({ type: 'thread_list_update' });

  res.json({ ok: true, status });
});

// GET /api/threads/:id/export — download thread as Markdown
router.get('/:id/export', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const messages = db.prepare(
    `SELECT m.*, e.name as expert_name
     FROM messages m
     LEFT JOIN experts e ON m.expert_id = e.id
     WHERE m.thread_id = ?
     ORDER BY m.created_at ASC`
  ).all(thread.id);

  const experts = db.prepare(
    `SELECT e.name, e.llm_model FROM thread_experts te
     JOIN experts e ON e.id = te.expert_id
     WHERE te.thread_id = ? ORDER BY te.sort_order`
  ).all(thread.id);

  const lang = getLanguage(thread.language);

  let md = `# ${thread.title}\n\n`;
  md += `**${lang.exportTopic}:** ${thread.topic}\n\n`;
  md += `**${lang.exportParticipants}:**\n${experts.map(e => `- ${e.name} (${e.llm_model})`).join('\n')}\n\n`;
  md += `**${lang.exportDate}:** ${thread.created_at} UTC\n\n`;
  md += `> **${lang.exportDisclaimerLabel}:** ${lang.exportDisclaimer}\n\n`;
  md += `*${lang.exportCreatedWith}*\n\n`;
  md += `---\n\n`;

  const exportModName = getModeratorName() || 'Moderator';
  for (const msg of messages) {
    if (msg.role === 'system') {
      md += `*${msg.content}*\n\n`;
    } else if (msg.role === 'user') {
      md += `### ${exportModName}\n\n${msg.content}\n\n`;
    } else {
      md += `### ${msg.expert_name || 'Unknown'}\n\n${msg.content}\n\n`;
    }
  }

  const filename = thread.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').toLowerCase();
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.md"`);
  res.send(md);
});

// GET /api/threads/:id/export-html — download thread as a static HTML ZIP
router.get('/:id/export-html', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const messages = db.prepare(
    `SELECT m.*, e.name as expert_name, e.avatar_url as expert_avatar
     FROM messages m
     LEFT JOIN experts e ON m.expert_id = e.id
     WHERE m.thread_id = ?
     ORDER BY m.created_at ASC`
  ).all(thread.id);

  const experts = db.prepare(
    `SELECT e.id, e.name, e.llm_model, e.avatar_url FROM thread_experts te
     JOIN experts e ON e.id = te.expert_id
     WHERE te.thread_id = ? ORDER BY te.sort_order`
  ).all(thread.id);

  const lang = getLanguage(thread.language);
  const exportModName = getModeratorName() || 'Moderator';

  // Collect avatar files that exist
  const avatarFiles = new Map();
  for (const expert of experts) {
    if (expert.avatar_url) {
      const filename = path.basename(expert.avatar_url);
      const filepath = path.join(avatarDir, filename);
      if (fs.existsSync(filepath)) {
        avatarFiles.set(expert.id, { filename, filepath });
      }
    }
  }

  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  function renderMessage(msg) {
    if (msg.role === 'system') {
      const isSummary = msg.content?.startsWith('## ');
      if (isSummary) {
        return `<div class="message-bubble summary"><div class="summary-message"><div class="message-content">${marked.parse(msg.content)}</div></div></div>`;
      }
      return `<div class="message-bubble system"><div class="system-message">${escapeHtml(msg.content)}</div></div>`;
    }

    const isUser = msg.role === 'user';
    const authorName = isUser ? `${exportModName} (Moderator)` : (msg.expert_name || 'Unknown');
    const avatarInfo = !isUser && msg.expert_id ? avatarFiles.get(msg.expert_id) : null;

    let avatarHtml;
    if (avatarInfo) {
      avatarHtml = `<img src="avatars/${avatarInfo.filename}" alt="${escapeHtml(authorName)}" />`;
    } else {
      avatarHtml = `<div class="avatar-placeholder">${getInitials(authorName)}</div>`;
    }

    const modelHtml = msg.llm_model ? `<span class="message-model">${escapeHtml(msg.llm_model)}</span>` : '';
    const time = msg.created_at ? new Date(msg.created_at + 'Z').toLocaleString(lang.dateLocale, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }) : '';

    return `<div class="message-bubble ${msg.role}">
      <div class="message-avatar">${avatarHtml}</div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-author">${escapeHtml(authorName)}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${marked.parse(msg.content || '')}</div>
        ${modelHtml ? `<div class="message-footer">${modelHtml}</div>` : ''}
      </div>
    </div>`;
  }

  const messagesHtml = messages.map(renderMessage).join('\n');
  const participantsList = experts.map(e => `${escapeHtml(e.name)} (${escapeHtml(e.llm_model)})`).join(', ');

  const html = `<!DOCTYPE html>
<html lang="${lang.code}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(thread.title)} — Mastermind Group</title>
<style>
${getExportCss()}
</style>
</head>
<body>
<div class="page">
  <header class="thread-header">
    <h1>${escapeHtml(thread.title)}</h1>
    <div class="thread-meta">
      <span class="thread-topic">${escapeHtml(thread.topic)}</span>
      <span class="meta-separator">·</span>
      <span>${new Date(thread.created_at + 'Z').toLocaleDateString(lang.dateLocale, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
      <span class="meta-separator">·</span>
      <span>${thread.current_turn} ${lang.exportTurns}</span>
    </div>
    <div class="participants">${lang.exportParticipants}: ${participantsList}</div>
  </header>
  <main class="messages">
${messagesHtml}
  </main>
  <footer class="export-footer">
    <div class="disclaimer">
      <strong>${lang.exportDisclaimerLabel}:</strong> ${lang.exportDisclaimer}
    </div>
    <div class="credit">
      ${lang.exportCreatedBy}
    </div>
  </footer>
</div>
</body>
</html>`;

  const slugFilename = thread.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').toLowerCase();

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${slugFilename}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to create archive' });
  });
  archive.pipe(res);

  archive.append(html, { name: `${slugFilename}/index.html` });

  for (const [, { filename, filepath }] of avatarFiles) {
    archive.file(filepath, { name: `${slugFilename}/avatars/${filename}` });
  }

  archive.finalize();
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getExportCss() {
  return `
:root {
  --color-bg-primary: #1a1d21;
  --color-bg-secondary: #222529;
  --color-text-primary: #d1d2d3;
  --color-text-secondary: #ababad;
  --color-text-bright: #ffffff;
  --color-text-muted: #8b8f97;
  --color-accent: #192f40;
  --color-yellow: #ecb22e;
  --color-border: #393c41;
  --radius: 6px;
  --radius-sm: 4px;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.page {
  max-width: 820px;
  margin: 0 auto;
  padding: var(--spacing-xl);
}

.thread-header {
  padding-bottom: var(--spacing-xl);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--spacing-xl);
}

.thread-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-bright);
  margin-bottom: var(--spacing-sm);
}

.thread-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
}

.thread-topic { font-style: italic; }
.meta-separator { color: var(--color-text-muted); }

.participants {
  font-size: 13px;
  color: var(--color-text-muted);
}

/* Messages */
.message-bubble {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) 0;
  margin-bottom: var(--spacing-sm);
}

.message-bubble + .message-bubble {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  padding-top: var(--spacing-md);
}

.message-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
}

.message-avatar img {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  object-fit: cover;
}

.avatar-placeholder {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  background: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-bright);
}

.message-body { flex: 1; min-width: 0; }

.message-header {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}

.message-author {
  font-weight: 700;
  color: var(--color-text-bright);
}

.message-time {
  font-size: 11px;
  color: var(--color-text-muted);
}

.message-content {
  color: var(--color-text-primary);
  line-height: 1.6;
  word-break: break-word;
}

.message-content p { margin-bottom: var(--spacing-sm); }
.message-content p:last-child { margin-bottom: 0; }
.message-content h1, .message-content h2, .message-content h3,
.message-content h4, .message-content h5, .message-content h6 {
  color: var(--color-text-bright);
  margin-top: var(--spacing-lg);
  margin-bottom: var(--spacing-sm);
  line-height: 1.3;
}
.message-content h1 { font-size: 1.4em; }
.message-content h2 { font-size: 1.25em; }
.message-content h3 { font-size: 1.1em; }

.message-content code {
  font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.9em;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.message-content pre {
  background: rgba(0, 0, 0, 0.3);
  border-radius: var(--radius);
  padding: var(--spacing-md);
  overflow-x: auto;
  margin: var(--spacing-sm) 0;
}

.message-content pre code {
  background: none;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.5;
}

.message-content blockquote {
  border-left: 3px solid var(--color-accent);
  padding-left: var(--spacing-md);
  margin: var(--spacing-sm) 0;
  color: var(--color-text-secondary);
}

.message-content ul, .message-content ol {
  padding-left: var(--spacing-xl);
  margin: var(--spacing-sm) 0;
}

.message-content li { margin-bottom: var(--spacing-xs); }

.message-content a {
  color: #4da6ff;
  text-decoration: underline;
}

.message-content hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: var(--spacing-lg) 0;
}

.message-content table {
  border-collapse: collapse;
  width: 100%;
  margin: var(--spacing-sm) 0;
}

.message-content th, .message-content td {
  border: 1px solid var(--color-border);
  padding: var(--spacing-xs) var(--spacing-sm);
  text-align: left;
}

.message-content th {
  background: rgba(255, 255, 255, 0.04);
  font-weight: 600;
  color: var(--color-text-bright);
}

.message-content strong { color: var(--color-text-bright); }

.message-footer {
  margin-top: var(--spacing-xs);
}

.message-model {
  font-size: 11px;
  color: var(--color-text-muted);
  opacity: 0.6;
}

/* System messages */
.message-bubble.system {
  justify-content: center;
  padding: var(--spacing-md) 0;
}

.system-message {
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted);
  font-style: italic;
  padding: var(--spacing-sm) var(--spacing-lg);
  background: rgba(255, 255, 255, 0.03);
  border-radius: var(--radius);
  max-width: 600px;
}

/* Summary messages */
.message-bubble.summary {
  justify-content: center;
  padding: var(--spacing-lg) 0;
}

.summary-message {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: var(--spacing-lg);
  background: rgba(255, 255, 255, 0.03);
  border-left: 3px solid var(--color-accent);
  border-radius: var(--radius);
}

.summary-message .message-content h2:first-child { margin-top: 0; }

/* User (moderator) messages */
.message-bubble.user .message-author { color: var(--color-yellow); }
.message-bubble.user .avatar-placeholder {
  background: var(--color-yellow);
  color: var(--color-bg-primary);
}

/* Footer */
.export-footer {
  margin-top: var(--spacing-xl);
  padding-top: var(--spacing-xl);
  border-top: 1px solid var(--color-border);
}

.disclaimer {
  font-size: 13px;
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.03);
  padding: var(--spacing-lg);
  border-radius: var(--radius);
  margin-bottom: var(--spacing-lg);
  line-height: 1.6;
}

.credit {
  font-size: 13px;
  color: var(--color-text-muted);
  text-align: center;
}

.credit a {
  color: #4da6ff;
  text-decoration: underline;
}

@media (max-width: 600px) {
  .page { padding: var(--spacing-md); }
  .message-avatar { width: 28px; height: 28px; }
  .message-avatar img { width: 28px; height: 28px; }
  .avatar-placeholder { width: 28px; height: 28px; font-size: 11px; }
  .message-bubble { gap: var(--spacing-sm); }
}
`;
}

// POST /api/threads/:id/rollback — rollback discussion to a specific message
router.post('/:id/rollback', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'messageId is required' });

  const message = db.prepare('SELECT * FROM messages WHERE id = ? AND thread_id = ?').get(messageId, thread.id);
  if (!message) return res.status(404).json({ error: 'Message not found in this thread' });

  const rollback = db.transaction(() => {
    db.prepare('DELETE FROM messages WHERE thread_id = ? AND id > ?').run(thread.id, messageId);

    const { count: newTurn } = db.prepare(
      "SELECT COUNT(*) as count FROM messages WHERE thread_id = ? AND role = 'expert' AND id <= ?"
    ).get(thread.id, messageId);

    // If the wrap-up message survived the rollback, preserve wrapping_up state
    // and recalculate max_turns to match the original wrap-up schedule:
    // each expert gets exactly one final turn after the wrap-up point.
    const wrapupMessage = db.prepare(
      "SELECT id FROM messages WHERE thread_id = ? AND message_type = 'wrapup' AND id <= ? ORDER BY id ASC LIMIT 1"
    ).get(thread.id, messageId);
    const wrappingUp = wrapupMessage ? 1 : 0;

    let newMaxTurns = thread.max_turns;
    if (wrappingUp) {
      const { count: turnAtWrapup } = db.prepare(
        "SELECT COUNT(*) as count FROM messages WHERE thread_id = ? AND role = 'expert' AND id < ?"
      ).get(thread.id, wrapupMessage.id);
      const { count: expertCount } = db.prepare(
        'SELECT COUNT(*) as count FROM thread_experts WHERE thread_id = ?'
      ).get(thread.id);
      newMaxTurns = turnAtWrapup + expertCount;
    }

    // If still in wrap-up phase with turns remaining, stay active so the
    // orchestrator continues the wrap-up round and generates the summary.
    const newStatus = (wrappingUp && newTurn < newMaxTurns) ? 'active' : 'paused';

    db.prepare('UPDATE threads SET status = ?, current_turn = ?, max_turns = ?, wrapping_up = ? WHERE id = ?')
      .run(newStatus, newTurn, newMaxTurns, wrappingUp, thread.id);

    return { newTurn, newStatus, newMaxTurns };
  });

  const { newTurn, newStatus, newMaxTurns } = rollback();

  console.log(`${threadTag(thread)} Rolled back to message ${messageId} (turn ${newTurn}/${newMaxTurns}, status ${newStatus})`);

  broadcast(thread.id, {
    type: 'messages_rollback',
    threadId: thread.id,
    messageId,
    current_turn: newTurn,
  });

  broadcast(thread.id, {
    type: 'thread_status',
    threadId: thread.id,
    status: newStatus,
    max_turns: newMaxTurns,
    current_turn: newTurn,
  });

  broadcastGlobal({ type: 'thread_list_update' });

  res.json({ ok: true, current_turn: newTurn });
});

// PATCH /api/threads/:id/archive
router.patch('/:id/archive', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  db.prepare('UPDATE threads SET archived = 1 WHERE id = ?').run(thread.id);
  console.log(`${threadTag(thread)} Archived`);

  broadcast(thread.id, { type: 'thread_archived', threadId: thread.id });
  broadcastGlobal({ type: 'thread_list_update' });
  res.json({ ok: true });
});

// POST /api/threads/:id/experts — add expert to thread
router.post('/:id/experts', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  if (thread.status === 'concluded') {
    return res.status(400).json({ error: 'Thread is concluded' });
  }

  const { expertId } = req.body;
  if (!expertId) return res.status(400).json({ error: 'expertId is required' });

  const expert = db.prepare('SELECT * FROM experts WHERE id = ?').get(expertId);
  if (!expert) return res.status(404).json({ error: 'Expert not found' });

  const existing = db.prepare(
    'SELECT 1 FROM thread_experts WHERE thread_id = ? AND expert_id = ?'
  ).get(thread.id, expertId);
  if (existing) return res.status(400).json({ error: 'Expert is already in this thread' });

  const maxOrder = db.prepare(
    'SELECT MAX(sort_order) as max_order FROM thread_experts WHERE thread_id = ?'
  ).get(thread.id);
  const nextOrder = (maxOrder?.max_order ?? -1) + 1;

  const lang = getLanguage(thread.language);
  const joinMsg = t(lang.joinedMessage, { expertName: expert.name });

  const addExpert = db.transaction(() => {
    db.prepare('INSERT INTO thread_experts (thread_id, expert_id, sort_order) VALUES (?, ?, ?)')
      .run(thread.id, expertId, nextOrder);

    const msgResult = db.prepare(
      "INSERT INTO messages (thread_id, expert_id, role, content) VALUES (?, NULL, 'system', ?)"
    ).run(thread.id, joinMsg);

    return Number(msgResult.lastInsertRowid);
  });

  const msgId = addExpert();

  console.log(`${threadTag(thread)} ${expert.name} joined`);

  broadcast(thread.id, {
    type: 'new_message',
    message: {
      id: msgId,
      thread_id: thread.id,
      expert_id: null,
      role: 'system',
      content: joinMsg,
      created_at: new Date().toISOString(),
    },
  });

  broadcastGlobal({ type: 'thread_list_update' });

  res.json({ ok: true, expert: { id: expert.id, name: expert.name, avatar_url: expert.avatar_url } });
});

// DELETE /api/threads/:id/experts/:expertId — remove expert from thread
router.delete('/:id/experts/:expertId', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  if (thread.status === 'concluded') {
    return res.status(400).json({ error: 'Thread is concluded' });
  }

  const expertId = Number(req.params.expertId);
  const existing = db.prepare(
    'SELECT 1 FROM thread_experts WHERE thread_id = ? AND expert_id = ?'
  ).get(thread.id, expertId);
  if (!existing) return res.status(400).json({ error: 'Expert is not in this thread' });

  const expertCount = db.prepare(
    'SELECT COUNT(*) as count FROM thread_experts WHERE thread_id = ?'
  ).get(thread.id);
  if (expertCount.count <= 1) {
    return res.status(400).json({ error: 'Cannot remove the last expert from a thread' });
  }

  const expert = db.prepare('SELECT * FROM experts WHERE id = ?').get(expertId);

  const lang = getLanguage(thread.language);
  const leaveMsg = t(lang.leftMessage, { expertName: expert.name });

  const removeExpert = db.transaction(() => {
    db.prepare('DELETE FROM thread_experts WHERE thread_id = ? AND expert_id = ?')
      .run(thread.id, expertId);

    const msgResult = db.prepare(
      "INSERT INTO messages (thread_id, expert_id, role, content) VALUES (?, NULL, 'system', ?)"
    ).run(thread.id, leaveMsg);

    return Number(msgResult.lastInsertRowid);
  });

  const msgId = removeExpert();

  console.log(`${threadTag(thread)} ${expert.name} removed`);

  broadcast(thread.id, {
    type: 'new_message',
    message: {
      id: msgId,
      thread_id: thread.id,
      expert_id: null,
      role: 'system',
      content: leaveMsg,
      created_at: new Date().toISOString(),
    },
  });

  broadcastGlobal({ type: 'thread_list_update' });

  res.json({ ok: true });
});

export default router;
