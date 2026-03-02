const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });

  if (res.status === 401 && !path.includes('/login') && !path.includes('/auth/check')) {
    window.location.reload();
    throw new Error('Not authenticated');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return res.json();
}

export const api = {
  // Auth
  checkAuth: () => request('/auth/check'),
  login: (password) => request('/login', { method: 'POST', body: JSON.stringify({ password }) }),

  // Experts
  getExperts: () => request('/experts'),
  getExpert: (id) => request(`/experts/${id}`),
  createExpert: (data) => request('/experts', { method: 'POST', body: JSON.stringify(data) }),
  updateExpert: (id, data) => request(`/experts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpert: (id) => request(`/experts/${id}`, { method: 'DELETE' }),
  generateDescription: (name) => request('/experts/generate-description', { method: 'POST', body: JSON.stringify({ name }) }),

  // Threads
  getThreads: (status) => request(`/threads${status ? `?status=${status}` : ''}`),
  getThread: (id) => request(`/threads/${id}`),
  createThread: (data) => request('/threads', { method: 'POST', body: JSON.stringify(data) }),
  sendMessage: (id, content) => request(`/threads/${id}/message`, { method: 'POST', body: JSON.stringify({ content }) }),
  wrapUp: (id) => request(`/threads/${id}/wrapup`, { method: 'POST' }),
  extendTurns: (id, turns) => request(`/threads/${id}/extend`, { method: 'POST', body: JSON.stringify({ turns }) }),
  setStatus: (id, status) => request(`/threads/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
};
