import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { api } from '../api.js';
import { onMessage } from '../ws.js';
import '../styles/welcome.css';

export default function WelcomeScreen(props) {
  const [latestThread, setLatestThread] = createSignal(null);

  async function loadLatest() {
    try {
      const threads = await api.getThreads();
      if (threads.length > 0) {
        setLatestThread(threads[0]);
      }
    } catch (err) {
      console.error('Failed to load threads:', err);
    }
  }

  onMount(() => {
    loadLatest();

    const removeListener = onMessage((data) => {
      if (data.type === 'thread_list_update') {
        loadLatest();
      }
    });

    onCleanup(removeListener);
  });

  return (
    <div class="welcome-screen">
      <div class="welcome-content">
        <button class="welcome-new-btn" onClick={() => props.onNewThread()}>
          Start A New Session
        </button>

        <p class="welcome-heading">&mdash; or pick up where you left off &mdash;</p>

        <Show when={latestThread()}>
          <div class="welcome-recent">
            <div
              class="welcome-recent-card"
              onClick={() => props.onSelectThread(latestThread().id)}
            >
              <div class="welcome-recent-info">
                <span class="welcome-recent-title">{latestThread().title}</span>
                <span class="welcome-recent-meta">
                  <span class={`status-dot ${latestThread().status}`} />
                  {' '}{latestThread().current_turn}/{latestThread().max_turns} turns
                </span>
              </div>
              <div class="welcome-recent-avatars">
                <For each={latestThread().experts?.slice(0, 6)}>
                  {(expert) => (
                    <img src={expert.avatar_url} alt={expert.name} title={expert.name} />
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
