<script lang="ts">
  import { diffDialogState, closeDiffDialog } from '$lib/stores/diff';
  import MonacoDiffEditor from './MonacoDiffEditor.svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { onMount, onDestroy } from 'svelte';

  let dialogX = $state(0);
  let dialogY = $state(0);
  let dialogW = $state(900);
  let dialogH = $state(580);
  let positioned = $state(false);

  function resetPosition() {
    dialogW = Math.min(900, window.innerWidth - 48);
    dialogH = Math.min(580, window.innerHeight - 80);
    dialogX = (window.innerWidth - dialogW) / 2;
    dialogY = (window.innerHeight - dialogH) / 2;
    positioned = true;
  }

  $effect(() => {
    if ($diffDialogState?.isOpen && !positioned) {
      resetPosition();
    }
    if (!$diffDialogState?.isOpen) {
      positioned = false;
    }
  });

  function startDrag(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    e.preventDefault();
    const startX = e.clientX - dialogX;
    const startY = e.clientY - dialogY;

    function onMove(ev: MouseEvent) {
      dialogX = ev.clientX - startX;
      dialogY = ev.clientY - startY;
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startResize(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = dialogW;
    const startH = dialogH;

    function onMove(ev: MouseEvent) {
      dialogW = Math.max(400, startW + (ev.clientX - startX));
      dialogH = Math.max(300, startH + (ev.clientY - startY));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function acceptAll() {
    if (!$diffDialogState) return;
    try {
      // Read modified content from git working tree (it's already there)
      // Just close the dialog — user has accepted
      closeDiffDialog();
    } catch (e) {
      console.error('Accept failed:', e);
    }
  }

  async function rejectAll() {
    if (!$diffDialogState) return;
    try {
      await invoke('git_command', {
        repoPath: $diffDialogState.repoPath,
        args: ['checkout', '--', $diffDialogState.filePath],
      });
      closeDiffDialog();
    } catch (e) {
      console.error('Reject failed:', e);
    }
  }

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
    <div
      class="diff-dialog"
      style="left: {dialogX}px; top: {dialogY}px; width: {dialogW}px; height: {dialogH}px"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Title bar (draggable) -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="title-bar" onmousedown={startDrag}>
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

        <!-- Action toolbar -->
        <div class="diff-actions">
          <button class="diff-action-btn accept" onclick={acceptAll} title="Accept All (close)">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
            Accept
          </button>
          <button class="diff-action-btn reject" onclick={rejectAll} title="Reject All (revert file)">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
            Revert
          </button>
        </div>

        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button class="close-btn" onclick={closeDiffDialog} title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>

      <!-- Diff editor -->
      <div class="diff-body">
        {#key `${$diffDialogState.repoPath}:${$diffDialogState.filePath}:${$diffDialogState.staged}`}
          <MonacoDiffEditor
            repoPath={$diffDialogState.repoPath}
            filePath={$diffDialogState.filePath}
            staged={$diffDialogState.staged}
          />
        {/key}
      </div>

      <!-- Resize handle -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resize-handle" onmousedown={startResize}></div>
    </div>
  </div>
{/if}

<style>
  .diff-dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 300;
    animation: fadeIn 0.1s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .diff-dialog {
    position: absolute;
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
    cursor: move;
    -webkit-user-select: none;
    user-select: none;
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

  .diff-actions {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-left: 4px;
    flex-shrink: 0;
  }

  .diff-action-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .diff-action-btn.accept {
    color: var(--color-success);
  }

  .diff-action-btn.accept:hover {
    background: rgba(74, 222, 128, 0.15);
  }

  .diff-action-btn.reject {
    color: var(--color-error, #f87171);
  }

  .diff-action-btn.reject:hover {
    background: rgba(248, 113, 113, 0.15);
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

  .resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 16px;
    height: 16px;
    cursor: se-resize;
    z-index: 10;
  }

  .resize-handle::after {
    content: '';
    position: absolute;
    bottom: 3px;
    right: 3px;
    width: 8px;
    height: 8px;
    border-right: 2px solid var(--color-text-muted);
    border-bottom: 2px solid var(--color-text-muted);
    opacity: 0.4;
  }
</style>
