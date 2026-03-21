<script lang="ts">
  import { activeBottomPanel, bottomPanelHeight } from '$lib/stores/app';
  import Terminal from './Terminal.svelte';
  import GitLog from './GitLog.svelte';
  import TodoPanel from './TodoPanel.svelte';

  let terminalMounted = $state(false);
  let isResizing = $state(false);

  $effect(() => {
    if ($activeBottomPanel === 'terminal' && !terminalMounted) {
      terminalMounted = true;
    }
  });

  function startResize(e: MouseEvent) {
    isResizing = true;
    const startY = e.clientY;
    const startHeight = $bottomPanelHeight;

    function onMouseMove(e: MouseEvent) {
      const delta = startY - e.clientY;
      const newHeight = Math.max(120, Math.min(500, startHeight + delta));
      bottomPanelHeight.set(newHeight);
    }

    function onMouseUp() {
      isResizing = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
</script>

{#if $activeBottomPanel}
  <div class="bottom-panel" style="height: {$bottomPanelHeight}px">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resize-handle-h" onmousedown={startResize}></div>
    <div class="bottom-panel-header">
      <div class="bottom-panel-tabs">
        <button
          class="bottom-tab"
          class:active={$activeBottomPanel === 'terminal'}
          onclick={() => activeBottomPanel.set('terminal')}
        >
          Terminal
        </button>
        <button
          class="bottom-tab"
          class:active={$activeBottomPanel === 'git-log'}
          onclick={() => activeBottomPanel.set('git-log')}
        >
          Git Log
        </button>
        <button
          class="bottom-tab"
          class:active={$activeBottomPanel === 'todo'}
          onclick={() => activeBottomPanel.set('todo')}
        >
          TODO
        </button>
      </div>
      <button class="bottom-close" onclick={() => activeBottomPanel.set(null)} aria-label="Close panel">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>

    <div class="bottom-panel-content">
      {#if $activeBottomPanel === 'terminal'}
        {#if terminalMounted}
          <Terminal />
        {/if}
      {:else if $activeBottomPanel === 'git-log'}
        <GitLog />
      {:else if $activeBottomPanel === 'todo'}
        <TodoPanel />
      {/if}
    </div>
  </div>
{/if}

<style>
  .bottom-panel {
    background: var(--color-bg-surface);
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    position: relative;
  }

  .resize-handle-h {
    position: absolute;
    top: -2px;
    left: 0;
    right: 0;
    height: 4px;
    cursor: row-resize;
    z-index: 10;
    transition: background 0.15s ease;
  }

  .resize-handle-h:hover {
    background: var(--color-accent);
  }

  .bottom-panel-header {
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .bottom-panel-tabs {
    display: flex;
    gap: 2px;
  }

  .bottom-tab {
    padding: 4px 12px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .bottom-tab:hover {
    color: var(--color-text-secondary);
    background: var(--color-bg-hover);
  }

  .bottom-tab.active {
    color: var(--color-text-primary);
  }

  .bottom-close {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bottom-close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .bottom-panel-content {
    flex: 1;
    overflow: hidden;
  }
</style>
