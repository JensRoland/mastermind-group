import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { callLLM } from '../llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const avatarDir = path.join(__dirname, '..', '..', 'public', 'avatars');

fs.mkdirSync(avatarDir, { recursive: true });

const router = Router();

// POST /api/experts/generate-description
router.post('/generate-description', async (req, res) => {
  const { name, disambiguator } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Expert name is required' });
  }

  const disambiguatorLine = disambiguator?.trim()
    ? `\nNote: "${name.trim()}" refers to: ${disambiguator.trim()}\n`
    : '';

  try {
    const description = await callLLM('anthropic/claude-opus-4.6', [
      {
        role: 'user',
        content: `Write a persona description for an AI roundtable expert named "${name.trim()}".
${disambiguatorLine}
The description should be 3-5 sentences that capture:
- Who this person is (their role, accomplishments, domain expertise)
- Their key ideas, frameworks, or intellectual contributions
- Their communication style and how they think
- What makes their perspective distinctive in a group discussion

The description will be used as a system prompt to make an AI embody this person in roundtable discussions with other experts. It should be specific enough to produce distinct, recognizable behavior.

Write ONLY the description paragraph — no preamble, no quotes, no labels. Write in third person present tense (e.g., "Known for..." not "You are known for...").`,
      },
    ]);
    res.json({ description });
  } catch (err) {
    console.error('Description generation error:', err.message);
    res.status(500).json({ error: 'Failed to generate description' });
  }
});

async function processAvatar(imageUrl, expertId) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());

    // Get image metadata to determine crop region for center square
    const metadata = await sharp(buffer).metadata();
    const size = Math.min(metadata.width, metadata.height);
    const left = Math.floor((metadata.width - size) / 2);
    const top = Math.floor((metadata.height - size) / 2);

    const outputPath = path.join(avatarDir, `${expertId}.png`);
    await sharp(buffer)
      .extract({ left, top, width: size, height: size })
      .resize(150, 150)
      .png()
      .toFile(outputPath);

    return `/avatars/${expertId}.png`;
  } catch (err) {
    console.error('Avatar processing error:', err.message);
    return null;
  }
}

// GET /api/experts
router.get('/', (req, res) => {
  const experts = db.prepare(
    `SELECT e.*,
            (SELECT COUNT(*) FROM message_likes ml
             JOIN messages m ON m.id = ml.message_id
             WHERE m.expert_id = e.id) as total_likes
     FROM experts e
     ORDER BY e.created_at DESC`
  ).all();
  res.json(experts);
});

// GET /api/experts/:id
router.get('/:id', (req, res) => {
  const expert = db.prepare(
    `SELECT e.*,
            (SELECT COUNT(*) FROM message_likes ml
             JOIN messages m ON m.id = ml.message_id
             WHERE m.expert_id = e.id) as total_likes
     FROM experts e
     WHERE e.id = ?`
  ).get(req.params.id);
  if (!expert) return res.status(404).json({ error: 'Expert not found' });
  res.json(expert);
});

// POST /api/experts
router.post('/', async (req, res) => {
  const { name, description, llm_model, avatar_url } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: 'Name and description are required' });
  }

  const result = db.prepare(
    'INSERT INTO experts (name, description, llm_model) VALUES (?, ?, ?)'
  ).run(name, description, llm_model || 'anthropic/claude-sonnet-4');

  const expertId = Number(result.lastInsertRowid);

  // Process avatar if URL provided
  if (avatar_url) {
    const localPath = await processAvatar(avatar_url, expertId);
    if (localPath) {
      db.prepare('UPDATE experts SET avatar_url = ? WHERE id = ?').run(localPath, expertId);
    }
  }

  const expert = db.prepare('SELECT * FROM experts WHERE id = ?').get(expertId);
  res.status(201).json(expert);
});

// PUT /api/experts/:id
router.put('/:id', async (req, res) => {
  const expert = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.id);
  if (!expert) return res.status(404).json({ error: 'Expert not found' });

  const { name, description, llm_model, avatar_url } = req.body;

  db.prepare(
    'UPDATE experts SET name = ?, description = ?, llm_model = ? WHERE id = ?'
  ).run(
    name || expert.name,
    description || expert.description,
    llm_model || expert.llm_model,
    expert.id
  );

  // Process new avatar if URL provided and different
  if (avatar_url && avatar_url !== expert.avatar_url) {
    const localPath = await processAvatar(avatar_url, expert.id);
    if (localPath) {
      db.prepare('UPDATE experts SET avatar_url = ? WHERE id = ?').run(localPath, expert.id);
    }
  }

  const updated = db.prepare('SELECT * FROM experts WHERE id = ?').get(expert.id);
  res.json(updated);
});

// DELETE /api/experts/:id
router.delete('/:id', (req, res) => {
  const expert = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.id);
  if (!expert) return res.status(404).json({ error: 'Expert not found' });

  db.prepare('DELETE FROM experts WHERE id = ?').run(expert.id);

  // Remove avatar file
  const avatarPath = path.join(avatarDir, `${expert.id}.png`);
  if (fs.existsSync(avatarPath)) {
    fs.unlinkSync(avatarPath);
  }

  res.json({ ok: true });
});

export default router;
