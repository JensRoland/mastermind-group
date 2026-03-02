import { Router } from 'express';
import db from '../db.js';
import { broadcast, broadcastGlobal } from '../ws.js';
import { getThinkingExpert } from '../orchestrator.js';
import { DEFAULT_MAX_TURNS } from '../config.js';

const router = Router();

function threadTag(thread) {
  const t = thread.title.length > 32 ? thread.title.slice(0, 32) + '…' : thread.title;
  return `[${t}]`;
}

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
  const { title, topic, expertIds, maxTurns } = req.body;
  if (!title || !topic || !expertIds?.length || expertIds.length < 2) {
    return res.status(400).json({ error: 'Title, topic, and at least 2 experts are required' });
  }

  const insertThread = db.prepare(
    'INSERT INTO threads (title, topic, max_turns) VALUES (?, ?, ?)'
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
    const result = insertThread.run(title, topic, maxTurns || DEFAULT_MAX_TURNS);
    const threadId = Number(result.lastInsertRowid);

    expertIds.forEach((eid, i) => {
      insertExpert.run(threadId, eid, i);
    });

    // Build participant list for the opening system message
    const experts = expertIds.map(eid => getExpert.get(eid)).filter(Boolean);
    const participantList = experts.map(e => e.name).join(', ');
    insertSystemMsg.run(threadId, `Participants: ${participantList}`);

    // Seed with the topic as the first message
    insertMsg.run(threadId, topic);

    return threadId;
  });

  const threadId = createThread();
  console.log(`[${title.length > 32 ? title.slice(0, 32) + '…' : title}] New thread started with ${expertIds.length} experts (max ${maxTurns || DEFAULT_MAX_TURNS} turns)`);
  broadcastGlobal({ type: 'thread_list_update' });
  res.status(201).json({ id: threadId });
});

// POST /api/threads/:id/message — user interruption
router.post('/:id/message', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  if (thread.status === 'concluded') {
    return res.status(400).json({ error: 'Thread is concluded' });
  }

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });

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

  const wrapupMessage = 'The moderator has asked the group to wrap up. Each participant should provide their concluding thoughts, key takeaways, and any actionable recommendations. Be concise and direct.';

  db.prepare(
    "INSERT INTO messages (thread_id, expert_id, role, content) VALUES (?, NULL, 'system', ?)"
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

// PATCH /api/threads/:id/archive
router.patch('/:id/archive', (req, res) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  db.prepare('UPDATE threads SET archived = 1 WHERE id = ?').run(thread.id);
  console.log(`${threadTag(thread)} Archived`);

  broadcastGlobal({ type: 'thread_list_update' });
  res.json({ ok: true });
});

export default router;
