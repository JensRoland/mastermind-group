import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { callLLM } from '../llm.js';
import { buildAuditionPrompt } from '../prompts.js';
import { broadcastGlobal } from '../ws.js';

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
     ORDER BY e.specialty, e.name`
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
  const { name, description, llm_model, avatar_url, specialty } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: 'Name and description are required' });
  }

  const result = db.prepare(
    'INSERT INTO experts (name, description, llm_model, specialty) VALUES (?, ?, ?, ?)'
  ).run(name, description, llm_model || 'anthropic/claude-sonnet-4', specialty || 'General');

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

  const { name, description, llm_model, avatar_url, specialty } = req.body;

  db.prepare(
    'UPDATE experts SET name = ?, description = ?, llm_model = ?, specialty = ? WHERE id = ?'
  ).run(
    name || expert.name,
    description || expert.description,
    llm_model || expert.llm_model,
    specialty || expert.specialty,
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

// PATCH /api/experts/bulk-specialty
router.patch('/bulk-specialty', (req, res) => {
  const { ids, specialty } = req.body;
  if (!Array.isArray(ids) || ids.length === 0 || !specialty?.trim()) {
    return res.status(400).json({ error: 'ids (array) and specialty (string) are required' });
  }

  const placeholders = ids.map(() => '?').join(',');
  db.prepare(
    `UPDATE experts SET specialty = ? WHERE id IN (${placeholders})`
  ).run(specialty.trim(), ...ids);

  const updated = db.prepare(
    `SELECT e.*,
            (SELECT COUNT(*) FROM message_likes ml
             JOIN messages m ON m.id = ml.message_id
             WHERE m.expert_id = e.id) as total_likes
     FROM experts e
     WHERE e.id IN (${placeholders})`
  ).all(...ids);

  res.json(updated);
});

// POST /api/experts/:id/audition
let auditionCounter = 0;
let activeAuditions = 0;
router.post('/:id/audition', async (req, res) => {
  if (activeAuditions >= 2) {
    return res.status(429).json({ error: 'Too many auditions running. Please wait for the current one to finish.' });
  }

  const expert = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.id);
  if (!expert) return res.status(404).json({ error: 'Expert not found' });

  const { questions, models, judgeModel, customCriteria } = req.body;
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'At least one question is required' });
  }
  if (!Array.isArray(models) || models.length < 2) {
    return res.status(400).json({ error: 'At least two models are required' });
  }
  if (!judgeModel) {
    return res.status(400).json({ error: 'Judge model is required' });
  }

  const auditionId = `audition_${++auditionCounter}_${Date.now()}`;
  res.json({ auditionId });

  const send = (data) => broadcastGlobal({ ...data, auditionId });

  // Run audition async — progress is pushed via WebSocket
  activeAuditions++;
  (async () => {
    try {
      const systemPrompt = buildAuditionPrompt(expert);
      const modelResults = {};
      let completed = 0;

      send({ type: 'audition_progress', stage: 'testing', current: 0, total: models.length });

      await Promise.all(models.map(async (modelId) => {
        const responses = await Promise.all(questions.map(async (q) => {
          try {
            const answer = await callLLM(modelId, [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: q.text },
            ]);
            return { question: q.text, answer };
          } catch (err) {
            return { question: q.text, answer: `[Error: ${err.message}]` };
          }
        }));
        modelResults[modelId] = responses;
        completed++;
        send({ type: 'audition_progress', stage: 'testing', current: completed, total: models.length });
      }));

      // Fisher-Yates shuffle for unbiased blind labeling
      const shuffled = [...models];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const labelMap = {};
      shuffled.forEach((modelId, i) => { labelMap[labels[i]] = modelId; });

      // Build judge prompt
      const questionsBlock = questions.map((q, i) => {
        const expected = q.expectedAnswer?.trim()
          ? `\n   Expected answer: ${q.expectedAnswer}`
          : '';
        return `${i + 1}. ${q.text}${expected}`;
      }).join('\n');

      const candidatesBlock = shuffled.map((modelId, i) => {
        const label = labels[i];
        const responses = modelResults[modelId];
        const answersText = responses.map((r, j) =>
          `Q${j + 1}: ${r.answer}`
        ).join('\n\n');
        return `=== Candidate ${label} ===\n${answersText}`;
      }).join('\n\n');

      const judgePrompt = `You are evaluating how well different candidates embody a specific expert persona in a roundtable discussion setting.

The persona being evaluated:
Name: ${expert.name}
Description: ${expert.description}

The following control questions were posed to each candidate, who was instructed to respond fully in character as ${expert.name}:

Questions:
${questionsBlock}

Below are the responses from each candidate:

${candidatesBlock}

Evaluate each candidate holistically on:
${customCriteria?.trim()
  ? `The evaluator has specified these criteria:\n${customCriteria.trim()}\n\nUse these as your PRIMARY evaluation criteria. Additionally consider general persona authenticity and knowledge accuracy.`
  : `1. Persona authenticity — How well do they capture this expert's voice, thinking style, rhetoric, and perspective?
2. Knowledge accuracy — How well do their answers reflect this expert's known positions, frameworks, and expertise?
3. Answer quality — Where expected answers are provided, how close are they? Where not, how convincing and insightful is the response?`}

Rank all candidates from best to worst. For each, give a score from 1-10 and a concise explanation of strengths and weaknesses.

Respond in this EXACT JSON format and nothing else:
{"rankings":[{"candidate":"A","score":8.5,"reasoning":"..."},{"candidate":"B","score":7.2,"reasoning":"..."}]}`;

      send({ type: 'audition_progress', stage: 'judging' });

      const judgeResponse = await callLLM(judgeModel, [
        { role: 'user', content: judgePrompt },
      ]);

      // Parse judge response — strip markdown fences, then parse JSON
      let rankings;
      try {
        const cleaned = judgeResponse.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        rankings = parsed.rankings;
      } catch {
        send({ type: 'audition_error', message: 'Failed to parse judge response.', raw: judgeResponse });
        return;
      }

      // Map labels back to model IDs, filtering any hallucinated candidates
      const results = rankings
        .filter(r => labelMap[r.candidate])
        .map(r => ({
          candidate: r.candidate,
          modelId: labelMap[r.candidate],
          score: r.score,
          reasoning: r.reasoning,
          responses: modelResults[labelMap[r.candidate]],
        }));

      send({ type: 'audition_result', rankings: results });
    } catch (err) {
      console.error('Audition error:', err.message);
      send({ type: 'audition_error', message: err.message });
    } finally {
      activeAuditions--;
    }
  })().catch(err => console.error('Audition IIFE unhandled:', err));
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
