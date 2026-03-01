import { marked } from 'marked';
import DOMPurify from 'dompurify';
import '../styles/messages.css';

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(content) {
  if (!content) return '';
  return DOMPurify.sanitize(marked.parse(content));
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function MessageBubble(props) {
  const msg = () => props.message;

  if (msg().role === 'system') {
    return (
      <div class="message-bubble system">
        <div class="system-message">{msg().content}</div>
      </div>
    );
  }

  const isUser = () => msg().role === 'user';
  const authorName = () => isUser() ? 'You (Moderator)' : (msg().expert_name || 'Unknown');
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
      </div>
    </div>
  );
}
