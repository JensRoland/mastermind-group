import { createSignal, Show } from 'solid-js';
import { api } from '../api.js';

const MODELS = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large' },
  { id: 'anthropic/claude-haiku-4', name: 'Claude Haiku 4' },
];

export default function ExpertForm(props) {
  const editing = () => props.expert;

  const [name, setName] = createSignal(editing()?.name || '');
  const [description, setDescription] = createSignal(editing()?.description || '');
  const [llmModel, setLlmModel] = createSignal(editing()?.llm_model || MODELS[0].id);
  const [avatarUrl, setAvatarUrl] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name().trim() || !description().trim()) {
      setError('Name and description are required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const data = {
        name: name().trim(),
        description: description().trim(),
        llm_model: llmModel(),
      };

      if (avatarUrl().trim()) {
        data.avatar_url = avatarUrl().trim();
      }

      if (editing()) {
        await api.updateExpert(editing().id, data);
      } else {
        await api.createExpert(data);
      }

      props.onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="modal-overlay" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal">
        <h2>{editing() ? 'Edit Expert' : 'Create Expert'}</h2>

        <form onSubmit={handleSubmit}>
          <div class="form-group">
            <label>Name</label>
            <input
              type="text"
              placeholder="e.g. Charlie Munger"
              value={name()}
              onInput={(e) => setName(e.target.value)}
              autofocus
            />
          </div>

          <div class="form-group">
            <label>Description</label>
            <textarea
              placeholder="Brief description of who this person is and their key ideas/philosophy. This becomes part of the AI's persona prompt."
              value={description()}
              onInput={(e) => setDescription(e.target.value)}
              rows="4"
            />
            <div class="form-hint">This shapes how the AI embodies this thinker in discussions.</div>
          </div>

          <div class="form-group">
            <label>Avatar Image URL</label>
            <input
              type="url"
              placeholder="https://example.com/photo.jpg"
              value={avatarUrl()}
              onInput={(e) => setAvatarUrl(e.target.value)}
            />
            <div class="form-hint">The image will be cropped to a square and resized to 150x150.</div>
          </div>

          <div class="form-group">
            <label>LLM Model</label>
            <select value={llmModel()} onChange={(e) => setLlmModel(e.target.value)}>
              {MODELS.map(m => (
                <option value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <Show when={error()}>
            <div class="login-error">{error()}</div>
          </Show>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" onClick={props.onClose}>Cancel</button>
            <button type="submit" class="btn-primary" disabled={saving()}>
              {saving() ? 'Saving...' : (editing() ? 'Save Changes' : 'Create Expert')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
