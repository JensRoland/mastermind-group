/**
 * Mastermind Group Microsite — client-side JS
 * Handles: sidebar toggle, Clerk auth, topic submission, voting, admin delete.
 */

// --- Sidebar toggle (mobile) ------------------------------------------------

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
}

sidebarToggle?.addEventListener('click', () => {
  const opening = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('active', opening);
});

sidebarOverlay?.addEventListener('click', closeSidebar);

document.addEventListener('click', (e) => {
  if (sidebar?.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      !sidebarToggle.contains(e.target)) {
    closeSidebar();
  }
});

// Inject top margin into iframe header on mobile
const frame = document.getElementById('sessionFrame');
if (frame && window.matchMedia('(max-width: 768px)').matches) {
  frame.addEventListener('load', () => {
    try {
      const style = frame.contentDocument.createElement('style');
      style.textContent = '.thread-header { margin-top: 48px; }';
      frame.contentDocument.head.appendChild(style);
    } catch (e) { /* cross-origin fallback */ }
  });
}

// --- Toast notifications -----------------------------------------------------

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast.show');
  if (existing) existing.remove();

  const toast = document.getElementById('toast') || createToastElement();
  toast.textContent = message;
  toast.className = `toast toast--${type} show`;
  setTimeout(() => toast.classList.remove('show'), 4000);
}

function createToastElement() {
  const el = document.createElement('div');
  el.id = 'toast';
  el.className = 'toast';
  document.body.appendChild(el);
  return el;
}

// --- Clerk auth --------------------------------------------------------------

let clerkUser = null;
let clerkInstance = null;

async function initClerk() {
  // Wait for Clerk SDK to load
  if (!window.Clerk) return;

  clerkInstance = window.Clerk;

  // Wait for Clerk to be ready (it loads async)
  await new Promise((resolve) => {
    if (clerkInstance.loaded) { resolve(); return; }
    // Poll until loaded (Clerk doesn't expose a ready promise in the CDN build)
    const interval = setInterval(() => {
      if (clerkInstance.loaded) { clearInterval(interval); resolve(); }
    }, 100);
  });

  clerkUser = clerkInstance.user;

  // Mount user button
  const userEl = document.getElementById('clerk-user');
  if (userEl) {
    if (clerkUser) {
      clerkInstance.mountUserButton(userEl, {
        appearance: {
          elements: {
            userButtonAvatarBox: { width: '32px', height: '32px' },
          },
        },
      });
    } else {
      const signInBtn = document.createElement('button');
      signInBtn.className = 'clerk-sign-in-btn';
      signInBtn.textContent = 'Log ind';
      signInBtn.addEventListener('click', () => clerkInstance.openSignIn());
      userEl.appendChild(signInBtn);
    }
  }

  // Show/hide form based on auth state
  const loginPrompt = document.getElementById('topic-submit-login');
  const topicForm = document.getElementById('topic-form');
  if (loginPrompt && topicForm) {
    if (clerkUser) {
      loginPrompt.style.display = 'none';
      topicForm.style.display = '';
    } else {
      loginPrompt.style.display = '';
      topicForm.style.display = 'none';
    }
  }

  // Show admin delete buttons
  if (clerkUser && document.body.dataset.adminId === clerkUser.id) {
    document.querySelectorAll('.topic-delete-btn').forEach(btn => {
      btn.style.display = '';
    });
  }

  // Listen for auth state changes
  clerkInstance.addListener(({ user }) => {
    clerkUser = user;
    // Reload to reflect new auth state
    if (!user) window.location.reload();
  });
}

async function getAuthToken() {
  if (!clerkInstance?.session) return null;
  return clerkInstance.session.getToken();
}

async function authFetch(url, options = {}) {
  const token = await getAuthToken();
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body) headers['Content-Type'] = 'application/json';
  return fetch(url, { ...options, headers });
}

// --- Topic submission --------------------------------------------------------

const topicForm = document.getElementById('topic-form');
const topicBody = document.getElementById('topic-body');
const charCurrent = document.getElementById('char-current');
const submitBtn = document.getElementById('topic-submit-btn');

