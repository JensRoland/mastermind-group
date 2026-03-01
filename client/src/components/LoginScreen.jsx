import { createSignal } from 'solid-js';
import { api } from '../api.js';
import '../styles/login.css';

export default function LoginScreen(props) {
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password() || loading()) return;

    setLoading(true);
    setError('');

    try {
      await api.login(password());
      props.onLogin();
    } catch (err) {
      if (err.status === 429) {
        const seconds = err.body?.retryAfterSeconds || 300;
        const minutes = Math.ceil(seconds / 60);
        setError(`Too many attempts. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`);
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
        <h1>Mastermind Group</h1>
        <p class="subtitle">A meeting of AI-simulated minds</p>
        <form class="login-form" onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Password"
            value={password()}
            onInput={(e) => setPassword(e.target.value)}
            autofocus
          />
          <button type="submit" disabled={!password() || loading()}>
            {loading() ? 'Signing in...' : 'Sign In'}
          </button>
          <div class="login-error">{error()}</div>
        </form>
      </div>
    </div>
  );
}
