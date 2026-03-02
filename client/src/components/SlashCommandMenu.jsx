import { createSignal, createEffect, For, Show } from 'solid-js';
import { api } from '../api.js';
import '../styles/slash-commands.css';

const COMMANDS = [
  { name: 'invite', description: 'Add an expert to this session', hasArg: 'expert-invite' },
  { name: 'kick', description: 'Remove an expert from this session', hasArg: 'expert-kick' },
  { name: 'pause', description: 'Pause the session', hasArg: false },
  { name: 'wrap-it-up', description: 'Wrap up and conclude the session', hasArg: false },
  { name: 'extend', description: 'Extend the session by more turns', hasArg: 'turns' },
  { name: 'archive', description: 'Archive this session', hasArg: false },
];

const TURN_OPTIONS = [
  { value: 5, label: '5 turns' },
  { value: 10, label: '10 turns' },
  { value: 20, label: '20 turns' },
];

export default function SlashCommandMenu(props) {
  const [stage, setStage] = createSignal('commands'); // 'commands' | 'expert-invite' | 'expert-kick' | 'turns'
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [allExperts, setAllExperts] = createSignal([]);
  const [filterText, setFilterText] = createSignal('');

  // Reset state when menu becomes visible
  createEffect((prev) => {
    const vis = props.visible;
    if (vis && !prev) {
      setStage('commands');
      setSelectedIndex(0);
      setFilterText('');
    }
    return vis;
  }, false);

  // Extract filter text from input
  createEffect(() => {
    if (!props.visible) return;
    const text = props.inputText;
    if (stage() === 'commands') {
      setFilterText(text.slice(1));
    } else {
      setFilterText(text);
    }
  });

  // Reset selected index when filter changes
  createEffect(() => {
    filterText();
    setSelectedIndex(0);
  });

  // Fetch all experts when entering expert picker stage
  createEffect(() => {
    if (stage() === 'expert-invite' || stage() === 'expert-kick') {
      api.getExperts().then(setAllExperts).catch(console.error);
    }
  });

  function filteredCommands() {
    const filter = filterText().toLowerCase();
    return COMMANDS.filter(cmd => cmd.name.startsWith(filter));
  }

  function filteredExperts() {
    const threadExpertIds = new Set(props.threadExperts.map(e => e.id));
    const filter = filterText().toLowerCase();

    let experts;
    if (stage() === 'expert-invite') {
      experts = allExperts().filter(e => !threadExpertIds.has(e.id));
    } else {
      experts = props.threadExperts;
    }

    if (filter) {
      experts = experts.filter(e => e.name.toLowerCase().includes(filter));
    }
    return experts;
  }

  function currentItems() {
    const s = stage();
    if (s === 'commands') return filteredCommands();
    if (s === 'expert-invite' || s === 'expert-kick') return filteredExperts();
    if (s === 'turns') return TURN_OPTIONS;
    return [];
  }

  function selectItem(index) {
    const items = currentItems();
    const item = items[index];
    if (!item) return;

    const s = stage();
    if (s === 'commands') {
      if (!item.hasArg) {
        props.onExecute(item.name, null);
      } else {
        setStage(item.hasArg);
        setSelectedIndex(0);
        setFilterText('');
        props.onStageChange(item.hasArg, item.name);
      }
    } else if (s === 'expert-invite') {
      props.onExecute('invite', item);
    } else if (s === 'expert-kick') {
      props.onExecute('kick', item);
    } else if (s === 'turns') {
      props.onExecute('extend', item.value);
    }
  }

  function handleKeyDown(e) {
    if (!props.visible) return false;

    const items = currentItems();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, items.length - 1));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (items.length > 0) {
        e.preventDefault();
        selectItem(selectedIndex());
        return true;
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (stage() !== 'commands') {
        setStage('commands');
        setSelectedIndex(0);
        setFilterText('');
        props.onStageChange('commands', null);
      } else {
        props.onDismiss();
      }
      return true;
    }
    return false;
  }

  // Expose handleKeyDown via the shared ref object
  if (props.menuRef) props.menuRef.handleKeyDown = handleKeyDown;

  return (
    <Show when={props.visible}>
      <div class="slash-menu">
        <Show when={stage() === 'commands'}>
          <div class="slash-menu-header">Commands</div>
          <Show when={filteredCommands().length === 0}>
            <div class="slash-menu-empty">No matching commands</div>
          </Show>
          <For each={filteredCommands()}>
            {(cmd, i) => (
              <div
                class={`slash-menu-item ${i() === selectedIndex() ? 'selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(i())}
                onClick={() => selectItem(i())}
              >
                <span class="slash-menu-item-command">/{cmd.name}</span>
                <span class="slash-menu-item-desc">{cmd.description}</span>
              </div>
            )}
          </For>
        </Show>

        <Show when={stage() === 'expert-invite' || stage() === 'expert-kick'}>
          <div class="slash-menu-header">
            {stage() === 'expert-invite' ? 'Invite expert' : 'Remove expert'}
          </div>
          <Show when={filteredExperts().length === 0}>
            <div class="slash-menu-empty">
              {stage() === 'expert-invite' ? 'No available experts' : 'No matching experts'}
            </div>
          </Show>
          <For each={filteredExperts()}>
            {(expert, i) => (
              <div
                class={`slash-menu-item ${i() === selectedIndex() ? 'selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(i())}
                onClick={() => selectItem(i())}
              >
                {expert.avatar_url ? (
                  <img class="slash-menu-item-avatar" src={expert.avatar_url} alt={expert.name} />
                ) : (
                  <div class="slash-menu-item-avatar-placeholder">
                    {expert.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span class="slash-menu-item-name">{expert.name}</span>
              </div>
            )}
          </For>
        </Show>

        <Show when={stage() === 'turns'}>
          <div class="slash-menu-header">Extend by</div>
          <For each={TURN_OPTIONS}>
            {(opt, i) => (
              <div
                class={`slash-menu-item ${i() === selectedIndex() ? 'selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(i())}
                onClick={() => selectItem(i())}
              >
                <span class="slash-menu-item-name">{opt.label}</span>
              </div>
            )}
          </For>
        </Show>
      </div>
    </Show>
  );
}
