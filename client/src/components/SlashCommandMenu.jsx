import { createSignal, createEffect, onCleanup, For, Show } from 'solid-js';
import { api } from '../api.js';
import '../styles/slash-commands.css';

const COMMANDS = [
  { name: 'invite', description: 'Add an expert to this session', hasArg: 'expert-invite' },
  { name: 'kick', description: 'Remove an expert from this session', hasArg: 'expert-kick', confirm: true },
  { name: 'pause', description: 'Pause the session', hasArg: false },
  { name: 'wrap-it-up', description: 'Wrap up and conclude the session', hasArg: false, confirm: true },
  { name: 'extend', description: 'Extend the session by more turns', hasArg: 'turns' },
  { name: 'archive', description: 'Archive this session', hasArg: false, confirm: true },
];

const TURN_OPTIONS = [
  { value: 5, label: '5 turns' },
  { value: 10, label: '10 turns' },
  { value: 20, label: '20 turns' },
];

export default function SlashCommandMenu(props) {
  const [stage, setStage] = createSignal('commands');
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [allExperts, setAllExperts] = createSignal([]);
  const [filterText, setFilterText] = createSignal('');
  const [pendingConfirm, setPendingConfirm] = createSignal(null); // command name awaiting confirmation
  const [pendingArg, setPendingArg] = createSignal(null); // argument awaiting confirmation

  const CONFIRM_OPTIONS = [
    { label: 'Yes', value: true },
    { label: 'Cancel', value: false },
  ];

  // Reset state when menu becomes visible
  createEffect((prev) => {
    const vis = props.visible;
    if (vis && !prev) {
      setStage('commands');
      setSelectedIndex(0);
      setFilterText('');
      setPendingConfirm(null);
      setPendingArg(null);
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
    if (s === 'confirm') return CONFIRM_OPTIONS;
    return [];
  }

  // Look up the COMMANDS entry for the pending confirm command
  function pendingCommand() {
    return COMMANDS.find(c => c.name === pendingConfirm());
  }

  function selectItem(index) {
    const items = currentItems();
    const item = items[index];
    if (!item) return;

    const s = stage();
    if (s === 'commands') {
      if (item.hasArg) {
        // Has argument stage — go there first (confirm comes after if needed)
        setPendingConfirm(item.confirm ? item.name : null);
        setStage(item.hasArg);
        setSelectedIndex(0);
        setFilterText('');
        props.onStageChange(item.hasArg, item.name);
      } else if (item.confirm) {
        // No arg, but needs confirmation
        setPendingConfirm(item.name);
        setPendingArg(null);
        setStage('confirm');
        setSelectedIndex(0);
        setFilterText('');
        props.onStageChange('confirm', item.name);
      } else {
        props.onExecute(item.name, null);
      }
    } else if (s === 'expert-invite') {
      props.onExecute('invite', item);
    } else if (s === 'expert-kick') {
      if (pendingConfirm()) {
        // Kick needs confirmation — store the selected expert and move to confirm
        setPendingArg(item);
        setStage('confirm');
        setSelectedIndex(0);
        setFilterText('');
        props.onStageChange('confirm', 'kick');
      } else {
        props.onExecute('kick', item);
      }
    } else if (s === 'turns') {
      props.onExecute('extend', item.value);
    } else if (s === 'confirm') {
      if (item.value) {
        props.onExecute(pendingConfirm(), pendingArg());
      } else {
        setStage('commands');
        setSelectedIndex(0);
        setPendingConfirm(null);
        setPendingArg(null);
        props.onStageChange('commands', null);
      }
    }
  }

  // Listen for keyboard events directly on window (capture phase)
  function onKeyDown(e) {
    if (!props.visible) return;

    const items = currentItems();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (items.length > 0) {
        e.preventDefault();
        selectItem(selectedIndex());
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (stage() !== 'commands') {
        setStage('commands');
        setSelectedIndex(0);
        setFilterText('');
        setPendingConfirm(null);
        setPendingArg(null);
        props.onStageChange('commands', null);
      } else {
        props.onDismiss();
      }
    }
  }

  window.addEventListener('keydown', onKeyDown, true);
  onCleanup(() => window.removeEventListener('keydown', onKeyDown, true));

  return (
    <Show when={props.visible}>
      <div class="slash-menu" onMouseDown={(e) => e.preventDefault()}>
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

        <Show when={stage() === 'confirm'}>
          <div class="slash-menu-header">
            /{pendingConfirm()}{pendingArg()?.name ? ` ${pendingArg().name}` : ''} — are you sure?
          </div>
          <For each={CONFIRM_OPTIONS}>
            {(opt, i) => (
              <div
                class={`slash-menu-item ${i() === selectedIndex() ? 'selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(i())}
                onClick={() => selectItem(i())}
              >
                <span class={`slash-menu-item-name ${opt.value ? 'confirm-yes' : ''}`}>{opt.label}</span>
              </div>
            )}
          </For>
        </Show>
      </div>
    </Show>
  );
}