topicBody?.addEventListener('input', () => {
  charCurrent.textContent = topicBody.value.length;
});

topicForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = topicBody.value.trim();
  if (!body) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Indsender...';

  try {
    const res = await authFetch('api/topics', {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Der opstod en fejl.', 'error');
      return;
    }

    // Add topic to list
    const list = document.getElementById('topic-list');
    const emptyMsg = list?.querySelector('.topic-empty');
    if (emptyMsg) emptyMsg.remove();

    if (list) {
      const card = createTopicCard(data);
      list.prepend(card);
    }

    topicBody.value = '';
    charCurrent.textContent = '0';
    showToast('Dit emneforslag er indsendt!', 'success');
  } catch (err) {
    showToast('Netværksfejl. Prøv igen.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Indsend forslag';
  }
});

function createTopicCard(topic) {
  const card = document.createElement('div');
  card.className = 'topic-card';
  card.dataset.topicId = topic.id;

  const isAdmin = clerkUser && document.body.dataset.adminId === clerkUser.id;
  const deleteBtn = isAdmin
    ? `<button class="topic-delete-btn" data-topic-id="${topic.id}" title="Slet emneforslag">
         <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3.5h12M5.5 6v4M8.5 6v4M2.5 3.5l.5 8a1 1 0 001 1h6a1 1 0 001-1l.5-8M4.5 3.5v-2a1 1 0 011-1h3a1 1 0 011 1v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
       </button>`
    : '';

  card.innerHTML = `
    <button class="topic-vote-btn" data-topic-id="${topic.id}" title="Stem på dette emne">
      <svg width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M6 0L11.196 7.5H0.804L6 0Z" fill="currentColor"/></svg>
      <span class="vote-count">${topic.vote_count}</span>
    </button>
    <div class="topic-content">
      <p class="topic-body">${escapeHtml(topic.body)}</p>
      <span class="topic-meta">${escapeHtml(topic.user_display_name)} · lige nu</span>
    </div>
    ${deleteBtn}
  `;
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Voting ------------------------------------------------------------------

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.topic-vote-btn');
  if (!btn) return;

  if (!clerkUser) {
    clerkInstance?.openSignIn();
    return;
  }

  const topicId = btn.dataset.topicId;
  btn.disabled = true;

  try {
    const res = await authFetch(`api/votes/${topicId}`, { method: 'POST' });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Der opstod en fejl.', 'error');
      return;
    }

    btn.classList.toggle('voted', data.voted);
    btn.querySelector('.vote-count').textContent = data.vote_count;

    // Micro-animation
    btn.classList.add('pulse');
    setTimeout(() => btn.classList.remove('pulse'), 300);
  } catch (err) {
    showToast('Netværksfejl. Prøv igen.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// --- Admin delete ------------------------------------------------------------

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.topic-delete-btn');
  if (!btn) return;

  if (!confirm('Er du sikker på, at du vil slette dette emneforslag?')) return;

  const topicId = btn.dataset.topicId;
  btn.disabled = true;

  try {
    const res = await authFetch(`api/topics/${topicId}`, { method: 'DELETE' });

    if (!res.ok && res.status !== 204) {
      const data = await res.json();
      showToast(data.error || 'Der opstod en fejl.', 'error');
      return;
    }

    // Remove card from DOM
    const card = btn.closest('.topic-card');
    card.style.transition = 'opacity 0.2s, transform 0.2s';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    setTimeout(() => card.remove(), 200);

    showToast('Emneforslaget er slettet.', 'success');
  } catch (err) {
    showToast('Netværksfejl. Prøv igen.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// --- Init --------------------------------------------------------------------

// Start Clerk when SDK is loaded
if (window.Clerk) {
  initClerk();
} else {
  // SDK loads async — wait for it
  const observer = new MutationObserver(() => {
    if (window.Clerk) {
      observer.disconnect();
      initClerk();
    }
  });
  observer.observe(document.head, { childList: true, subtree: true });
  // Fallback: poll
  const poll = setInterval(() => {
    if (window.Clerk) { clearInterval(poll); initClerk(); }
  }, 200);
  setTimeout(() => clearInterval(poll), 10000);
}
