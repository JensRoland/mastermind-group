import { Show, createSignal } from 'solid-js';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import DOMPurify from 'dompurify';
import 'highlight.js/styles/github-dark.min.css';
import 'katex/dist/katex.min.css';
import LikeButton from './LikeButton.jsx';
import { formatTime } from '../timezone.js';
import '../styles/messages.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    }
  }),
  markedKatex({ throwOnError: false }),
  { breaks: true, gfm: true }
);

// Allow KaTeX-generated HTML through DOMPurify
const KATEX_TAGS = ['math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext',
  'mfrac', 'msqrt', 'mroot', 'msub', 'msup', 'msubsup', 'munder', 'mover',
  'munderover', 'mtable', 'mtr', 'mtd', 'mspace', 'mpadded', 'mphantom',
  'menclose', 'annotation', 'annotation-xml', 'span'];
const KATEX_ATTRS = ['mathvariant', 'encoding', 'xmlns', 'display', 'class', 'style',
  'aria-hidden', 'role', 'height', 'width', 'viewbox', 'd', 'fill', 'preserveaspectratio'];
const purifyConfig = {
  ADD_TAGS: KATEX_TAGS,
  ADD_ATTR: KATEX_ATTRS,
};

function renderMarkdown(content) {
  if (!content) return '';
  const html = DOMPurify.sanitize(marked.parse(content), purifyConfig);
  // Wrap code blocks with a container that includes a copy button
  return html
    .replace(/<pre>/g, '<div class="code-block-wrapper"><button class="code-copy-btn" title="Copy code"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><pre>')
    .replace(/<\/pre>/g, '</pre></div>');
}

/** Ref callback: attach click handlers for code-block copy buttons */
function withCodeCopyHandlers(el) {
  // Use queueMicrotask so innerHTML has been applied
  queueMicrotask(() => {
    const btns = el.querySelectorAll('.code-copy-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const pre = btn.closest('.code-block-wrapper')?.querySelector('pre');
        if (!pre) return;
        const code = pre.textContent;
        navigator.clipboard.writeText(code).then(() => {
          btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            btn.classList.remove('copied');
          }, 1500);
        });
      });
    });
  });
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
    const isSummary = () => msg().content?.startsWith('## Discussion Summary');
    return (
      <div class={`message-bubble ${isSummary() ? 'summary' : 'system'}`}>
        {isSummary() ? (
          <div class="summary-message">
            <div class="message-content" ref={withCodeCopyHandlers} innerHTML={renderMarkdown(msg().content)} />
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
        <div class="message-content" ref={withCodeCopyHandlers} innerHTML={renderMarkdown(msg().content)} />
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
