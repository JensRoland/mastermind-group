import { Show, createSignal } from 'solid-js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import LikeButton from './LikeButton.jsx';
import { formatTime } from '../timezone.js';
import '../styles/messages.css';

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(content) {
  if (!content) return '';
  return DOMPurify.sanitize(marked.parse(content));
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function CopyButton(props) {
  const [copied, setCopied] = createSignal(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = props.text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      class={`copy-btn ${copied() ? 'copied' : ''}`}
      onClick={handleCopy}
      title={copied() ? 'Copied!' : 'Copy message'}
    >
      <Show when={copied()} fallback={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      }>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </Show>
    </button>
  );
}

export default function MessageBubble(props) {
  const msg = () => props.message;

  if (msg().role === 'system') {
    const isSummary = () => msg().content?.startsWith('## ');
    return (
      <div class={`message-bubble ${isSummary() ? 'summary' : 'system'}`}>
        {isSummary() ? (
          <div class="summary-message">
            <div class="message-content" innerHTML={renderMarkdown(msg().content)} />
            <div class="message-footer">
              <CopyButton text={msg().content} />
            </div>
          </div>
        ) : (
          <div class="system-message">{msg().content}</div>
        )}
      </div>
    );
  }

  const isUser = () => msg().role === 'user';
  const authorName = () => isUser()
    ? `${props.moderatorName || 'The Moderator'} (Moderator)`
    : (msg().expert_name || 'Unknown');
  const avatarUrl = () => msg().expert_avatar || msg().avatar_url;

  return (
    <div class={`message-bubble ${msg().role}`}>
      <div class="message-avatar">
        {!isUser() && avatarUrl() ? (
          <img src={avatarUrl()} alt={authorName()} />
        ) : (
          <div class="avatar-placeholder">{getInitials(authorName())}</div>
        )}
      </div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-author">{authorName()}</span>
          <span class="message-time">{formatTime(msg().created_at)}</span>
        </div>
        <div class="message-content" innerHTML={renderMarkdown(msg().content)} />
        <div class="message-footer">
          <Show when={msg().llm_model}>
            <span class="message-model">{msg().llm_model}</span>
          </Show>
          <Show when={msg().role === 'expert'}>
            <LikeButton messageId={msg().id} liked={!!msg().liked} />
          </Show>
          <CopyButton text={msg().content} />
          <Show when={props.onRollback}>
            <button
              class="rollback-btn"
              onClick={() => props.onRollback(msg().id)}
              title="Rollback to here"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}
