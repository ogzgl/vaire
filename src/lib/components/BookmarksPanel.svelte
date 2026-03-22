<script lang="ts">
  import { bookmarks, removeBookmark, type Bookmark } from '$lib/stores/bookmarks';

  function navigateTo(bm: Bookmark) {
    // Open the file and go to the line
    window.dispatchEvent(new CustomEvent('vaire:open-file', { detail: { path: bm.filePath } }));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('vaire:goto-line', { detail: { line: bm.line } }));
    }, 200);
  }

  // Group bookmarks by file
  let grouped = $derived.by(() => {
    const groups = new Map<string, { fileName: string; bookmarks: Bookmark[] }>();
    for (const bm of $bookmarks) {
      if (!groups.has(bm.filePath)) {
        groups.set(bm.filePath, { fileName: bm.label || bm.filePath.split('/').pop() || bm.filePath, bookmarks: [] });
      }
      groups.get(bm.filePath)!.bookmarks.push(bm);
    }
    return Array.from(groups.values());
  });
</script>

<div class="bookmarks-panel">
  {#if $bookmarks.length === 0}
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.2">
        <path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5.5L4 22V4a2 2 0 0 1 2-2Z"/>
      </svg>
      <span class="empty-title">No bookmarks</span>
      <span class="empty-text">Bookmark lines to quickly jump back to important code.</span>
      <div class="empty-shortcuts">
        <div class="shortcut-row">
          <kbd>Cmd+F11</kbd>
          <span>Toggle Bookmark</span>
        </div>
        <div class="shortcut-row">
          <kbd>F11</kbd>
          <span>Jump to Next</span>
        </div>
        <div class="shortcut-row">
          <kbd>Right-click</kbd>
          <span>Toggle Bookmark (editor menu)</span>
        </div>
      </div>
      <button class="bookmark-current-btn" onclick={() => {
        window.dispatchEvent(new CustomEvent('vaire:bookmark-current-line'));
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
        </svg>
        Bookmark Current Line
      </button>
    </div>
  {:else}
    <div class="bookmark-list">
      {#each grouped as group}
        <div class="bookmark-group">
          <div class="bookmark-file-header">{group.fileName}</div>
          {#each group.bookmarks as bm}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="bookmark-item" onclick={() => navigateTo(bm)}>
              <span class="bookmark-marker"></span>
              <span class="bookmark-line">Line {bm.line}</span>
              <button class="bookmark-remove" onclick={(e) => { e.stopPropagation(); removeBookmark(bm.filePath, bm.line); }} aria-label="Remove bookmark">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .bookmarks-panel {
    padding: 4px 0;
    height: 100%;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    gap: 10px;
  }

  .empty-title {
    color: var(--color-text-secondary);
    font-size: 14px;
    font-weight: 600;
    margin-top: 4px;
  }

  .empty-text {
    color: var(--color-text-muted);
    font-size: 12px;
    text-align: center;
    line-height: 1.5;
    max-width: 200px;
  }

  .empty-shortcuts {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    width: 100%;
    max-width: 220px;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .shortcut-row kbd {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 10px;
    font-family: var(--font-ui);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .bookmark-current-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    margin-top: 8px;
    background: var(--color-bg-hover);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bookmark-current-btn:hover {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .bookmark-group {
    margin-bottom: 4px;
  }

  .bookmark-file-header {
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .bookmark-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px 4px 20px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.1s;
  }

  .bookmark-item:hover {
    background: var(--color-bg-hover);
  }

  .bookmark-marker {
    width: 6px;
    height: 6px;
    border-radius: 1px;
    background: #f0a030;
    flex-shrink: 0;
  }

  .bookmark-line {
    color: var(--color-text-secondary);
    flex: 1;
  }

  .bookmark-remove {
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    border-radius: 3px;
  }

  .bookmark-item:hover .bookmark-remove {
    opacity: 1;
  }

  .bookmark-remove:hover {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }
</style>
