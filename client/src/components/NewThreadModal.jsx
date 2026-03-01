import { createSignal, onMount, For, Show } from 'solid-js';
import { api } from '../api.js';

export default function NewThreadModal(props) {
  const [title, setTitle] = createSignal('');
  const [topic, setTopic] = createSignal('');
  const [maxTurns, setMaxTurns] = createSignal(20);
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

  async function handleSubmit(e) {
    e.preventDefault();

    if (!title().trim() || !topic().trim()) {
      setError('Title and topic are required');
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
        title: title().trim(),
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
      <div class="modal">
        <h2>New Discussion</h2>

        <form onSubmit={handleSubmit}>
          <div class="form-group">
            <label>Title</label>
            <input
              type="text"
              placeholder="A short title for this discussion"
              value={title()}
              onInput={(e) => setTitle(e.target.value)}
              autofocus
            />
          </div>

          <div class="form-group">
            <label>Topic / Question</label>
            <textarea
              placeholder="What should the group discuss? Be specific about what you want them to explore or decide."
              value={topic()}
              onInput={(e) => setTopic(e.target.value)}
              rows="4"
            />
          </div>

          <div class="form-group">
            <label>Invite Experts (min. 2)</label>
            <Show when={experts().length > 0} fallback={
              <div class="form-hint">No experts created yet. Go to Experts to create some first.</div>
            }>
              <div class="expert-checkboxes">
                <For each={experts()}>
                  {(expert) => (
                    <label class="expert-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedExperts().has(expert.id)}
                        onChange={() => toggleExpert(expert.id)}
                      />
                      <img
                        src={expert.avatar_url}
                        alt={expert.name}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <span class="expert-checkbox-name">{expert.name}</span>
                    </label>
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
              value={maxTurns()}
              onInput={(e) => setMaxTurns(parseInt(e.target.value) || 20)}
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
