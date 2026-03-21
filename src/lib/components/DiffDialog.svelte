<script lang="ts">
  import { diffDialogState, closeDiffDialog } from '$lib/stores/diff';
  import MonacoDiffEditor from './MonacoDiffEditor.svelte';
  import { onMount, onDestroy } from 'svelte';

  function handleKeydown(e: KeyboardEvent) {
    if (!$diffDialogState?.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeDiffDialog();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown, true);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown, true);
  });
</script>

{#if $diffDialogState?.isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="diff-dialog-overlay" onclick={closeDiffDialog}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="diff-dialog" onclick={(e) => e.stopPropagation()}>
      <!-- Title bar -->
      <div class="title-bar">
        <span class="diff-icon">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 7h2.79l-1.147 1.146a.5.5 0 0 0 .707.708l2-1.999.007-.007.006-.006a.5.5 0 0 0-.006-.706l-2-2a.5.5 0 0 0-.707.707L8.79 6H6a1 1 0 0 1-1-1V3.5a.5.5 0 0 0-1 0V5a2 2 0 0 0 2 2"/>
          </svg>
        </span>
        <span class="title-text">Diff: {$diffDialogState.fileName}</span>
        <span class="title-path">{$diffDialogState.filePath}</span>
        <span class="title-meta">
          {$diffDialogState.staged ? 'staged' : 'unstaged'} · {$diffDialogState.repoPath.split('/').pop()}
        </span>
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button class="close-btn" onclick={closeDiffDialog} title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>

      <!-- Diff editor (includes its own toolbar with accept/reject) -->
      <div class="diff-body">
        {#key `${$diffDialogState.repoPath}:${$diffDialogState.filePath}:${$diffDialogState.staged}`}
          <MonacoDiffEditor
            repoPath={$diffDialogState.repoPath}
            filePath={$diffDialogState.filePath}
            staged={$diffDialogState.staged}
          />
        {/key}
      </div>
    </div>
  </div>
{/if}

<style>
  .diff-dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    animation: fadeIn 0.1s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .diff-dialog {
    width: 900px;
    height: 580px;
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 80px);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.04);
    animation: dialogIn 0.12s ease-out;
  }

  @keyframes dialogIn {
    from { opacity: 0; transform: scale(0.97) translateY(-6px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  .title-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 10px 0 12px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    min-width: 0;
  }

  .diff-icon {
    color: var(--color-accent);
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .title-text {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .title-path {
    font-size: 11px;
    color: var(--color-text-muted);
    font-family: var(--font-editor, monospace);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .title-meta {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .close-btn {
    margin-left: 4px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.1s, color 0.1s;
  }

  .close-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .diff-body {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }
</style>
