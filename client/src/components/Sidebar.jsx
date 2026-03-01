import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
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

  const activeThreads = () => threads().filter(t => t.status === 'active');
  const pausedThreads = () => threads().filter(t => t.status === 'paused');
  const concludedThreads = () => threads().filter(t => t.status === 'concluded');

  function ThreadItem(threadProps) {
    const t = () => threadProps.thread;
    const isSelected = () => props.selectedThreadId() === t().id && props.activeView() === 'threads';

    return (
      <div
        class={`thread-item ${isSelected() ? 'selected' : ''}`}
        onClick={() => {
          props.setActiveView('threads');
          props.setSelectedThreadId(t().id);
        }}
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

  return (
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>Mastermind Group</h1>
        <div class="sidebar-nav">
          <button
            class={props.activeView() === 'threads' ? 'active' : ''}
            onClick={() => props.setActiveView('threads')}
          >
            Threads
          </button>
          <button
            class={props.activeView() === 'experts' ? 'active' : ''}
            onClick={() => props.setActiveView('experts')}
          >
            Experts
          </button>
        </div>
      </div>

      <div class="sidebar-content">
        <Show when={activeThreads().length > 0}>
          <div class="sidebar-section-label">Active</div>
          <For each={activeThreads()}>
            {(thread) => <ThreadItem thread={thread} />}
          </For>
        </Show>

        <Show when={pausedThreads().length > 0}>
          <div class="sidebar-section-label">Paused</div>
          <For each={pausedThreads()}>
            {(thread) => <ThreadItem thread={thread} />}
          </For>
        </Show>

        <Show when={concludedThreads().length > 0}>
          <div class="sidebar-section-label">Concluded</div>
          <For each={concludedThreads()}>
            {(thread) => <ThreadItem thread={thread} />}
          </For>
        </Show>

        <Show when={threads().length === 0}>
          <div class="empty-experts">No threads yet. Start a new discussion!</div>
        </Show>
      </div>

      <div class="sidebar-footer">
        <button class="new-thread-btn" onClick={() => props.onNewThread()}>
          + New Discussion
        </button>
      </div>
    </div>
  );
}
