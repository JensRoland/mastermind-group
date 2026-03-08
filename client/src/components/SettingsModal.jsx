import { createSignal, onMount, Show } from 'solid-js';
import { api } from '../api.js';
import '../styles/modals.css';

export default function SettingsModal(props) {
  // Moderator name
  const [name, setName] = createSignal(props.moderatorName || '');
  const [nameSaving, setNameSaving] = createSignal(false);
  const [nameMsg, setNameMsg] = createSignal(null);

  // Password
  const [currentPw, setCurrentPw] = createSignal('');
  const [newPw, setNewPw] = createSignal('');
  const [confirmPw, setConfirmPw] = createSignal('');
  const [pwSaving, setPwSaving] = createSignal(false);
  const [pwMsg, setPwMsg] = createSignal(null);

  // API key
  const [apiKeyMasked, setApiKeyMasked] = createSignal(null);
  const [hasApiKey, setHasApiKey] = createSignal(false);
  const [newApiKey, setNewApiKey] = createSignal('');
  const [keySaving, setKeySaving] = createSignal(false);
  const [keyMsg, setKeyMsg] = createSignal(null);

  onMount(async () => {
    try {
      const settings = await api.getSettings();
      if (settings.moderatorName) setName(settings.moderatorName);
      setHasApiKey(settings.hasApiKey);
      setApiKeyMasked(settings.apiKeyMasked);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  });

  async function saveName() {
    if (!name().trim() || nameSaving()) return;
    setNameSaving(true);
    setNameMsg(null);
    try {
      const result = await api.setModeratorName(name().trim());
      props.onModeratorNameChange(result.moderatorName);
      setNameMsg({ type: 'success', text: 'Saved' });
    } catch (err) {
      setNameMsg({ type: 'error', text: err.message });
    } finally {
      setNameSaving(false);
    }
  }

  async function savePassword() {
    if (pwSaving()) return;
    if (!currentPw() || !newPw()) {
      setPwMsg({ type: 'error', text: 'All fields are required' });
      return;
    }
    if (newPw() !== confirmPw()) {
      setPwMsg({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    if (newPw().length < 4) {
      setPwMsg({ type: 'error', text: 'Password must be at least 4 characters' });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    try {
      await api.changePassword(currentPw(), newPw());
      setPwMsg({ type: 'success', text: 'Password changed' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message });
    } finally {
      setPwSaving(false);
    }
  }

  async function saveApiKey() {
    if (!newApiKey().trim() || keySaving()) return;
    setKeySaving(true);
    setKeyMsg(null);
    try {
      const result = await api.setApiKey(newApiKey().trim());
      setApiKeyMasked(result.apiKeyMasked);
      setHasApiKey(true);
      setNewApiKey('');
      setKeyMsg({ type: 'success', text: 'API key saved' });
    } catch (err) {
      setKeyMsg({ type: 'error', text: err.message });
    } finally {
      setKeySaving(false);
    }
  }

  function StatusMsg(msgProps) {
    return (
      <Show when={msgProps.msg}>
        <div class={`settings-msg ${msgProps.msg?.type}`}>{msgProps.msg?.text}</div>
      </Show>
    );
  }

  return (
    <div class="modal-overlay" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal settings-modal">
        <h2>Settings</h2>

        <section class="settings-section">
          <h3>Your Name</h3>
          <p class="settings-hint">This is how you appear in discussions. Experts will address you by this name.</p>
          <div class="settings-row">
            <div class="form-group" style="flex: 1; margin-bottom: 0">
              <input
                type="text"
                value={name()}
                onInput={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
              />
            </div>
            <button class="btn-primary" onClick={saveName} disabled={nameSaving() || !name().trim()}>
              {nameSaving() ? 'Saving...' : 'Save'}
            </button>
          </div>
          <StatusMsg msg={nameMsg()} />
        </section>

        <section class="settings-section">
          <h3>Change Password</h3>
          <div class="form-group">
            <label>Current password</label>
            <input
              type="password"
              value={currentPw()}
              onInput={(e) => setCurrentPw(e.target.value)}
            />
          </div>
          <div class="form-group">
            <label>New password</label>
            <input
              type="password"
              value={newPw()}
              onInput={(e) => setNewPw(e.target.value)}
            />
          </div>
          <div class="form-group">
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirmPw()}
              onInput={(e) => setConfirmPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && savePassword()}
            />
          </div>
          <button class="btn-primary" onClick={savePassword} disabled={pwSaving()}>
            {pwSaving() ? 'Saving...' : 'Change Password'}
          </button>
          <StatusMsg msg={pwMsg()} />
        </section>

        <section class="settings-section">
          <h3>OpenRouter API Key</h3>
          <Show when={hasApiKey()}>
            <p class="settings-hint">Current key: <code>{apiKeyMasked()}</code></p>
          </Show>
          <Show when={!hasApiKey()}>
            <p class="settings-hint">No API key configured. Set one to enable LLM discussions.</p>
          </Show>
          <div class="settings-row">
            <div class="form-group" style="flex: 1; margin-bottom: 0">
              <input
                type="password"
                value={newApiKey()}
                onInput={(e) => setNewApiKey(e.target.value)}
                placeholder={hasApiKey() ? 'Enter new key to replace' : 'Enter API key'}
                onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
              />
            </div>
            <button class="btn-primary" onClick={saveApiKey} disabled={keySaving() || !newApiKey().trim()}>
              {keySaving() ? 'Saving...' : 'Save'}
            </button>
          </div>
          <StatusMsg msg={keyMsg()} />
        </section>

        <div class="modal-actions">
          <button class="btn-secondary" onClick={props.onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
