import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, 'seed-experts.json');

const experts = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

const insert = db.prepare(
  'INSERT INTO experts (name, description) VALUES (?, ?)'
);
const exists = db.prepare('SELECT 1 FROM experts WHERE name = ?');

let added = 0;
let skipped = 0;

for (const expert of experts) {
  if (exists.get(expert.name)) {
    skipped++;
    console.log(`  skip: ${expert.name} (already exists)`);
  } else {
    insert.run(expert.name, expert.description);
    added++;
    console.log(`  added: ${expert.name}`);
  }
}

console.log(`\nDone. Added ${added}, skipped ${skipped}.`);
