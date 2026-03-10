import { createSignal, createMemo, onMount, For, Show } from 'solid-js';
import { api } from '../api.js';
import { DEFAULT_MAX_TURNS } from '../config.js';
import '../styles/modals.css';

export default function NewThreadModal(props) {
  const [topic, setTopic] = createSignal('');
  const [maxTurns, setMaxTurns] = createSignal(DEFAULT_MAX_TURNS);
  const [maxTurnsText, setMaxTurnsText] = createSignal(String(DEFAULT_MAX_TURNS));
  const [selectedExperts, setSelectedExperts] = createSignal(new Set());
  const [experts, setExperts] = createSignal([]);
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal('');

  onMount(async () => {
    try {
      const data = await api.getExperts();
      setExperts(data);
    } catch (err) {
      console.error('Failed to load experts:', err);
    }
  });

  const specialties = createMemo(() => {
    const seen = new Set();
    const result = [];
    for (const expert of experts()) {
      const s = expert.specialty || 'General';
      if (!seen.has(s)) {
        seen.add(s);
        result.push(s);
      }
    }
    return result;
  });

  const expertsBySpecialty = createMemo(() => {
    const groups = {};
    for (const expert of experts()) {
      const s = expert.specialty || 'General';
      if (!groups[s]) groups[s] = [];
      groups[s].push(expert);
    }
    return groups;
  });

  function toggleExpert(id) {
    setSelectedExperts(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectSpecialty(specialty) {
    const ids = (expertsBySpecialty()[specialty] || []).map(e => e.id);
    setSelectedExperts(new Set(ids));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!topic().trim()) {
      setError('Topic is required');
      return;
    }
    if (selectedExperts().size < 2) {
      setError('Select at least 2 experts');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const result = await api.createThread({
        topic: topic().trim(),
        expertIds: Array.from(selectedExperts()),
        maxTurns: maxTurns(),
      });
      props.onCreated(result.id);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  return (
    <div class="modal-overlay" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal modal-wide">
        <h2>New Session</h2>

        <form onSubmit={handleSubmit}>
          <div class="form-group">
            <label>Topic / Question</label>
            <textarea
              placeholder="What should the group discuss? Be specific about what you want them to explore or decide."
              value={topic()}
              onInput={(e) => setTopic(e.target.value)}
              rows="4"
              autofocus
            />
          </div>

          <div class="form-group">
            <label>Invite Experts (min. 2)</label>
            <Show when={experts().length > 0} fallback={
              <div class="form-hint">No experts created yet. Go to Experts to create some first.</div>
            }>
              <Show when={specialties().length > 1}>
                <div class="specialty-filters">
                  <For each={specialties()}>
                    {(specialty) => (
                      <button
                        type="button"
                        class="specialty-filter-btn"
                        onClick={() => selectSpecialty(specialty)}
                      >
                        {specialty}
                      </button>
                    )}
                  </For>
                </div>
              </Show>

              <div class="expert-selector-grid">
                <For each={specialties()}>
                  {(specialty) => (
                    <>
                      <Show when={specialties().length > 1}>
                        <div class="expert-group-label">{specialty}</div>
                      </Show>
                      <div class="expert-group-cards">
                        <For each={expertsBySpecialty()[specialty]}>
                          {(expert) => (
                            <div
                              class={`expert-select-card ${selectedExperts().has(expert.id) ? 'selected' : ''}`}
                              onClick={() => toggleExpert(expert.id)}
                            >
                              <Show when={expert.total_likes > 0}>
                                <span class="expert-select-card-likes">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                                  </svg>
                                  {expert.total_likes}
                                </span>
                              </Show>
                              <img
                                src={expert.avatar_url}
                                alt={expert.name}
                                onError={(e) => { e.target.src = '/avatars/default.png'; e.target.onerror = null; }}
                              />
                              <div class="expert-select-card-name">{expert.name}</div>
                              <div class="expert-select-card-specialty">{expert.specialty}</div>
                            </div>
                          )}
                        </For>
                      </div>
                    </>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <div class="form-group">
            <label>Max Turns</label>
            <input
              type="number"
              min="4"
              max="200"
              value={maxTurnsText()}
              onInput={(e) => setMaxTurnsText(e.target.value)}
              onBlur={() => {
                const parsed = parseInt(maxTurnsText());
                if (!isNaN(parsed) && parsed >= 4 && parsed <= 200) {
                  setMaxTurns(parsed);
                  setMaxTurnsText(String(parsed));
                } else {
                  setMaxTurnsText(String(maxTurns()));
                }
              }}
            />
            <div class="form-hint">The discussion pauses after this many turns. You can extend it later.</div>
          </div>

          <Show when={error()}>
            <div class="login-error">{error()}</div>
          </Show>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" onClick={props.onClose}>Cancel</button>
            <button type="submit" class="btn-primary" disabled={creating()}>
              {creating() ? 'Starting...' : 'Start Discussion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
