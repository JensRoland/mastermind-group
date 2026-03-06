import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { navigate } from '../App.jsx';
import { api } from '../api.js';
import { subscribe, unsubscribe, onMessage } from '../ws.js';
import MessageBubble from './MessageBubble.jsx';
import SlashCommandMenu from './SlashCommandMenu.jsx';
import '../styles/thread.css';

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ThreadView(props) {
  const [thread, setThread] = createSignal(null);
  const [messages, setMessages] = createSignal([]);
  const [experts, setExperts] = createSignal([]);
  const [inputText, setInputText] = createSignal('');
  const [sending, setSending] = createSignal(false);
  const [thinkingExpert, setThinkingExpert] = createSignal(null);
  const [slashMenuStage, setSlashMenuStage] = createSignal(null); // tracks argument stage
  const [inputFocused, setInputFocused] = createSignal(false);
  let messagesContainer;
  let inputRef;

  const showSlashMenu = () => {
    if (!inputFocused()) return false;
    const text = inputText();
    // Show when input starts with "/" OR when we're in an argument stage
    return slashMenuStage() !== null || text.startsWith('/');
  };

  function isNearBottom() {
    if (!messagesContainer) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    return scrollHeight - scrollTop - clientHeight < 150;
  }

  function scrollToBottom(force = false) {
    if (!force && !isNearBottom()) return;
    requestAnimationFrame(() => {
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    });
  }

  // Load thread data when threadId changes
  createEffect(async () => {
    const id = props.threadId;
    if (!id) return;

    try {
      const data = await api.getThread(id);
      setThread(data.thread);
      setMessages(data.messages);
      setExperts(data.experts);
      setThinkingExpert(data.thinkingExpert || null);
      subscribe(id);
      scrollToBottom(true);
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
  });

  // Listen for WebSocket messages
  onMount(() => {
    const removeListener = onMessage((data) => {
      if (data.type === 'thinking' && data.expert) {
        setThinkingExpert(data.expert);
        scrollToBottom();
      }
      if (data.type === 'new_message' && data.message.thread_id === props.threadId) {
        setMessages(prev => [...prev, data.message]);
        setThinkingExpert(null);
        scrollToBottom();
      }
      if (data.type === 'message_liked' && data.messageId) {
        setMessages(prev => prev.map(m =>
          m.id === data.messageId ? { ...m, liked: data.liked ? 1 : 0 } : m
        ));
      }
      if (data.type === 'thread_status' && data.threadId === props.threadId) {
        setThread(prev => prev ? {
          ...prev,
          status: data.status,
          ...(data.max_turns !== undefined ? { max_turns: data.max_turns } : {}),
          ...(data.current_turn !== undefined ? { current_turn: data.current_turn } : {}),
        } : prev);
      }
      if (data.type === 'thread_archived' && data.threadId === props.threadId) {
        navigate('threads');
      }
    });

    onCleanup(() => {
      removeListener();
      unsubscribe();
    });
  });

  function resizeTextarea() {
    if (!inputRef) return;
    inputRef.style.height = 'auto';
    inputRef.style.height = Math.min(inputRef.scrollHeight, inputRef.clientHeight || 999) + 'px';
    inputRef.style.height = Math.min(inputRef.scrollHeight, 150) + 'px';
  }

  async function sendMessage() {
    const content = inputText().trim();
    if (!content || sending()) return;
    // Don't send slash commands as messages
    if (content.startsWith('/')) return;

    setSending(true);
    try {
      await api.sendMessage(props.threadId, content);
      setInputText('');
      resizeTextarea();
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }

  async function handleWrapUp() {
    try {
      const result = await api.wrapUp(props.threadId);
      setThread(prev => prev ? { ...prev, max_turns: result.max_turns, status: 'active' } : prev);
    } catch (err) {
      console.error('Failed to wrap up:', err);
    }
  }

  async function handleExtend(turns = 10) {
    try {
      const result = await api.extendTurns(props.threadId, turns);
      setThread(prev => prev ? { ...prev, max_turns: result.max_turns, status: result.status } : prev);
    } catch (err) {
      console.error('Failed to extend:', err);
    }
  }

  async function handlePauseResume() {
    const t = thread();
    if (!t) return;
    const newStatus = t.status === 'active' ? 'paused' : 'active';
    try {
      await api.setStatus(props.threadId, newStatus);
      setThread(prev => prev ? { ...prev, status: newStatus } : prev);
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  }

  async function handleInvite(expert) {
    try {
      await api.addExpertToThread(props.threadId, expert.id);
      setExperts(prev => [...prev, expert]);
    } catch (err) {
      console.error('Failed to invite expert:', err);
    }
  }

  async function handleKick(expert) {
    try {
      await api.removeExpertFromThread(props.threadId, expert.id);
      setExperts(prev => prev.filter(e => e.id !== expert.id));
    } catch (err) {
      console.error('Failed to remove expert:', err);
    }
  }

  function handleSlashCommand(command, arg) {
    setInputText('');
    setSlashMenuStage(null);

    switch (command) {
      case 'pause':
      case 'resume':
        handlePauseResume();
        break;
      case 'wrap-it-up':
        handleWrapUp();
        break;
      case 'extend':
        handleExtend(arg);
        break;
      case 'invite':
        handleInvite(arg);
        break;
      case 'kick':
        handleKick(arg);
        break;
      case 'archive':
        handleArchive();
        break;
    }
  }

  async function handleArchive() {
    try {
      await api.archiveThread(props.threadId);
      navigate('threads');
    } catch (err) {
      console.error('Failed to archive:', err);
    }
  }

  function handleSlashMenuStageChange(stage, commandName) {
    if (stage === 'commands') {
      setSlashMenuStage(null);
      setInputText('/');
      inputRef?.focus();
    } else {
      setSlashMenuStage(stage);
      setInputText('');
      inputRef?.focus();
    }
  }

  function dismissSlashMenu() {
    setInputText('');
    setSlashMenuStage(null);
    inputRef?.focus();
  }

  const isActive = () => thread()?.status === 'active';
  const canInteract = () => thread()?.status === 'active' || thread()?.status === 'paused';

  return (
    <Show when={thread()} fallback={<div class="empty-state">Loading...</div>}>
      <div class="thread-view">
        <header class="thread-header">
          <h2>{thread().title}</h2>
          <div class="thread-meta">
            <span class="thread-created">{formatDateTime(thread().created_at)}</span>
            <span class="meta-separator">·</span>
            <span class="thread-turns">Turn {thread().current_turn} / {thread().max_turns}</span>
            <span class={`status-badge ${thread().status}`}>{thread().status}</span>
          </div>
          <div class="thread-actions">
            <Show when={canInteract()}>
              <button onClick={handlePauseResume}>
                {isActive() ? 'Pause' : 'Resume'}
              </button>
            </Show>
            <button onClick={() => handleExtend(10)} disabled={thread().status === 'concluded'}>
              +10 Turns
            </button>
            <button class="danger" onClick={handleWrapUp} disabled={!canInteract()}>
              Wrap It Up
            </button>
            <button onClick={() => api.exportThread(props.threadId)} title="Download as Markdown">
              Export
            </button>
          </div>
        </header>

        <div class="messages-container" ref={messagesContainer}>
          <div class="messages-inner">
            <For each={messages()}>
              {(msg) => <MessageBubble message={msg} moderatorName={props.moderatorName} />}
            </For>
            <Show when={thinkingExpert()}>
              {(expert) => (
                <div class="message-bubble thinking">
                  <div class="message-avatar">
                    {expert().avatar_url ? (
                      <img src={expert().avatar_url} alt={expert().name} />
                    ) : (
                      <div class="avatar-placeholder">
                        {expert().name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div class="message-body">
                    <div class="thinking-text">
                      {expert().id === null
                        ? `${expert().name || 'Moderator'} is summarizing the discussion...`
                        : `${expert().name} is thinking...`}
                    </div>
                  </div>
                </div>
              )}
            </Show>
            <div />
          </div>
        </div>

        <footer class="message-input">
          <div class="message-input-inner slash-menu-wrapper">
            <SlashCommandMenu
              visible={showSlashMenu()}
              inputText={inputText()}
              threadId={props.threadId}
              threadExperts={experts()}
              threadStatus={thread()?.status}
              onExecute={handleSlashCommand}
              onStageChange={handleSlashMenuStageChange}
              onDismiss={dismissSlashMenu}
            />
            <textarea
              ref={inputRef}
              rows="1"
              placeholder={canInteract()
                ? (slashMenuStage()
                  ? "Type to filter..."
                  : "Type / for commands, or send a message...")
                : "Send a message to reopen the discussion..."}
              value={inputText()}
              onInput={(e) => {
                setInputText(e.target.value);
                resizeTextarea();
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={sending()}
            />
            <button onClick={sendMessage} disabled={sending() || !inputText().trim() || inputText().startsWith('/')}>
              Send
            </button>
          </div>
        </footer>
      </div>
    </Show>
  );
}
