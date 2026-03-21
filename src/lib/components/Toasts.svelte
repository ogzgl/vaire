<script lang="ts">
  import { toasts, dismissToast } from '$lib/stores/notifications';

  const ICONS: Record<string, string> = {
    success: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg>`,
    error:   `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/></svg>`,
    info:    `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>`,
  };
</script>

<div class="toasts-container">
  {#each $toasts as toast (toast.id)}
    <div class="toast toast-{toast.type}" role="alert">
      <span class="toast-icon" aria-hidden="true">{@html ICONS[toast.type]}</span>
      <span class="toast-message">{toast.message}</span>
      <button class="toast-close" onclick={() => dismissToast(toast.id)} aria-label="Dismiss">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>
  {/each}
</div>

<style>
  .toasts-container {
    position: fixed;
    bottom: 36px; /* above status bar */
    right: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 1000;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-family: var(--font-ui, sans-serif);
    min-width: 220px;
    max-width: 380px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    border: 1px solid var(--color-border);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    pointer-events: all;
    animation: toastIn 0.18s ease-out;
  }

  @keyframes toastIn {
    from { opacity: 0; transform: translateY(10px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .toast-success {
    border-left: 3px solid var(--color-success);
  }

  .toast-error {
    border-left: 3px solid var(--color-error);
  }

  .toast-info {
    border-left: 3px solid var(--color-info);
  }

  .toast-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .toast-success .toast-icon { color: var(--color-success); }
  .toast-error   .toast-icon { color: var(--color-error); }
  .toast-info    .toast-icon { color: var(--color-info); }

  .toast-message {
    flex: 1;
    line-height: 1.4;
    color: var(--color-text-secondary);
  }

  .toast-close {
    background: transparent;
    border: none;
    padding: 2px;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.1s, color 0.1s;
  }

  .toast-close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
</style>
