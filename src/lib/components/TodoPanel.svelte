<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { workspacePath } from '$lib/stores/workspace';

  interface TodoItem {
    file_path: string;
    relative_path: string;
    line: number;
    kind: string;
    text: string;
  }

  interface GroupedTodos {
    relativePath: string;
    filePath: string;
    items: TodoItem[];
    expanded: boolean;
  }

  let todos = $state<TodoItem[]>([]);
  let groups = $state<GroupedTodos[]>([]);
  let isLoading = $state(false);
  let filterKind = $state<string>('ALL');
  let searchQuery = $state('');

  const KIND_COLORS: Record<string, string> = {
    TODO: 'var(--color-info)',
    FIXME: 'var(--color-error)',
    HACK: 'var(--color-warning)',
    XXX: 'var(--color-warning)',
  };

  async function scan() {
    const wsPath = $workspacePath;
    if (!wsPath) return;

    isLoading = true;
    try {
      const items = await invoke<TodoItem[]>('scan_todos', { workspacePath: wsPath });
      todos = items;
      buildGroups(items);
    } catch (e) {
      console.error('scan_todos failed:', e);
      todos = [];
      groups = [];
    }
    isLoading = false;
  }

  // Use a separate set to track expanded state (not reactive dependency)
  let expandedPaths = new Set<string>();

  function buildGroups(items: TodoItem[]) {
    const fk = filterKind;
    const sq = searchQuery;

    const filtered = items.filter(item => {
      const matchKind = fk === 'ALL' || item.kind === fk;
      const matchSearch = !sq || item.text.toLowerCase().includes(sq.toLowerCase()) || item.relative_path.toLowerCase().includes(sq.toLowerCase());
      return matchKind && matchSearch;
    });

    const map = new Map<string, TodoItem[]>();
    for (const item of filtered) {
      const key = item.relative_path;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    groups = Array.from(map.entries()).map(([rel, fileItems]) => ({
      relativePath: rel,
      filePath: fileItems[0].file_path,
      items: fileItems,
      expanded: expandedPaths.has(rel) || expandedPaths.size === 0,
    }));
  }

  // Derived groups based on filter — no infinite loop
  $effect(() => {
    // Only depend on filterKind, searchQuery, and todos
    const _fk = filterKind;
    const _sq = searchQuery;
    const _t = todos;
    // Use untrack-like approach: build without reading groups $state
    buildGroups(_t);
  });

  // Don't auto-scan — user clicks "Scan" button
  // Large projects can take a while

  function navigateToTodo(item: TodoItem) {
    window.dispatchEvent(new CustomEvent('vaire:open-file', { detail: { path: item.file_path } }));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('vaire:goto-line', { detail: { line: item.line } }));
    }, 150);
  }

  function totalCount(): number {
    return groups.reduce((s, g) => s + g.items.length, 0);
  }
</script>

<div class="todo-panel">
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="filter-tabs">
      {#each ['ALL', 'TODO', 'FIXME', 'HACK', 'XXX'] as kind}
        <button
          class="filter-tab"
          class:active={filterKind === kind}
          onclick={() => { filterKind = kind; }}
        >{kind}</button>
      {/each}
    </div>
    <div class="toolbar-right">
      <input
        class="search-input"
        type="text"
        placeholder="Filter..."
        bind:value={searchQuery}
      />
      <button class="refresh-btn" onclick={scan} title="Rescan" disabled={isLoading}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class:spinning={isLoading}>
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Results -->
  <div class="results">
    {#if isLoading}
      <div class="loading">Scanning for TODOs...</div>
    {:else if groups.length === 0}
      <div class="empty-state">
        {#if $workspacePath}
          <span>No {filterKind !== 'ALL' ? filterKind : 'TODO/FIXME'} comments found</span>
        {:else}
          <span>Open a workspace to scan for TODOs</span>
        {/if}
      </div>
    {:else}
      <div class="result-summary">{totalCount()} item{totalCount() !== 1 ? 's' : ''} in {groups.length} file{groups.length !== 1 ? 's' : ''}</div>
      {#each groups as group}
        <div class="file-group">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="file-header"
            onclick={() => { group.expanded = !group.expanded; if (group.expanded) expandedPaths.add(group.relativePath); else expandedPaths.delete(group.relativePath); }}
            role="button"
            tabindex="0"
            onkeydown={(e) => { if (e.key === 'Enter') { group.expanded = !group.expanded; if (group.expanded) expandedPaths.add(group.relativePath); else expandedPaths.delete(group.relativePath); } }}
          >
            <svg
              class="chevron"
              class:expanded={group.expanded}
              width="11" height="11" viewBox="0 0 16 16" fill="currentColor"
            >
              <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
            </svg>
            <span class="file-name">{group.relativePath.split('/').pop()}</span>
            <span class="file-path-hint">{group.relativePath.includes('/') ? group.relativePath.substring(0, group.relativePath.lastIndexOf('/')) : ''}</span>
            <span class="item-count">{group.items.length}</span>
          </div>

          {#if group.expanded}
            {#each group.items as item}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="todo-row"
                onclick={() => navigateToTodo(item)}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && navigateToTodo(item)}
              >
                <span class="todo-kind" style="color: {KIND_COLORS[item.kind] || 'var(--color-text-muted)'}">{item.kind}</span>
                <span class="todo-text">{item.text || '(no description)'}</span>
                <span class="todo-line">{item.line}</span>
              </div>
            {/each}
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .todo-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-surface);
    flex-shrink: 0;
    gap: 6px;
    flex-wrap: wrap;
  }

  .filter-tabs {
    display: flex;
    gap: 2px;
  }

  .filter-tab {
    padding: 2px 8px;
    font-size: 10px;
    font-family: inherit;
    font-weight: 600;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 3px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.1s;
  }

  .filter-tab:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .filter-tab.active {
    background: var(--color-accent-subtle);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .search-input {
    height: 22px;
    padding: 0 7px;
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    font-size: 11px;
    font-family: inherit;
    outline: none;
    width: 120px;
  }

  .search-input:focus {
    border-color: var(--color-accent);
  }

  .search-input::placeholder {
    color: var(--color-text-muted);
  }

  .refresh-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.1s;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .refresh-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .spinning {
    animation: spin 0.8s linear infinite;
  }

  .results {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .loading,
  .empty-state {
    padding: 24px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .result-summary {
    padding: 4px 10px 2px;
    font-size: 10px;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .file-group {
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .file-header {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 12px;
    background: var(--color-bg-surface);
    user-select: none;
    transition: background 0.1s;
  }

  .file-header:hover {
    background: var(--color-bg-hover);
  }

  .chevron {
    color: var(--color-text-muted);
    transition: transform 0.15s ease;
    flex-shrink: 0;
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .file-name {
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .file-path-hint {
    color: var(--color-text-muted);
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    opacity: 0.7;
  }

  .item-count {
    font-size: 10px;
    color: var(--color-text-muted);
    flex-shrink: 0;
    background: var(--color-bg-active);
    padding: 1px 5px;
    border-radius: 8px;
  }

  .todo-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px 3px 24px;
    font-size: 12px;
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
  }

  .todo-row:hover {
    background: var(--color-bg-hover);
  }

  .todo-kind {
    font-size: 10px;
    font-weight: 700;
    font-family: var(--font-editor, monospace);
    width: 40px;
    flex-shrink: 0;
  }

  .todo-text {
    flex: 1;
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .todo-line {
    font-size: 10px;
    color: var(--color-text-muted);
    font-family: var(--font-editor, monospace);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
</style>
