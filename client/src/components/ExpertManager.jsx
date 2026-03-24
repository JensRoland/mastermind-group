import { createSignal, createMemo, onMount, onCleanup, For, Show } from 'solid-js';
import { api } from '../api.js';
import { onMessage } from '../ws.js';
import { modelName } from '../models.js';
import ExpertForm from './ExpertForm.jsx';
import AuditionModal from './AuditionModal.jsx';
import '../styles/modals.css';

export default function ExpertManager() {
  const [experts, setExperts] = createSignal([]);
  const [showForm, setShowForm] = createSignal(false);
  const [editingExpert, setEditingExpert] = createSignal(null);
  const [selectedIds, setSelectedIds] = createSignal(new Set());
  const [bulkSpecialty, setBulkSpecialty] = createSignal('');
  const [bulkFocused, setBulkFocused] = createSignal(false);
  const [bulkSaving, setBulkSaving] = createSignal(false);
  const [auditionExpert, setAuditionExpert] = createSignal(null);

  const existingSpecialties = createMemo(() => {
    const seen = new Set();
    return experts()
      .map(e => e.specialty)
      .filter(s => s && seen.has(s) ? false : (seen.add(s), true));
  });

  const filteredBulkSpecialties = createMemo(() => {
    const q = bulkSpecialty().toLowerCase().trim();
    if (!q) return existingSpecialties();
    return existingSpecialties().filter(s => s.toLowerCase().includes(q));
  });

  const hasSelection = createMemo(() => selectedIds().size > 0);

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
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(expert.id);
        return next;
      });
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

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(experts().map(e => e.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  async function applyBulkSpecialty() {
    const specialty = bulkSpecialty().trim();
    if (!specialty || selectedIds().size === 0) return;

    setBulkSaving(true);
    try {
      await api.bulkUpdateSpecialty([...selectedIds()], specialty);
      setBulkSpecialty('');
      setSelectedIds(new Set());
      loadExperts();
    } catch (err) {
      console.error('Failed to bulk update specialty:', err);
    } finally {
      setBulkSaving(false);
    }
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
                <div class="expert-card-actions">
                  <button class="btn-icon" onClick={() => setAuditionExpert(expert)} title="Audition models">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 3v18"/><path d="M4 7l4 7H0l4-7z"/><path d="M20 7l4 7h-8l4-7z"/><path d="M4 7h16"/>
                    </svg>
                  </button>
                  <button class="btn-icon" onClick={() => handleEdit(expert)} title="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                    </svg>
                  </button>
                  <button class="btn-icon btn-icon-danger" onClick={() => handleDelete(expert)} title="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
                <img
                  src={expert.avatar_url || '/avatars/default.png'}
                  alt={expert.name}
                  onError={(e) => { e.target.src = '/avatars/default.png'; e.target.onerror = null; }}
                />
                <div class="expert-card-info">
                  <div class="expert-card-name">
                    <label class="expert-card-checkbox" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds().has(expert.id)}
                        onChange={() => toggleSelect(expert.id)}
                      />
                    </label>
                    {expert.name}
                  </div>
                  <div class="expert-card-specialty">{expert.specialty}</div>
                  <div class="expert-card-desc">{expert.description}</div>
                  <div class="expert-card-meta">
                    <Show when={expert.total_likes > 0}>
                      <span class="expert-card-likes">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                        {expert.total_likes}
                      </span>
                    </Show>
                    <span class="expert-card-model">{modelName(expert.llm_model)}</span>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={hasSelection()}>
        <div class="bulk-action-bar">
          <div class="bulk-action-info">
            <span>{selectedIds().size} selected</span>
            <button class="bulk-action-link" onClick={selectAll}>All</button>
            <button class="bulk-action-link" onClick={selectNone}>None</button>
          </div>
          <div class="bulk-action-controls">
            <span class="bulk-action-label">Set specialty:</span>
            <div class="combobox bulk-action-combobox">
              <input
                type="text"
                value={bulkSpecialty()}
                onInput={(e) => setBulkSpecialty(e.target.value)}
                onFocus={() => setBulkFocused(true)}
                onBlur={() => setTimeout(() => setBulkFocused(false), 150)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyBulkSpecialty(); }}
                placeholder="Type specialty..."
              />
              <Show when={bulkFocused() && filteredBulkSpecialties().length > 0}>
                <div class="combobox-dropdown combobox-dropdown-up">
                  <For each={filteredBulkSpecialties()}>
                    {(s) => (
                      <div
                        class="combobox-option"
                        onMouseDown={() => { setBulkSpecialty(s); setBulkFocused(false); }}
                      >
                        {s}
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <button
              class="btn-primary"
              disabled={!bulkSpecialty().trim() || bulkSaving()}
              onClick={applyBulkSpecialty}
            >
              {bulkSaving() ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </Show>

      <Show when={showForm()}>
        <ExpertForm
          expert={editingExpert()}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditingExpert(null); }}
        />
      </Show>

      <Show when={auditionExpert()}>
        <AuditionModal
          expert={auditionExpert()}
          onClose={() => setAuditionExpert(null)}
          onModelChanged={() => loadExperts()}
        />
      </Show>
    </div>
  );
}
