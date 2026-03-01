import 'dotenv/config';
import readline from 'readline';
import { setPassword, hasPassword } from './auth.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
  if (hasPassword()) {
    const answer = await question('A password already exists. Overwrite? (y/N): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.');
      rl.close();
      process.exit(0);
    }
  }

  const password = await question('Set login password: ');
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
