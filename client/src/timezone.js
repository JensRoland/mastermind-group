import { createSignal } from 'solid-js';

const [timezone, setTimezone] = createSignal('auto');

/** Returns the IANA timezone string to use for formatting. */
export function getEffectiveTimezone() {
  const tz = timezone();
  return tz === 'auto' ? Intl.DateTimeFormat().resolvedOptions().timeZone : tz;
}

export { timezone, setTimezone };

export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: getEffectiveTimezone(),
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const tz = getEffectiveTimezone();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz })
    + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz });
}
