import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { navigate } from '../App.jsx';
import { api } from '../api.js';
import { onMessage } from '../ws.js';
import ConfirmDialog from './ConfirmDialog.jsx';
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

  const [archiveTarget, setArchiveTarget] = createSignal(null);

  async function confirmArchive() {
    const thread = archiveTarget();
    if (!thread) return;
    try {
      await api.archiveThread(thread.id);
    } catch (err) {
      console.error('Failed to archive thread:', err);
    }
    setArchiveTarget(null);
  }

  function ThreadItem(threadProps) {
    const t = () => threadProps.thread;
    const isSelected = () => props.selectedThreadId() === t().id && props.activeView() === 'threads';

    function handleArchiveClick(e) {
      e.stopPropagation();
      setArchiveTarget(t());
    }

    return (
      <div
        class={`thread-item ${isSelected() ? 'selected' : ''}`}
        onClick={() => nav('threads', t().id)}
      >
        <div class="thread-item-title">
          <span class={`status-dot ${t().status}`} />
          {t().title}
          <button
            class="thread-item-archive"
            onClick={handleArchiveClick}
            title="Archive session"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
          </button>
        </div>
        <div class="thread-item-meta">
          <div class="thread-item-avatars">
            <For each={t().experts?.slice(0, 8)}>
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
        <a href="/"><img src="/logomark.png" alt="Mastermind Group" class="sidebar-logo" /></a>
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
          <div class="empty-experts">No threads yet. Start a new session!</div>
        </Show>
      </div>

      <div class="sidebar-footer">
        <button class="sidebar-settings-btn" onClick={() => props.onNavigateSettings?.()} title="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </button>
      </div>

      <ConfirmDialog
        open={!!archiveTarget()}
        title="Archive Session"
        message={`Archive "${archiveTarget()?.title}"? It will be hidden from the sidebar.`}
        confirmLabel="Archive"
        danger
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
