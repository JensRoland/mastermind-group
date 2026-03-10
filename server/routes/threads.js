import { Router } from 'express';
import db from '../db.js';
import { broadcast, broadcastGlobal } from '../ws.js';
import { getThinkingExpert } from '../orchestrator.js';
import { DEFAULT_MAX_TURNS } from '../config.js';
import { getModeratorName } from '../auth.js';

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
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });

  // If concluded, reopen the thread with extended turns
  if (thread.status === 'concluded') {
    const extraTurns = 10;
    const newMaxTurns = thread.current_turn + extraTurns;
    db.prepare('UPDATE threads SET status = ?, max_turns = ?, wrapping_up = 0 WHERE id = ?')
      .run('active', newMaxTurns, thread.id);
    console.log(`${threadTag(thread)} Reopened via user message (extended to ${newMaxTurns} turns)`);

    const modLabel = getModeratorName() || 'The moderator';
    const reopenText = `${modLabel} has reopened the discussion.`;
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

  const modLabel = getModeratorName() || 'The moderator';
  const wrapupMessage = `${modLabel} has asked the group to wrap up. Each participant should provide their concluding thoughts, key takeaways, and any actionable recommendations. Be concise and direct.`;

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
    `SELECT e.name FROM thread_experts te
     JOIN experts e ON e.id = te.expert_id
     WHERE te.thread_id = ? ORDER BY te.sort_order`
  ).all(thread.id);

  let md = `# ${thread.title}\n\n`;
  md += `**Topic:** ${thread.topic}\n\n`;
  md += `**Participants:** ${experts.map(e => e.name).join(', ')}\n\n`;
  md += `**Date:** ${thread.created_at} UTC\n\n`;
  md += `> **Disclaimer:** This is a simulated roundtable discussion generated by AI. The participants are fictional personas powered by large language models. Their statements do not represent the views of any real individuals and must not be attributed to any actual persons, living or dead.\n\n`;
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

    db.prepare('UPDATE threads SET status = ?, current_turn = ?, wrapping_up = 0 WHERE id = ?')
      .run('paused', newTurn, thread.id);

    return newTurn;
  });

  const newTurn = rollback();

  console.log(`${threadTag(thread)} Rolled back to message ${messageId} (turn ${newTurn})`);

  broadcast(thread.id, {
    type: 'messages_rollback',
    threadId: thread.id,
    messageId,
    current_turn: newTurn,
  });

  broadcast(thread.id, {
    type: 'thread_status',
    threadId: thread.id,
    status: 'paused',
    max_turns: thread.max_turns,
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

  const addExpert = db.transaction(() => {
    db.prepare('INSERT INTO thread_experts (thread_id, expert_id, sort_order) VALUES (?, ?, ?)')
      .run(thread.id, expertId, nextOrder);

    const msgResult = db.prepare(
      "INSERT INTO messages (thread_id, expert_id, role, content) VALUES (?, NULL, 'system', ?)"
    ).run(thread.id, `${expert.name} has joined the discussion.`);

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
      content: `${expert.name} has joined the discussion.`,
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

  const removeExpert = db.transaction(() => {
    db.prepare('DELETE FROM thread_experts WHERE thread_id = ? AND expert_id = ?')
      .run(thread.id, expertId);

    const msgResult = db.prepare(
      "INSERT INTO messages (thread_id, expert_id, role, content) VALUES (?, NULL, 'system', ?)"
    ).run(thread.id, `${expert.name} has left the discussion.`);

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
      content: `${expert.name} has left the discussion.`,
      created_at: new Date().toISOString(),
    },
  });

  broadcastGlobal({ type: 'thread_list_update' });

  res.json({ ok: true });
});

export default router;
