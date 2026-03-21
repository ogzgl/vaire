<script lang="ts">
  // UpdateProjectDialog.svelte
  // Shown when git pull --ff-only fails because the branch has diverged.
  // Lets the user choose between Merge and Rebase.

  interface Props {
    repoPath: string;
    onConfirm: (strategy: 'merge' | 'rebase') => void;
    onCancel: () => void;
  }

  let { repoPath, onConfirm, onCancel }: Props = $props();

  let strategy = $state<'merge' | 'rebase'>('merge');

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { onCancel(); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onConfirm(strategy);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dialog-backdrop" onkeydown={handleKeydown} tabindex="-1">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
    <div class="title-bar">
      <span class="title-text" id="update-dialog-title">Update Project</span>
      <!-- svelte-ignore a11y_consider_explicit_label -->
      <button class="close-btn" onclick={onCancel}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>

    <div class="body">
      <p class="description">
        The current branch has diverged from the remote. Choose how to integrate the incoming changes:
      </p>

      <div class="options">
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <label class="option" class:option-selected={strategy === 'merge'} onclick={() => strategy = 'merge'}>
          <input type="radio" name="strategy" value="merge" checked={strategy === 'merge'} onchange={() => strategy = 'merge'} />
          <div class="option-content">
            <span class="option-title">Merge</span>
            <span class="option-desc">Merge incoming changes into the current branch (creates a merge commit)</span>
          </div>
        </label>

        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <label class="option" class:option-selected={strategy === 'rebase'} onclick={() => strategy = 'rebase'}>
          <input type="radio" name="strategy" value="rebase" checked={strategy === 'rebase'} onchange={() => strategy = 'rebase'} />
          <div class="option-content">
            <span class="option-title">Rebase</span>
            <span class="option-desc">Rebase the current branch on top of the incoming changes (linear history)</span>
          </div>
        </label>
      </div>
    </div>

    <div class="dialog-footer">
      <span class="footer-hint"><kbd>⌘Enter</kbd> to confirm</span>
      <div class="footer-actions">
        <button class="btn-secondary" onclick={onCancel}>Cancel</button>
        <button class="btn-primary" onclick={() => onConfirm(strategy)}>OK</button>
      </div>
    </div>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    outline: none;
  }

  .dialog {
    width: 420px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.04);
    animation: dialogIn 0.12s ease-out;
  }

  @keyframes dialogIn {
    from { opacity: 0; transform: scale(0.97) translateY(-4px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  .title-bar {
    display: flex;
    align-items: center;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    height: 32px;
    padding: 0 8px 0 14px;
    flex-shrink: 0;
  }

  .title-text {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .close-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .close-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .body {
    padding: 16px 16px 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .description {
    font-size: 12px;
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .option {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
    background: var(--color-bg-base);
  }

  .option:hover {
    background: var(--color-bg-hover);
    border-color: var(--color-border-focus);
  }

  .option-selected {
    background: var(--color-accent-subtle) !important;
    border-color: var(--color-accent) !important;
  }

  .option input[type="radio"] {
    margin-top: 2px;
    accent-color: var(--color-accent);
    flex-shrink: 0;
  }

  .option-content {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .option-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .option-desc {
    font-size: 11px;
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--color-bg-surface);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
    margin-top: 8px;
  }

  .footer-hint {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .footer-hint kbd {
    font-family: inherit;
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--color-bg-active);
    border: 1px solid var(--color-border);
  }

  .footer-actions {
    display: flex;
    gap: 6px;
  }

  .btn-secondary,
  .btn-primary {
    padding: 5px 16px;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.1s;
    white-space: nowrap;
  }

  .btn-secondary {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .btn-secondary:hover {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }

  .btn-primary {
    background: var(--color-accent);
    color: #fff;
    border-color: transparent;
  }

  .btn-primary:hover {
    background: var(--color-accent-hover);
  }
</style>
