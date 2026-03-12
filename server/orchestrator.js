import db from './db.js';
import { callLLM } from './llm.js';
import { buildSystemPrompt, buildWrapUpSystemPrompt, buildMessageHistory, buildSummaryPrompt, buildSummaryHistory } from './prompts.js';
import { broadcast, broadcastGlobal } from './ws.js';
import { getModeratorName } from './auth.js';
import { getLanguage } from './languages.js';

const TICK_INTERVAL = 5000;
const MESSAGE_HISTORY_LIMIT = 50;
const SUMMARY_MODEL = 'openai/gpt-5.2';

let isProcessing = false;
let firstTick = true;

// Track which expert is currently "thinking" per thread (threadId -> expert info)
const thinkingExperts = new Map();

export function getThinkingExpert(threadId) {
  return thinkingExperts.get(threadId) || null;
}

function threadTag(thread) {
  const t = thread.title.length > 32 ? thread.title.slice(0, 32) + '…' : thread.title;
  return `[${t}]`;
}

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

    if (firstTick && activeThreads.length > 0) {
      for (const t of activeThreads) {
        console.log(`${threadTag(t)} Resuming active thread (turn ${t.current_turn}/${t.max_turns})`);
      }
    }
    firstTick = false;

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
    if (thread.wrapping_up) {
      // Wrap-up complete — generate moderator summary, then conclude
      await generateSummary(thread);
      return;
    }

    db.prepare("UPDATE threads SET status = 'paused' WHERE id = ?").run(thread.id);

    const lang = getLanguage(thread.language);
    db.prepare(
      "INSERT INTO messages (thread_id, expert_id, role, content, message_type) VALUES (?, NULL, 'system', ?, 'status')"
    ).run(thread.id, lang.pausedMessage);

    console.log(`${threadTag(thread)} Paused (reached ${thread.max_turns} turns)`);

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

  // Build the LLM request (use wrap-up prompt if thread is wrapping up)
  const moderatorName = getModeratorName();
  const systemPrompt = thread.wrapping_up
    ? buildWrapUpSystemPrompt(currentExpert, thread, experts, moderatorName)
    : buildSystemPrompt(currentExpert, thread, experts, moderatorName);
  const history = buildMessageHistory(recentMessages, currentExpert.id, moderatorName);

  const llmMessages = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  try {
    // Notify clients that this expert is thinking
    const thinkingInfo = {
      id: currentExpert.id,
      name: currentExpert.name,
      avatar_url: currentExpert.avatar_url,
    };
    thinkingExperts.set(thread.id, thinkingInfo);
    broadcast(thread.id, { type: 'thinking', expert: thinkingInfo });

    console.log(`${threadTag(thread)} Requesting response from ${currentExpert.name} (${currentExpert.llm_model})...`);
    const responseContent = await callLLM(currentExpert.llm_model, llmMessages);

    // Save the message and increment turn counter atomically
    const saveMessage = db.transaction(() => {
      const result = db.prepare(
        "INSERT INTO messages (thread_id, expert_id, role, content, llm_model) VALUES (?, ?, 'expert', ?, ?)"
      ).run(thread.id, currentExpert.id, responseContent, currentExpert.llm_model);
      db.prepare('UPDATE threads SET current_turn = current_turn + 1 WHERE id = ?')
        .run(thread.id);
      return result;
    });
    const result = saveMessage();

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
        llm_model: currentExpert.llm_model,
        created_at: new Date().toISOString(),
        liked: 0,
      },
    });

    broadcast(thread.id, {
      type: 'thread_status',
      threadId: thread.id,
      status: thread.status,
      current_turn: thread.current_turn + 1,
    });

    broadcastGlobal({
      type: 'thread_list_update',
    });

    thinkingExperts.delete(thread.id);

    console.log(`${threadTag(thread)} ${currentExpert.name} responded (turn ${thread.current_turn + 1}/${thread.max_turns})`);
  } catch (err) {
    thinkingExperts.delete(thread.id);
    console.error(`${threadTag(thread)} LLM error for ${currentExpert.name}:`, err.message);
    // Skip this turn on error — will retry next tick
  }
}

async function generateSummary(thread) {
  const experts = db.prepare(
    `SELECT e.*, te.sort_order FROM thread_experts te
     JOIN experts e ON e.id = te.expert_id
     WHERE te.thread_id = ? ORDER BY te.sort_order`
  ).all(thread.id);

  const allMessages = db.prepare(
    `SELECT m.*, e.name as expert_name
     FROM messages m LEFT JOIN experts e ON m.expert_id = e.id
     WHERE m.thread_id = ?
     ORDER BY m.created_at ASC`
  ).all(thread.id);

  const moderatorName = getModeratorName();
  const summarySystemPrompt = buildSummaryPrompt(thread, experts, moderatorName);
  const summaryHistory = buildSummaryHistory(allMessages, moderatorName);

  const llmMessages = [
    { role: 'system', content: summarySystemPrompt },
    ...summaryHistory,
  ];

  try {
    // Notify clients that the moderator is summarizing
    const thinkingInfo = { id: null, name: moderatorName || 'Moderator', avatar_url: null };
    thinkingExperts.set(thread.id, thinkingInfo);
    broadcast(thread.id, { type: 'thinking', expert: thinkingInfo });

    const lang = getLanguage(thread.language);

    console.log(`${threadTag(thread)} Generating moderator summary (${SUMMARY_MODEL})...`);
    const summaryContent = await callLLM(SUMMARY_MODEL, llmMessages);

    const fullContent = `${lang.summaryHeading}\n\n${summaryContent}`;

    const result = db.prepare(
      "INSERT INTO messages (thread_id, expert_id, role, content, llm_model) VALUES (?, NULL, 'system', ?, ?)"
    ).run(thread.id, fullContent, SUMMARY_MODEL);

    db.prepare("UPDATE threads SET status = 'concluded', wrapping_up = 0 WHERE id = ?")
      .run(thread.id);

    thinkingExperts.delete(thread.id);

    console.log(`${threadTag(thread)} Summary generated — thread concluded`);

    broadcast(thread.id, {
      type: 'new_message',
      message: {
        id: Number(result.lastInsertRowid),
        thread_id: thread.id,
        expert_id: null,
        expert_name: null,
        role: 'system',
        content: fullContent,
        llm_model: SUMMARY_MODEL,
        created_at: new Date().toISOString(),
      },
    });

    broadcast(thread.id, {
      type: 'thread_status',
      threadId: thread.id,
      status: 'concluded',
    });

    broadcastGlobal({ type: 'thread_list_update' });
  } catch (err) {
    thinkingExperts.delete(thread.id);
    console.error(`${threadTag(thread)} Summary generation failed:`, err.message);
    // Fall back to pausing — moderator can retry or conclude manually
    const failLang = getLanguage(thread.language);
    db.prepare("UPDATE threads SET status = 'paused', wrapping_up = 0 WHERE id = ?")
      .run(thread.id);

    db.prepare(
      "INSERT INTO messages (thread_id, expert_id, role, content, message_type) VALUES (?, NULL, 'system', ?, 'status')"
    ).run(thread.id, failLang.summaryFailed);

    broadcast(thread.id, {
      type: 'thread_status',
      threadId: thread.id,
      status: 'paused',
    });
    broadcastGlobal({ type: 'thread_list_update' });
  }
}
