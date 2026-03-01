import { createSignal, onMount, For, Show } from 'solid-js';
import { api } from '../api.js';
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

  onMount(loadExperts);

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
        <button class="btn-primary" onClick={handleCreate}>+ New Expert</button>
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
                  src={expert.avatar_url}
                  alt={expert.name}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div class="expert-card-info">
                  <div class="expert-card-name">{expert.name}</div>
                  <div class="expert-card-desc">{expert.description}</div>
                  <div class="expert-card-model">{expert.llm_model}</div>
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
