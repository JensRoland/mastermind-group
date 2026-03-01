import db from './db.js';
import { callLLM } from './llm.js';
import { buildSystemPrompt, buildMessageHistory } from './prompts.js';
import { broadcast, broadcastGlobal } from './ws.js';

const TICK_INTERVAL = 5000;
const MESSAGE_HISTORY_LIMIT = 50;

let isProcessing = false;

export function startOrchestrator() {
  setInterval(tick, TICK_INTERVAL);
  console.log('Orchestrator started (tick every %dms)', TICK_INTERVAL);
}

async function tick() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const activeThreads = db
      .prepare("SELECT * FROM threads WHERE status = 'active'")
      .all();

    for (const thread of activeThreads) {
      await processThread(thread);
    }
  } catch (err) {
    console.error('Orchestrator error:', err);
  } finally {
    isProcessing = false;
  }
}

async function processThread(thread) {
  // Check if max turns reached
  if (thread.current_turn >= thread.max_turns) {
    db.prepare("UPDATE threads SET status = 'paused' WHERE id = ?").run(thread.id);

    // Insert a system message explaining the pause
    db.prepare(
      "INSERT INTO messages (thread_id, expert_id, role, content) VALUES (?, NULL, 'system', ?)"
    ).run(thread.id, 'The discussion has been paused after reaching the maximum number of turns. The moderator can extend the discussion or wrap it up.');

    broadcast(thread.id, {
      type: 'thread_status',
      threadId: thread.id,
      status: 'paused',
    });
    broadcastGlobal({ type: 'thread_list_update' });
    return;
  }

  // Get experts in this thread
  const experts = db.prepare(
    `SELECT e.*, te.sort_order FROM thread_experts te
     JOIN experts e ON e.id = te.expert_id
     WHERE te.thread_id = ? ORDER BY te.sort_order`
  ).all(thread.id);

  if (experts.length === 0) return;

  // Round-robin: pick the next expert
  const expertIndex = thread.current_turn % experts.length;
  const currentExpert = experts[expertIndex];

  // Get message history
  const allMessages = db.prepare(
    `SELECT m.*, e.name as expert_name
     FROM messages m LEFT JOIN experts e ON m.expert_id = e.id
     WHERE m.thread_id = ?
     ORDER BY m.created_at ASC`
  ).all(thread.id);

  const recentMessages = allMessages.slice(-MESSAGE_HISTORY_LIMIT);

  // Build the LLM request
  const systemPrompt = buildSystemPrompt(currentExpert, thread, experts);
  const history = buildMessageHistory(recentMessages, currentExpert.id);

  const llmMessages = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  try {
    const responseContent = await callLLM(currentExpert.llm_model, llmMessages);

    // Save the message
    const result = db.prepare(
      "INSERT INTO messages (thread_id, expert_id, role, content) VALUES (?, ?, 'expert', ?)"
    ).run(thread.id, currentExpert.id, responseContent);

    // Increment turn counter
    db.prepare('UPDATE threads SET current_turn = current_turn + 1 WHERE id = ?')
      .run(thread.id);

    // Broadcast to connected clients
    broadcast(thread.id, {
      type: 'new_message',
      message: {
        id: Number(result.lastInsertRowid),
        thread_id: thread.id,
        expert_id: currentExpert.id,
        expert_name: currentExpert.name,
        avatar_url: currentExpert.avatar_url,
        role: 'expert',
        content: responseContent,
        created_at: new Date().toISOString(),
      },
    });

    broadcastGlobal({
      type: 'thread_list_update',
    });

    console.log(`[Thread ${thread.id}] ${currentExpert.name} responded (turn ${thread.current_turn + 1}/${thread.max_turns})`);
  } catch (err) {
    console.error(`[Thread ${thread.id}] LLM error for ${currentExpert.name}:`, err.message);
    // Skip this turn on error — will retry next tick
  }
}
