import { createSignal, createMemo, onMount, Show, For } from 'solid-js';
import { api } from '../api.js';

const MODELS = [
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6' },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
  { id: 'openai/gpt-5.2', name: 'GPT-5.2' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash' },
  { id: 'x-ai/grok-4', name: 'Grok 4' },
  { id: 'qwen/qwen3-max-thinking', name: 'Qwen3 Max Thinking' },
  { id: 'qwen/qwen3.5-35b-a3b', name: 'Qwen3.5 35B' },
  { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5' },
  { id: 'minimax/minimax-m2.5', name: 'MiniMax M2.5' },
  { id: 'z-ai/glm-5', name: 'GLM-5' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large' },
];

export default function ExpertForm(props) {
  const editing = () => props.expert;

  const [allExperts, setAllExperts] = createSignal([]);
  const [name, setName] = createSignal(editing()?.name || '');
  const [specialty, setSpecialty] = createSignal(editing()?.specialty || '');

  onMount(async () => {
    try {
      const data = await api.getExperts();
      setAllExperts(data);
    } catch (err) {
      console.error('Failed to load experts:', err);
    }
  });

  const existingSpecialties = createMemo(() => {
    const seen = new Set();
    for (const expert of allExperts()) {
      if (expert.specialty) seen.add(expert.specialty);
    }
    return [...seen].sort();
  });

  const filteredSpecialties = createMemo(() => {
    const val = specialty().trim().toLowerCase();
    if (!val) return existingSpecialties();
    return existingSpecialties().filter(s => s.toLowerCase().includes(val) && s.toLowerCase() !== val);
  });

  const [specialtyFocused, setSpecialtyFocused] = createSignal(false);

  const [description, setDescription] = createSignal(editing()?.description || '');
  const [llmModel, setLlmModel] = createSignal(editing()?.llm_model || MODELS[0].id);
  const [disambiguator, setDisambiguator] = createSignal('');
  const [avatarUrl, setAvatarUrl] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [generating, setGenerating] = createSignal(false);
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
        specialty: specialty().trim() || 'General',
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

  async function handleGenerateDescription() {
    if (!name().trim()) {
      setError('Enter a name first to generate a description');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const result = await api.generateDescription(name().trim(), disambiguator().trim() || undefined);
      setDescription(result.description);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
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

          <Show when={!editing()}>
            <div class="form-group">
              <label>Disambiguation hint <span class="form-optional">(optional)</span></label>
              <input
                type="text"
                placeholder="e.g. the Die Hard movie villain, not the Canadian conductor"
                value={disambiguator()}
                onInput={(e) => setDisambiguator(e.target.value)}
              />
              <div class="form-hint">Helps the AI identify the right person when generating a description. Not stored.</div>
            </div>
          </Show>

          <div class="form-group">
            <label>Specialty</label>
            <div class="combobox">
              <input
                type="text"
                placeholder="e.g. AI & Machine Learning"
                value={specialty()}
                onInput={(e) => setSpecialty(e.target.value)}
                onFocus={() => setSpecialtyFocused(true)}
                onBlur={() => setTimeout(() => setSpecialtyFocused(false), 150)}
              />
              <Show when={specialtyFocused() && filteredSpecialties().length > 0}>
                <div class="combobox-dropdown">
                  <For each={filteredSpecialties()}>
                    {(s) => (
                      <div
                        class="combobox-option"
                        onMouseDown={() => { setSpecialty(s); setSpecialtyFocused(false); }}
                      >
                        {s}
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <div class="form-hint">Used to group experts in the session creator.</div>
          </div>

          <div class="form-group">
            <div class="form-label-row">
              <label>Description</label>
              <button
                type="button"
                class="btn-generate"
                onClick={handleGenerateDescription}
                disabled={generating()}
              >
                {generating() ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>
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
