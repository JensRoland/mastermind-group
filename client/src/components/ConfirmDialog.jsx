import { Show } from 'solid-js';
import '../styles/modals.css';

export default function ConfirmDialog(props) {
  return (
    <Show when={props.open}>
      <div class="modal-overlay" onClick={(e) => e.target === e.currentTarget && props.onCancel()}>
        <div class="modal confirm-dialog">
          <h2>{props.title || 'Confirm'}</h2>
          <p class="confirm-dialog-message">{props.message}</p>
          <div class="modal-actions">
            <button class="btn-secondary" onClick={props.onCancel}>Cancel</button>
            <button class={props.danger ? 'btn-danger' : 'btn-primary'} onClick={props.onConfirm}>
              {props.confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
