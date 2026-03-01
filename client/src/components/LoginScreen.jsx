import { createSignal, onCleanup } from 'solid-js';
import { api } from '../api.js';
import '../styles/login.css';

function formatRemaining(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins > 0) {
    return secs > 0
      ? `${mins} minute${mins > 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''}`
      : `${mins} minute${mins > 1 ? 's' : ''}`;
  }
  return `${secs} second${secs !== 1 ? 's' : ''}`;
}

export default function LoginScreen(props) {
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [throttleRemaining, setThrottleRemaining] = createSignal(0);
  let throttleTimer = null;

  function startCountdown(seconds) {
    clearInterval(throttleTimer);
    setThrottleRemaining(seconds);
    throttleTimer = setInterval(() => {
      const next = throttleRemaining() - 1;
      if (next <= 0) {
        clearInterval(throttleTimer);
        throttleTimer = null;
        setThrottleRemaining(0);
        setError('');
      } else {
        setThrottleRemaining(next);
        setError(`Too many attempts. Try again in ${formatRemaining(next)}.`);
      }
    }, 1000);
  }

  onCleanup(() => clearInterval(throttleTimer));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password() || loading() || throttleRemaining() > 0) return;

    setLoading(true);
    setError('');

    try {
      await api.login(password());
      props.onLogin();
    } catch (err) {
      if (err.status === 429) {
        const seconds = err.body?.retryAfterSeconds || 300;
        setError(`Too many attempts. Try again in ${formatRemaining(seconds)}.`);
        startCountdown(seconds);
      } else if (err.status === 401) {
        setError('Incorrect password.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      setPassword('');
    }
  }

  return (
    <div class="login-screen">
      <div class="login-card">
        <img src="/logotype.png" alt="Mastermind Group" class="login-logo" />
        <p class="subtitle">A meeting of AI-simulated minds</p>
        <form class="login-form" onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Password"
            value={password()}
            onInput={(e) => setPassword(e.target.value)}
            autofocus
          />
          <button type="submit" disabled={!password() || loading() || throttleRemaining() > 0}>
            {loading() ? 'Signing in...' : 'Sign In'}
          </button>
          <div class="login-error">{error()}</div>
        </form>
      </div>
    </div>
  );
}
