import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, 'seed-experts.json');
const seedAvatarDir = path.join(__dirname, 'seed-avatars');
const avatarDir = path.join(__dirname, '..', 'public', 'avatars');

fs.mkdirSync(avatarDir, { recursive: true });

const experts = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

const findByName = db.prepare('SELECT id FROM experts WHERE name = ?');
const insert = db.prepare('INSERT INTO experts (name, description, llm_model) VALUES (?, ?, ?)');
const update = db.prepare('UPDATE experts SET description = ?, llm_model = ?, avatar_url = ? WHERE id = ?');
const updateAvatar = db.prepare('UPDATE experts SET avatar_url = ? WHERE id = ?');

let added = 0;
let updated = 0;

for (const expert of experts) {
  const existing = findByName.get(expert.name);
  let expertId;

  if (existing) {
    expertId = existing.id;
    update.run(expert.description, expert.llm_model || 'anthropic/claude-sonnet-4', `/avatars/${expertId}.png`, expertId);
    console.log(`  updated: ${expert.name}`);
    updated++;
  } else {
    const result = insert.run(expert.name, expert.description, expert.llm_model || 'anthropic/claude-sonnet-4');
    expertId = Number(result.lastInsertRowid);
    updateAvatar.run(`/avatars/${expertId}.png`, expertId);
    console.log(`  added: ${expert.name}`);
    added++;
  }

  // Copy seed avatar to public/avatars/{id}.png
  if (expert.avatar) {
    const src = path.join(seedAvatarDir, expert.avatar);
    const dest = path.join(avatarDir, `${expertId}.png`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    } else {
      console.warn(`    avatar not found: ${expert.avatar}`);
    }
  }
}

// Ensure default avatar exists
const defaultSrc = path.join(seedAvatarDir, 'default.png');
const defaultDest = path.join(avatarDir, 'default.png');
if (fs.existsSync(defaultSrc) && !fs.existsSync(defaultDest)) {
  fs.copyFileSync(defaultSrc, defaultDest);
}

console.log(`\nDone. Added ${added}, updated ${updated}.`);
