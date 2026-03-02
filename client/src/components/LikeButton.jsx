import { createSignal, createEffect } from 'solid-js';
import { api } from '../api.js';

export default function LikeButton(props) {
  const [liked, setLiked] = createSignal(!!props.liked);
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    setLiked(!!props.liked);
  });

  const handleToggle = async () => {
    if (busy()) return;
    setBusy(true);
    setLiked(prev => !prev);
    try {
      const result = await api.toggleLike(props.messageId);
      setLiked(result.liked);
    } catch (err) {
      console.error('Failed to toggle like:', err);
      setLiked(prev => !prev);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      class={`like-btn ${liked() ? 'liked' : ''}`}
      onClick={handleToggle}
      disabled={busy()}
      title={liked() ? 'Unlike' : 'Like'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill={liked() ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
      </svg>
    </button>
  );
}
