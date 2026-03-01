import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { api } from '../api.js';
import { subscribe, unsubscribe, onMessage } from '../ws.js';
import MessageBubble from './MessageBubble.jsx';
import '../styles/thread.css';

export default function ThreadView(props) {
  const [thread, setThread] = createSignal(null);
  const [messages, setMessages] = createSignal([]);
  const [experts, setExperts] = createSignal([]);
  const [inputText, setInputText] = createSignal('');
  const [sending, setSending] = createSignal(false);
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
      subscribe(id);
      scrollToBottom();
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
  });

  // Listen for WebSocket messages
  onMount(() => {
    const removeListener = onMessage((data) => {
      if (data.type === 'new_message' && data.message.thread_id === props.threadId) {
        setMessages(prev => [...prev, data.message]);
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
            <button class="danger" onClick={handleWrapUp} disabled={!isActive()}>
              Wrap It Up
            </button>
          </div>
        </header>

        <div class="messages-container">
          <For each={messages()}>
            {(msg) => <MessageBubble message={msg} />}
          </For>
          <div ref={messagesEnd} />
        </div>

        <footer class="message-input">
          <input
            type="text"
            placeholder={isActive() ? "Interrupt with a question or comment..." : "Thread is " + thread().status}
            value={inputText()}
            onInput={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            disabled={!isActive() || sending()}
          />
          <button onClick={sendMessage} disabled={!isActive() || sending() || !inputText().trim()}>
            Send
          </button>
        </footer>
      </div>
    </Show>
  );
}
