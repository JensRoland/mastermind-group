import { createSignal, onMount, Show } from 'solid-js';
import { api } from '../api.js';
import { timezone as tzSignal, setTimezone as setGlobalTimezone } from '../timezone.js';
import '../styles/modals.css';

/** Common IANA timezones grouped by region. */
const TIMEZONE_OPTIONS = [
  { label: 'Auto-detect (browser)', value: 'auto' },
  { label: 'UTC', value: 'UTC' },
  { label: 'US/Eastern', value: 'America/New_York' },
  { label: 'US/Central', value: 'America/Chicago' },
  { label: 'US/Mountain', value: 'America/Denver' },
  { label: 'US/Pacific', value: 'America/Los_Angeles' },
  { label: 'US/Alaska', value: 'America/Anchorage' },
  { label: 'US/Hawaii', value: 'Pacific/Honolulu' },
  { label: 'Canada/Atlantic', value: 'America/Halifax' },
  { label: 'Mexico City', value: 'America/Mexico_City' },
  { label: 'São Paulo', value: 'America/Sao_Paulo' },
  { label: 'Buenos Aires', value: 'America/Argentina/Buenos_Aires' },
  { label: 'London', value: 'Europe/London' },
  { label: 'Paris / Berlin / Rome', value: 'Europe/Paris' },
  { label: 'Helsinki / Bucharest', value: 'Europe/Helsinki' },
  { label: 'Moscow', value: 'Europe/Moscow' },
  { label: 'Istanbul', value: 'Europe/Istanbul' },
  { label: 'Dubai', value: 'Asia/Dubai' },
  { label: 'Kolkata / Mumbai', value: 'Asia/Kolkata' },
  { label: 'Bangkok / Jakarta', value: 'Asia/Bangkok' },
  { label: 'Singapore / Kuala Lumpur', value: 'Asia/Singapore' },
  { label: 'Shanghai / Beijing', value: 'Asia/Shanghai' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
  { label: 'Seoul', value: 'Asia/Seoul' },
  { label: 'Sydney', value: 'Australia/Sydney' },
  { label: 'Auckland', value: 'Pacific/Auckland' },
];

export default function SettingsPage(props) {
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

  // Password toggle
  const [showPwSection, setShowPwSection] = createSignal(false);

  // Timezone
  const [selectedTz, setSelectedTz] = createSignal(tzSignal());
  const [tzMsg, setTzMsg] = createSignal(null);

  // API key
  const [apiKeyMasked, setApiKeyMasked] = createSignal(null);
  const [hasApiKey, setHasApiKey] = createSignal(false);
  const [hasEnvApiKey, setHasEnvApiKey] = createSignal(false);
  const [newApiKey, setNewApiKey] = createSignal('');
  const [keySaving, setKeySaving] = createSignal(false);
  const [keyMsg, setKeyMsg] = createSignal(null);

  onMount(async () => {
    try {
      const settings = await api.getSettings();
      if (settings.moderatorName) setName(settings.moderatorName);
      if (settings.timezone) setSelectedTz(settings.timezone);
      setHasApiKey(settings.hasApiKey);
      setApiKeyMasked(settings.apiKeyMasked);
      setHasEnvApiKey(settings.hasEnvApiKey);
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

  async function saveTimezone(tz) {
    setSelectedTz(tz);
    setTzMsg(null);
    try {
      await api.setTimezone(tz);
      setGlobalTimezone(tz);
      setTzMsg({ type: 'success', text: 'Saved' });
    } catch (err) {
      setTzMsg({ type: 'error', text: err.message });
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
    <div class="settings-page">
      <div class="settings-page-header">
        <h2>Settings</h2>
      </div>
      <div class="settings-page-content">
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
          <h3>Timezone</h3>
          <p class="settings-hint">Controls how times are displayed throughout the app.</p>
          <div class="settings-row">
            <div class="form-group" style="flex: 1; margin-bottom: 0">
              <select
                value={selectedTz()}
                onChange={(e) => saveTimezone(e.target.value)}
              >
                {TIMEZONE_OPTIONS.map(opt => (
                  <option value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <StatusMsg msg={tzMsg()} />
        </section>

        <section class="settings-section">
          <Show when={!showPwSection()}>
            <button class="settings-pw-toggle" onClick={() => setShowPwSection(true)}>
              Change Password
            </button>
          </Show>
          <Show when={showPwSection()}>
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
          </Show>
        </section>

        <section class="settings-section">
          <h3>OpenRouter API Key</h3>
          <Show when={hasApiKey()}>
            <p class="settings-hint">Current key: <code>{apiKeyMasked()}</code></p>
          </Show>
          <Show when={!hasApiKey()}>
            <p class="settings-hint">No API key configured. Set one to enable LLM discussions.</p>
          </Show>
          <Show when={hasEnvApiKey()}>
            <p class="settings-hint">The <code>OPENROUTER_API_KEY</code> environment variable is set and will be used as a fallback.</p>
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
      </div>
    </div>
  );
}
