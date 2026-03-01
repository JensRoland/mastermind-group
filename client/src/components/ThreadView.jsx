import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { api } from '../api.js';
import { subscribe, unsubscribe, onMessage } from '../ws.js';
import MessageBubble from './MessageBubble.jsx';
import '../styles/thread.css';

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ThreadView(props) {
  const [thread, setThread] = createSignal(null);
  const [messages, setMessages] = createSignal([]);
  const [experts, setExperts] = createSignal([]);
  const [inputText, setInputText] = createSignal('');
  const [sending, setSending] = createSignal(false);
  const [thinkingExpert, setThinkingExpert] = createSignal(null);
  let messagesEnd;

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEnd?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Load thread data when threadId changes
  createEffect(async () => {
    const id = props.threadId;
    if (!id) return;

    try {
      const data = await api.getThread(id);
      setThread(data.thread);
      setMessages(data.messages);
      setExperts(data.experts);
      setThinkingExpert(data.thinkingExpert || null);
      subscribe(id);
      scrollToBottom();
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
  });

  // Listen for WebSocket messages
  onMount(() => {
    const removeListener = onMessage((data) => {
      if (data.type === 'thinking' && data.expert) {
        setThinkingExpert(data.expert);
        scrollToBottom();
      }
      if (data.type === 'new_message' && data.message.thread_id === props.threadId) {
        setMessages(prev => [...prev, data.message]);
        setThinkingExpert(null);
        scrollToBottom();
      }
      if (data.type === 'thread_status' && data.threadId === props.threadId) {
        setThread(prev => prev ? {
          ...prev,
          status: data.status,
          ...(data.max_turns !== undefined ? { max_turns: data.max_turns } : {}),
          ...(data.current_turn !== undefined ? { current_turn: data.current_turn } : {}),
        } : prev);
      }
    });

    onCleanup(() => {
      removeListener();
      unsubscribe();
    });
  });

  async function sendMessage() {
    const content = inputText().trim();
    if (!content || sending()) return;

    setSending(true);
    try {
      await api.sendMessage(props.threadId, content);
      setInputText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }

  async function handleWrapUp() {
    try {
      const result = await api.wrapUp(props.threadId);
      setThread(prev => prev ? { ...prev, max_turns: result.max_turns, status: 'active' } : prev);
    } catch (err) {
      console.error('Failed to wrap up:', err);
    }
  }

  async function handleExtend() {
    try {
      const result = await api.extendTurns(props.threadId, 10);
      setThread(prev => prev ? { ...prev, max_turns: result.max_turns, status: result.status } : prev);
    } catch (err) {
      console.error('Failed to extend:', err);
    }
  }

  async function handlePauseResume() {
    const t = thread();
    if (!t) return;
    const newStatus = t.status === 'active' ? 'paused' : 'active';
    try {
      await api.setStatus(props.threadId, newStatus);
      setThread(prev => prev ? { ...prev, status: newStatus } : prev);
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  }

  const isActive = () => thread()?.status === 'active';
  const canInteract = () => thread()?.status === 'active' || thread()?.status === 'paused';

  return (
    <Show when={thread()} fallback={<div class="empty-state">Loading...</div>}>
      <div class="thread-view">
        <header class="thread-header">
          <h2>{thread().title}</h2>
          <div class="thread-meta">
            <span class="thread-created">{formatDateTime(thread().created_at)}</span>
            <span class="meta-separator">·</span>
            Turn {thread().current_turn} / {thread().max_turns}
            <span class={`status-badge ${thread().status}`}>{thread().status}</span>
          </div>
          <div class="thread-actions">
            <Show when={canInteract()}>
              <button onClick={handlePauseResume}>
                {isActive() ? 'Pause' : 'Resume'}
              </button>
            </Show>
            <button onClick={handleExtend} disabled={thread().status === 'concluded'}>
              +10 Turns
            </button>
            <button class="danger" onClick={handleWrapUp} disabled={!canInteract()}>
              Wrap It Up
            </button>
          </div>
        </header>

        <div class="messages-container">
          <div class="messages-inner">
            <For each={messages()}>
              {(msg) => <MessageBubble message={msg} />}
            </For>
            <Show when={thinkingExpert()}>
              {(expert) => (
                <div class="message-bubble thinking">
                  <div class="message-avatar">
                    {expert().avatar_url ? (
                      <img src={expert().avatar_url} alt={expert().name} />
                    ) : (
                      <div class="avatar-placeholder">
                        {expert().name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div class="message-body">
                    <div class="thinking-text">
                      {expert().id === null
                        ? 'Moderator is summarizing the discussion...'
                        : `${expert().name} is thinking...`}
                    </div>
                  </div>
                </div>
              )}
            </Show>
            <div ref={messagesEnd} />
          </div>
        </div>

        <footer class="message-input">
          <div class="message-input-inner">
            <input
              type="text"
              placeholder={canInteract() ? "Interrupt with a question or comment..." : "Thread is concluded"}
              value={inputText()}
              onInput={(e) => setInputText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              disabled={!canInteract() || sending()}
            />
            <button onClick={sendMessage} disabled={!canInteract() || sending() || !inputText().trim()}>
              Send
            </button>
          </div>
        </footer>
      </div>
    </Show>
  );
}
