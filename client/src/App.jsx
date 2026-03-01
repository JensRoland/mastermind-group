import { createSignal, onMount, Show } from 'solid-js';
import { api } from './api.js';
import { connectWebSocket } from './ws.js';
import LoginScreen from './components/LoginScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import ThreadView from './components/ThreadView.jsx';
import ExpertManager from './components/ExpertManager.jsx';
import NewThreadModal from './components/NewThreadModal.jsx';
import './styles/layout.css';

export default function App() {
  const [authenticated, setAuthenticated] = createSignal(false);
  const [checking, setChecking] = createSignal(true);
  const [activeView, setActiveView] = createSignal('threads');
  const [selectedThreadId, setSelectedThreadId] = createSignal(null);
  const [showNewThread, setShowNewThread] = createSignal(false);

  onMount(async () => {
    try {
      const result = await api.checkAuth();
      if (result.authenticated) {
        setAuthenticated(true);
        connectWebSocket();
      }
    } catch (e) {
      // not authenticated
    } finally {
      setChecking(false);
    }
  });

  function handleLogin() {
    setAuthenticated(true);
    connectWebSocket();
  }

  function handleThreadCreated(threadId) {
    setShowNewThread(false);
    setActiveView('threads');
    setSelectedThreadId(threadId);
  }

  if (checking()) {
    return null; // brief blank while checking auth
  }

  return (
    <Show when={authenticated()} fallback={<LoginScreen onLogin={handleLogin} />}>
      <div class="app-shell">
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          selectedThreadId={selectedThreadId}
          setSelectedThreadId={setSelectedThreadId}
          onNewThread={() => setShowNewThread(true)}
        />
        <main class="main-panel">
          <Show when={activeView() === 'experts'}>
            <ExpertManager />
          </Show>
          <Show when={activeView() === 'threads' && selectedThreadId()}>
            <ThreadView threadId={selectedThreadId()} />
          </Show>
          <Show when={activeView() === 'threads' && !selectedThreadId()}>
            <div class="empty-state">Select a thread or start a new discussion</div>
          </Show>
        </main>
      </div>

      <Show when={showNewThread()}>
        <NewThreadModal
          onCreated={handleThreadCreated}
          onClose={() => setShowNewThread(false)}
        />
      </Show>
    </Show>
  );
}
