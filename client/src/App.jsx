import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { api } from './api.js';
import { connectWebSocket } from './ws.js';
import LoginScreen from './components/LoginScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import ThreadView from './components/ThreadView.jsx';
import ExpertManager from './components/ExpertManager.jsx';
import NewThreadModal from './components/NewThreadModal.jsx';
import './styles/layout.css';

function parseRoute(pathname) {
  if (pathname === '/experts') return { view: 'experts', threadId: null };
  const match = pathname.match(/^\/thread\/(\d+)$/);
  if (match) return { view: 'threads', threadId: parseInt(match[1], 10) };
  return { view: 'threads', threadId: null };
}

function buildPath(view, threadId) {
  if (view === 'experts') return '/experts';
  if (threadId) return `/thread/${threadId}`;
  return '/';
}

export function navigate(view, threadId = null) {
  const path = buildPath(view, threadId);
  if (window.location.pathname !== path) {
    window.history.pushState(null, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  const initial = parseRoute(window.location.pathname);
  const [authenticated, setAuthenticated] = createSignal(false);
  const [checking, setChecking] = createSignal(true);
  const [activeView, setActiveView] = createSignal(initial.view);
  const [selectedThreadId, setSelectedThreadId] = createSignal(initial.threadId);
  const [showNewThread, setShowNewThread] = createSignal(false);
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  function onPopState() {
    const route = parseRoute(window.location.pathname);
    setActiveView(route.view);
    setSelectedThreadId(route.threadId);
  }

  onMount(async () => {
    window.addEventListener('popstate', onPopState);

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

  onCleanup(() => window.removeEventListener('popstate', onPopState));

  function handleLogin() {
    setAuthenticated(true);
    connectWebSocket();
  }

  function handleThreadCreated(threadId) {
    setShowNewThread(false);
    setSidebarOpen(false);
    navigate('threads', threadId);
  }

  function handleNavigate(view, threadId) {
    setSidebarOpen(false);
    navigate(view, threadId);
  }

  return (
    <Show when={!checking()}>
      <Show when={authenticated()} fallback={<LoginScreen onLogin={handleLogin} />}>
        <div class="app-shell">
          <div
            class={`sidebar-backdrop ${sidebarOpen() ? 'visible' : ''}`}
            onClick={() => setSidebarOpen(false)}
          />
          <Sidebar
            activeView={activeView}
            selectedThreadId={selectedThreadId}
            onNewThread={() => setShowNewThread(true)}
            open={sidebarOpen}
            onNavigate={handleNavigate}
          />
          <main class="main-panel">
            <div class="mobile-topbar">
              <button class="hamburger-btn" onClick={() => setSidebarOpen(true)}>
                &#9776;
              </button>
              <a href="/"><img src="/logotype-wide.png" alt="Mastermind Group" class="mobile-topbar-logo" /></a>
            </div>
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
    </Show>
  );
}
