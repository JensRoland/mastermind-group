import { Router } from 'express';
import db from '../db.js';
import { broadcast, broadcastGlobal } from '../ws.js';

const router = Router();

// POST /api/messages/:id/like — toggle like on/off
router.post('/:id/like', (req, res) => {
  const messageId = Number(req.params.id);

  const message = db.prepare(
    'SELECT id, thread_id, expert_id, role FROM messages WHERE id = ?'
  ).get(messageId);

  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (message.role !== 'expert') return res.status(400).json({ error: 'Only expert messages can be liked' });

  const existing = db.prepare(
    'SELECT message_id FROM message_likes WHERE message_id = ?'
  ).get(messageId);

  let liked;
  if (existing) {
    db.prepare('DELETE FROM message_likes WHERE message_id = ?').run(messageId);
    liked = false;
  } else {
    db.prepare('INSERT INTO message_likes (message_id) VALUES (?)').run(messageId);
    liked = true;
  }

  const totalLikes = db.prepare(
    `SELECT COUNT(*) as count FROM message_likes ml
     JOIN messages m ON m.id = ml.message_id
     WHERE m.expert_id = ?`
  ).get(message.expert_id).count;

  broadcast(message.thread_id, {
    type: 'message_liked',
    messageId,
    liked,
  });

  broadcastGlobal({
    type: 'expert_likes_update',
    expertId: message.expert_id,
    totalLikes,
  });

  res.json({ liked, totalLikes });
});

export default router;
