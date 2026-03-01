import db from './db.js';

/**
 * Run on server startup to detect and roll back broken last messages
 * in active threads. This handles cases where the server was killed
 * mid-response (e.g., message saved but turn counter not updated,
 * or a truncated LLM response was stored).
 */
export function runStartupChecks() {
  console.log('Running startup integrity checks...');

  const activeThreads = db
    .prepare("SELECT * FROM threads WHERE status = 'active'")
    .all();

  let rolledBack = 0;

  for (const thread of activeThreads) {
    if (checkAndFixThread(thread)) rolledBack++;
  }

  if (rolledBack > 0) {
    console.log(`Startup checks: rolled back ${rolledBack} broken message(s).`);
  } else {
    console.log('Startup checks: all threads OK.');
  }
}

function checkAndFixThread(thread) {
  // Get the last message in this thread
  const lastMessage = db
    .prepare(
      'SELECT * FROM messages WHERE thread_id = ? ORDER BY id DESC LIMIT 1'
    )
    .get(thread.id);

  if (!lastMessage || lastMessage.role !== 'expert') return false;

  // Check 1: Turn counter vs actual expert message count
  // After N expert messages, current_turn should be N.
  // If expert count > current_turn, the server crashed between INSERT and UPDATE.
  const expertCount = db
    .prepare(
      "SELECT COUNT(*) as count FROM messages WHERE thread_id = ? AND role = 'expert'"
    )
    .get(thread.id).count;

  const turnMismatch = expertCount > thread.current_turn;

  // Check 2: Last message content looks truncated
  const truncated = looksIncomplete(lastMessage.content);

  if (!turnMismatch && !truncated) return false;

  const reasons = [];
  if (turnMismatch) reasons.push('turn counter mismatch');
  if (truncated) reasons.push('content appears truncated');

  console.warn(
    `[Thread ${thread.id}] Rolling back last message (id=${lastMessage.id}): ${reasons.join(', ')}`
  );

  // Delete the broken message and fix the turn counter
  const rollback = db.transaction(() => {
    db.prepare('DELETE FROM messages WHERE id = ?').run(lastMessage.id);
    // Set turn counter to match the remaining expert message count
    const remaining = expertCount - 1;
    db.prepare('UPDATE threads SET current_turn = ? WHERE id = ?').run(
      remaining,
      thread.id
    );
  });
  rollback();

  return true;
}

function looksIncomplete(content) {
  if (!content || content.trim().length === 0) return true;

  const trimmed = content.trim();

  // Very short content is suspicious (< 20 chars for an expert response)
  if (trimmed.length < 20) return true;

  // Check if the message ends with reasonable terminal punctuation.
  // Expert responses should end with a complete sentence or structure.
  const lastChar = trimmed[trimmed.length - 1];
  const terminalChars = '.!?"\':;)]*—-';

  return !terminalChars.includes(lastChar);
}
