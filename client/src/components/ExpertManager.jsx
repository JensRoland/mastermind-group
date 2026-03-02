import { createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import { api } from '../api.js';
import { onMessage } from '../ws.js';
import ExpertForm from './ExpertForm.jsx';
import '../styles/modals.css';

export default function ExpertManager() {
  const [experts, setExperts] = createSignal([]);
  const [showForm, setShowForm] = createSignal(false);
  const [editingExpert, setEditingExpert] = createSignal(null);

  async function loadExperts() {
    try {
      const data = await api.getExperts();
      setExperts(data);
    } catch (err) {
      console.error('Failed to load experts:', err);
    }
  }

  onMount(() => {
    loadExperts();

    const removeListener = onMessage((data) => {
      if (data.type === 'expert_likes_update') {
        setExperts(prev => prev.map(e =>
          e.id === data.expertId ? { ...e, total_likes: data.totalLikes } : e
        ));
      }
    });

    onCleanup(() => removeListener());
  });

  function handleCreate() {
    setEditingExpert(null);
    setShowForm(true);
  }

  function handleEdit(expert) {
    setEditingExpert(expert);
    setShowForm(true);
  }

  async function handleDelete(expert) {
    if (!confirm(`Delete ${expert.name}?`)) return;
    try {
      await api.deleteExpert(expert.id);
      loadExperts();
    } catch (err) {
      console.error('Failed to delete expert:', err);
    }
  }

  function handleSaved() {
    setShowForm(false);
    setEditingExpert(null);
    loadExperts();
  }

  return (
    <div class="expert-manager">
      <div class="expert-manager-header">
        <h2>Experts</h2>
        <button class="sidebar-add-btn" onClick={handleCreate} title="New expert">+</button>
      </div>

      <Show when={experts().length > 0} fallback={
        <div class="empty-experts">
          No experts yet. Create your first thinker to get started.
        </div>
      }>
        <div class="expert-list">
          <For each={experts()}>
            {(expert) => (
              <div class="expert-card">
                <img
                  src={expert.avatar_url || '/avatars/default.png'}
                  alt={expert.name}
                  onError={(e) => { e.target.src = '/avatars/default.png'; e.target.onerror = null; }}
                />
                <div class="expert-card-info">
                  <div class="expert-card-name">{expert.name}</div>
                  <div class="expert-card-desc">{expert.description}</div>
                  <div class="expert-card-meta">
                    <span class="expert-card-model">{expert.llm_model}</span>
                    <Show when={expert.total_likes > 0}>
                      <span class="expert-card-likes">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                        {expert.total_likes}
                      </span>
                    </Show>
                  </div>
                </div>
                <div class="expert-card-actions">
                  <button class="btn-secondary" onClick={() => handleEdit(expert)}>Edit</button>
                  <button class="btn-danger" onClick={() => handleDelete(expert)}>Delete</button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={showForm()}>
        <ExpertForm
          expert={editingExpert()}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditingExpert(null); }}
        />
      </Show>
    </div>
  );
}
