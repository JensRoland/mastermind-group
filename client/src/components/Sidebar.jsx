import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { navigate } from '../App.jsx';
import { api } from '../api.js';
import { onMessage } from '../ws.js';
import '../styles/sidebar.css';

export default function Sidebar(props) {
  const [threads, setThreads] = createSignal([]);

  async function loadThreads() {
    try {
      const data = await api.getThreads();
      setThreads(data);
    } catch (err) {
      console.error('Failed to load threads:', err);
    }
  }

  onMount(() => {
    loadThreads();

    const removeListener = onMessage((data) => {
      if (data.type === 'thread_list_update') {
        loadThreads();
      }
    });

    onCleanup(removeListener);
  });

  function ThreadItem(threadProps) {
    const t = () => threadProps.thread;
    const isSelected = () => props.selectedThreadId() === t().id && props.activeView() === 'threads';

    return (
      <div
        class={`thread-item ${isSelected() ? 'selected' : ''}`}
        onClick={() => nav('threads', t().id)}
      >
        <div class="thread-item-title">
          <span class={`status-dot ${t().status}`} />
          {' '}{t().title}
        </div>
        <div class="thread-item-meta">
          <span class="thread-item-turns">{t().current_turn}/{t().max_turns} turns</span>
          <div class="thread-item-avatars">
            <For each={t().experts?.slice(0, 4)}>
              {(expert) => (
                <img src={expert.avatar_url} alt={expert.name} title={expert.name} />
              )}
            </For>
          </div>
        </div>
      </div>
    );
  }

  function nav(view, threadId) {
    if (props.onNavigate) {
      props.onNavigate(view, threadId);
    } else {
      navigate(view, threadId);
    }
  }

  return (
    <div class={`sidebar ${props.open?.() ? 'open' : ''}`}>
      <div class="sidebar-header">
        <a href="/"><img src="/logotype.png" alt="Mastermind Group" class="sidebar-logo" /></a>
        <div class="sidebar-nav">
          <a
            href="/"
            class={props.activeView() === 'threads' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); nav('threads'); }}
          >
            Sessions
          </a>
          <a
            href="/experts"
            class={props.activeView() === 'experts' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); nav('experts'); }}
          >
            Experts
          </a>
        </div>
      </div>

      <div class="sidebar-content">
        <Show when={props.activeView() === 'threads'}>
          <div class="sidebar-section-header">
            <button class="sidebar-add-btn" onClick={() => props.onNewThread()} title="New session">+</button>
          </div>
        </Show>
        <For each={threads()}>
          {(thread) => <ThreadItem thread={thread} />}
        </For>

        <Show when={threads().length === 0}>
          <div class="empty-experts">No threads yet. Start a new discussion!</div>
        </Show>
      </div>

    </div>
  );
}
