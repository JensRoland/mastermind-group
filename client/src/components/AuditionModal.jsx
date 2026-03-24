import { createSignal, onCleanup, For, Index, Show } from 'solid-js';
import { api } from '../api.js';
import { onMessage } from '../ws.js';
import { MODELS, modelName } from '../models.js';
import '../styles/audition.css';

const DEFAULT_JUDGE = 'anthropic/claude-opus-4.6';

export default function AuditionModal(props) {
  // Setup state
  const [questions, setQuestions] = createSignal([
    { text: '', expectedAnswer: '' },
  ]);
  const [selectedModels, setSelectedModels] = createSignal(new Set());
  const [judgeModel, setJudgeModel] = createSignal(DEFAULT_JUDGE);
  const [customCriteria, setCustomCriteria] = createSignal('');

  // Phase: 'setup' | 'running' | 'results' | 'error'
  const [phase, setPhase] = createSignal('setup');
  const [progress, setProgress] = createSignal({ stage: '', current: 0, total: 0 });
  const [results, setResults] = createSignal([]);
  const [error, setError] = createSignal('');
  const [expandedCards, setExpandedCards] = createSignal(new Set());
  const [casting, setCasting] = createSignal(null);

  let removeWsListener = null;
  let disposed = false;
  onCleanup(() => { disposed = true; removeWsListener?.(); });

  function addQuestion() {
    setQuestions(q => [...q, { text: '', expectedAnswer: '' }]);
  }

  function removeQuestion(index) {
    setQuestions(q => q.length > 1 ? q.filter((_, i) => i !== index) : q);
  }

  function updateQuestion(index, field, value) {
    setQuestions(q => q.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  function toggleModel(modelId) {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }

  function toggleExpanded(index) {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const canRun = () => {
    const hasQuestions = questions().some(q => q.text.trim());
    const hasModels = selectedModels().size >= 2;
    return hasQuestions && hasModels;
  };

  async function runAudition() {
    const validQuestions = questions().filter(q => q.text.trim()).map(q => ({
      text: q.text.trim(),
      expectedAnswer: q.expectedAnswer.trim() || undefined,
    }));

    setPhase('running');
    setProgress({ stage: 'testing', current: 0, total: selectedModels().size });
    setError('');

    try {
      const { auditionId } = await api.runAudition(props.expert.id, {
        questions: validQuestions,
        models: [...selectedModels()],
        judgeModel: judgeModel(),
        customCriteria: customCriteria().trim() || undefined,
      });

      // Listen for WS messages tagged with this audition's ID
      removeWsListener?.();
      if (disposed) return;
      removeWsListener = onMessage((data) => {
        if (data.auditionId !== auditionId) return;

        if (data.type === 'audition_progress') {
          setProgress(data);
        } else if (data.type === 'audition_result') {
          setResults(data.rankings);
          setPhase('results');
        } else if (data.type === 'audition_error') {
          setError(data.message);
          setPhase('error');
        }
      });
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
  }

  async function castModel(modelId) {
    setCasting(modelId);
    setError('');
    try {
      await api.updateExpert(props.expert.id, { llm_model: modelId });
      props.onModelChanged();
      props.onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setCasting(null);
    }
  }

  return (
    <div class="modal-overlay audition-overlay" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="audition-modal">
        {/* Header */}
        <div class="audition-header">
          <img
            src={props.expert.avatar_url || '/avatars/default.png'}
            alt={props.expert.name}
            onError={(e) => { e.target.src = '/avatars/default.png'; e.target.onerror = null; }}
          />
          <div class="audition-header-info">
            <h2>Audition <span>for {props.expert.name}</span></h2>
            <p>{props.expert.description}</p>
          </div>
          <button class="btn-icon audition-close" onClick={props.onClose}>&times;</button>
        </div>

        {/* Body */}
        <div class="audition-body">
          <Show when={phase() === 'setup'}>
            {/* Questions */}
            <div class="audition-section-label">Control Questions</div>
            <Index each={questions()}>
              {(q, i) => (
                <div class="audition-question">
                  <div class="audition-question-row">
                    <div class="audition-question-num">{i + 1}</div>
                    <div class="audition-question-fields">
                      <input
                        type="text"
                        placeholder="Ask something this expert should know..."
                        value={q().text}
                        onInput={(e) => updateQuestion(i, 'text', e.target.value)}
                        autofocus={i === 0}
                      />
                      <textarea
                        placeholder="Expected answer (optional) — helps the judge evaluate accuracy"
                        value={q().expectedAnswer}
                        onInput={(e) => updateQuestion(i, 'expectedAnswer', e.target.value)}
                        rows="2"
                      />
                    </div>
                    <button
                      class="audition-question-remove"
                      onClick={() => removeQuestion(i)}
                      title="Remove question"
                    >&times;</button>
                  </div>
                </div>
              )}
            </Index>
            <button class="audition-add-btn" onClick={addQuestion}>+ Add question</button>

            {/* Model selection */}
            <div class="audition-section-label">Models to Audition</div>
            <div class="audition-model-grid">
              <For each={MODELS}>
                {(model) => (
                  <label
                    class={`audition-model-chip ${selectedModels().has(model.id) ? 'selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedModels().has(model.id)}
                      onChange={() => toggleModel(model.id)}
                    />
                    <span class="audition-model-chip-name">{model.name}</span>
                  </label>
                )}
              </For>
            </div>

            {/* Judge */}
            <div class="audition-section-label">Judge Model</div>
            <div class="form-group audition-judge-row">
              <select value={judgeModel()} onChange={(e) => setJudgeModel(e.target.value)}>
                <For each={MODELS}>
                  {(m) => <option value={m.id}>{m.name}</option>}
                </For>
              </select>
            </div>

            {/* Custom Criteria */}
            <div class="audition-section-label">Evaluation Criteria <span class="audition-optional-label">(optional)</span></div>
            <div class="form-group">
              <textarea
                placeholder="e.g. tone of voice, factual correctness, use of specific frameworks, rhetorical style..."
                value={customCriteria()}
                onInput={(e) => setCustomCriteria(e.target.value)}
                rows="2"
              />
            </div>
          </Show>

          <Show when={phase() === 'running'}>
            <div class="audition-progress">
              <div class="audition-progress-ring" />
              <Show when={progress().stage === 'testing'}>
                <div class="audition-progress-label">
                  Testing models... {progress().current}/{progress().total}
                </div>
                <div class="audition-progress-bar-track">
                  <div
                    class="audition-progress-bar-fill"
                    style={{ width: `${(progress().current / progress().total) * 100}%` }}
                  />
                </div>
                <div class="audition-progress-sub">
                  Each model answers your questions in character
                </div>
              </Show>
              <Show when={progress().stage === 'judging'}>
                <div class="audition-progress-label">Judging responses...</div>
                <div class="audition-progress-sub">
                  Blind evaluation — candidates are anonymized
                </div>
              </Show>
            </div>
          </Show>

          <Show when={phase() === 'results'}>
            <div class="audition-section-label">Results</div>
            <div class="audition-results">
              <For each={results()}>
                {(r, i) => (
                  <div class="audition-result-card">
                    <div class="audition-result-rank">#{i() + 1}</div>
                    <div class="audition-result-header">
                      <span class="audition-result-model">{modelName(r.modelId)}</span>
                      <span class="audition-result-score">{r.score}/10</span>
                    </div>
                    <div class="audition-result-reasoning">{r.reasoning}</div>
                    <button
                      class="audition-result-toggle"
                      onClick={() => toggleExpanded(i())}
                    >
                      {expandedCards().has(i()) ? 'Hide responses' : 'Show responses'}
                    </button>
                    <Show when={expandedCards().has(i())}>
                      <div class="audition-result-responses">
                        <For each={r.responses}>
                          {(resp) => (
                            <div class="audition-response-item">
                              <div class="audition-response-q">{resp.question}</div>
                              <div class="audition-response-a">{resp.answer}</div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                    <button
                      class="audition-cast-btn"
                      onClick={() => castModel(r.modelId)}
                      disabled={casting() !== null || props.expert.llm_model === r.modelId}
                    >
                      {props.expert.llm_model === r.modelId
                        ? 'Current model'
                        : casting() === r.modelId
                          ? 'Casting...'
                          : 'Cast this model'}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={error()}>
            <div class="audition-error">{error()}</div>
          </Show>
        </div>

        {/* Footer */}
        <div class="audition-footer">
          <div class="audition-footer-hint">
            <Show when={phase() === 'setup'}>
              Select at least 2 models and add a question to begin
            </Show>
            <Show when={phase() === 'results'}>
              Responses were judged blind — the judge didn't know which model produced which answer
            </Show>
          </div>
          <div class="audition-footer-actions">
            <Show when={phase() === 'setup'}>
              <button class="btn-secondary" onClick={props.onClose}>Cancel</button>
              <button
                class="btn-audition"
                disabled={!canRun()}
                onClick={runAudition}
              >
                Run Audition
              </button>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
