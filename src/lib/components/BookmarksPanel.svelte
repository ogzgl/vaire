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
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20l-7-5-7 5V2z"/>
      </svg>
      <span class="empty-text">No bookmarks yet</span>
      <span class="empty-hint">Use Cmd+F11 to bookmark a line</span>
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
    height: 200px;
    gap: 8px;
  }

  .empty-text {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .empty-hint {
    color: var(--color-text-muted);
    font-size: 11px;
    opacity: 0.6;
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
