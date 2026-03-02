import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import { setPassword, hasPassword } from './auth.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
  const argPassword = process.argv[2];

  if (hasPassword() && !argPassword) {
    const answer = await question('A password already exists. Overwrite? (y/N): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.');
      rl.close();
      process.exit(0);
    }
  }

  const password = argPassword || await question('Set login password: ');
  if (!password || password.length < 4) {
    console.log('Password must be at least 4 characters.');
    rl.close();
    process.exit(1);
  }

  await setPassword(password);
  console.log('Password set successfully.');
  rl.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
