<script lang="ts">
  import { tick } from 'svelte';
  import { activeSidebarPanel } from '$lib/stores/app';
  import { fileTree, openFile, openWorkspace, toggleNode, workspacePath, gitFileStatuses, activeFilePath, type FileNode } from '$lib/stores/workspace';
  import { open } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import GitPanel from './GitPanel.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import StructurePanel from './StructurePanel.svelte';
  import BookmarksPanel from './BookmarksPanel.svelte';
  import TodoPanel from './TodoPanel.svelte';
  import { getFileIconSvg } from '$lib/utils/fileIcons';

  interface SearchResult {
    path: string;
    relative_path: string;
    line_number: number;
    line_content: string;
    match_start: number;
    match_end: number;
  }

  let searchQuery = $state('');
  let searchResults = $state<SearchResult[]>([]);
  let isSearching = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout>;

  // Context menu state
  let contextMenu = $state<{ x: number; y: number; node: FileNode } | null>(null);

  async function handleSearch() {
    const ws = $workspacePath;
    if (!ws || searchQuery.trim().length < 2) {
      searchResults = [];
      isSearching = false;
      return;
    }

    isSearching = true;
    try {
      searchResults = await invoke<SearchResult[]>('search_in_files', {
        workspacePath: ws,
        query: searchQuery,
        caseSensitive: false,
        maxResults: 100,
      });
    } catch (e) {
      console.error('Search failed:', e);
      searchResults = [];
    }
    isSearching = false;
  }

  function onSearchInput() {
    clearTimeout(searchTimeout);
    if (searchQuery.trim().length < 2) {
      searchResults = [];
      return;
    }
    searchTimeout = setTimeout(handleSearch, 500);
  }

  interface ResultGroup {
    filePath: string;
    fileName: string;
    dirPath: string;
    results: SearchResult[];
  }

  let groupedResults = $derived.by(() => {
    const groups = new Map<string, ResultGroup>();
    for (const result of searchResults) {
      if (!groups.has(result.path)) {
        const parts = result.relative_path.split('/');
        const fileName = parts.pop() || '';
        const dirPath = parts.join('/');
        groups.set(result.path, {
          filePath: result.path,
          fileName,
          dirPath: dirPath ? dirPath + '/' : '',
          results: [],
        });
      }
      groups.get(result.path)!.results.push(result);
    }
    return Array.from(groups.values());
  });

  function highlightMatch(line: string, matchStart: number, matchEnd: number, trimOffset: number): string {
    // Always use a case-insensitive search on the (already-trimmed) display line.
    // The Rust byte offsets can disagree with JS string indices when there are
    // multi-byte characters or when we trim the leading whitespace for display,
    // so the direct string search is the most reliable approach.
    const query = searchQuery.toLowerCase();
    const idx = line.toLowerCase().indexOf(query);
    if (idx >= 0) {
      const before = escapeHtml(line.substring(0, idx));
      const match = escapeHtml(line.substring(idx, idx + query.length));
      const after = escapeHtml(line.substring(idx + query.length));
      return `${before}<mark>${match}</mark>${after}`;
    }
    return escapeHtml(line);
  }

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function openSearchResult(result: SearchResult) {
    openFile({
      name: result.relative_path.split('/').pop() || result.relative_path,
      path: result.path,
      type: 'file',
      is_git_repo: false,
    });
  }

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      await openWorkspace(selected);
    }
  }

  function handleToggle(node: FileNode) {
    if (node.type === 'folder' || node.type === 'repo') {
      fileTree.update(tree => toggleNode(tree, node.path));
    } else {
      openFile(node);
    }
  }

  function handleContextMenu(e: MouseEvent, node: FileNode) {
    e.preventDefault();
    e.stopPropagation();
    // Clamp to viewport
    const menuWidth = 220;
    const menuHeight = 280;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);
    contextMenu = { x, y, node };
  }

  async function refreshTree() {
    const ws = $workspacePath;
    if (!ws) return;
    try {
      const tree: FileNode[] = await invoke('read_directory', { path: ws });
      function initExpanded(nodes: FileNode[]): FileNode[] {
        return nodes.map(n => ({
          ...n,
          expanded: false,
          children: n.children ? initExpanded(n.children) : undefined,
        }));
      }
      // Preserve expanded state from current tree
      function mergeExpanded(newNodes: FileNode[], oldNodes: FileNode[]): FileNode[] {
        const oldMap = new Map(oldNodes.map(n => [n.path, n]));
        return newNodes.map(n => {
          const old = oldMap.get(n.path);
          return {
            ...n,
            expanded: old?.expanded ?? false,
            children: n.children && old?.children
              ? mergeExpanded(n.children, old.children)
              : n.children ? initExpanded(n.children) : undefined,
          };
        });
      }
      let currentTree: FileNode[] = [];
      fileTree.subscribe(v => { currentTree = v; })();
      fileTree.set(mergeExpanded(tree, currentTree));
    } catch (e) {
      console.error('Failed to refresh tree:', e);
    }
  }

  function getIconSvg(item: FileNode): string {
    const iconType = item.type === 'folder' && item.expanded ? 'folder-open' : item.type;
    return getFileIconSvg(item.lang, iconType, item.name);
  }

  function collapseAll() {
    fileTree.update(tree => {
      function collapse(nodes: FileNode[]): FileNode[] {
        return nodes.map(n => ({
          ...n,
          expanded: false,
          children: n.children ? collapse(n.children) : undefined,
        }));
      }
      return collapse(tree);
    });
  }

  async function locateActiveFile() {
    const activeFile = $activeFilePath;
    if (!activeFile) return;
    // Expand all parent folders for the active file
    fileTree.update(tree => {
      function expandPath(nodes: FileNode[], target: string): FileNode[] {
        return nodes.map(n => {
          if (target.startsWith(n.path + '/') || target === n.path) {
            return {
              ...n,
              expanded: true,
              children: n.children ? expandPath(n.children, target) : undefined,
            };
          }
          return {
            ...n,
            children: n.children ? expandPath(n.children, target) : undefined,
          };
        });
      }
      return expandPath(tree, activeFile);
    });
    // Also switch sidebar to files panel
    activeSidebarPanel.set('files');
    // Wait for Svelte DOM update, then scroll
    await tick();
    requestAnimationFrame(() => {
      document.querySelector('.tree-item.active-file')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }
</script>

<div class="sidebar">
  <div class="sidebar-header">
    <span class="sidebar-title">
      {#if $activeSidebarPanel === 'files'}
        Project Files
      {:else if $activeSidebarPanel === 'git'}
        Git
      {:else if $activeSidebarPanel === 'search'}
        Search
      {:else if $activeSidebarPanel === 'structure'}
        Structure
      {:else if $activeSidebarPanel === 'bookmarks'}
        Bookmarks
      {:else if $activeSidebarPanel === 'todo'}
        TODO
      {/if}
    </span>
    {#if $activeSidebarPanel === 'files' && $fileTree.length > 0}
      <div class="sidebar-toolbar">
        <button class="toolbar-btn" title="Locate Active File" onclick={locateActiveFile}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
          </svg>
        </button>
        <button class="toolbar-btn" title="Collapse All" onclick={collapseAll}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 14h16M4 10h16M9 18l3-3 3 3M9 6l3 3 3-3"/>
          </svg>
        </button>
        <button class="toolbar-btn" title="Refresh" onclick={refreshTree}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 2v6h-6"/>
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
            <path d="M3 22v-6h6"/>
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <div class="sidebar-content">
    {#if $activeSidebarPanel === 'files'}
      {#if $fileTree.length === 0}
        <div class="empty-state">
          <button class="open-folder-btn" onclick={handleOpenFolder}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"/>
              <path d="M12 10v6M9 13h6"/>
            </svg>
            Open Folder
          </button>
          <span class="empty-hint">or drop a folder here</span>
        </div>
      {:else}
        <div class="file-tree">
          {#each $fileTree as item}
            {@render treeNode(item, 0)}
          {/each}
        </div>
      {/if}
    {:else if $activeSidebarPanel === 'git'}
      <GitPanel />
    {:else if $activeSidebarPanel === 'search'}
      <div class="search-panel">
        <div class="search-input-wrapper">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            class="search-input"
            placeholder="Search across all files..."
            bind:value={searchQuery}
            oninput={onSearchInput}
          />
        </div>
        {#if isSearching}
          <div class="search-status">Searching...</div>
        {:else if searchQuery.length >= 2 && searchResults.length === 0}
          <div class="search-status">No results found</div>
        {:else if searchResults.length > 0}
          <div class="search-results">
            <div class="search-count">{searchResults.length} results in {groupedResults.length} files</div>
            {#each groupedResults as group}
              <div class="result-group">
                <div class="result-file-header">
                  <span class="result-filename">{group.fileName}</span>
                  <span class="result-filepath">{group.dirPath}</span>
                  <span class="result-badge">{group.results.length}</span>
                </div>
                {#each group.results as result}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div class="search-result" onclick={() => openSearchResult(result)}>
                    <span class="result-line-num">{result.line_number}</span>
                    <span class="result-line">{@html highlightMatch(result.line_content.trim(), result.match_start, result.match_end, result.line_content.length - result.line_content.trimStart().length)}</span>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else if $activeSidebarPanel === 'structure'}
      <StructurePanel />
    {:else if $activeSidebarPanel === 'bookmarks'}
      <BookmarksPanel />
    {:else if $activeSidebarPanel === 'todo'}
      <TodoPanel />
    {:else}
      <div class="placeholder-panel">
        <span class="placeholder-text">Select a panel</span>
      </div>
    {/if}
  </div>
</div>

{#snippet treeNode(item: FileNode, depth: number)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="tree-item"
    class:expanded={item.expanded}
    class:active-file={item.type === 'file' && item.path === $activeFilePath}
    style="padding-left: {12 + depth * 16}px"
    onclick={() => handleToggle(item)}
    oncontextmenu={(e) => handleContextMenu(e, item)}
    role="treeitem"
    tabindex="0"
  >
    {#if item.type === 'folder' || item.type === 'repo'}
      <svg class="chevron" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6 4l4 4-4 4"/>
      </svg>
    {:else}
      <span class="chevron-space"></span>
    {/if}

    <span class="file-icon" style="color: {item.type === 'repo' ? 'var(--color-accent)' : 'var(--color-text-muted)'}">
      {@html getIconSvg(item)}
    </span>

    <span
      class="tree-label"
      class:repo-label={item.type === 'repo'}
      class:git-modified={$gitFileStatuses.has(item.path) && $gitFileStatuses.get(item.path) === 'modified'}
      class:git-added={$gitFileStatuses.has(item.path) && ($gitFileStatuses.get(item.path) === 'added' || $gitFileStatuses.get(item.path) === 'untracked')}
      class:git-deleted={$gitFileStatuses.has(item.path) && $gitFileStatuses.get(item.path) === 'deleted'}
    >
      {item.name}
    </span>
  </div>

  {#if (item.type === 'folder' || item.type === 'repo') && item.expanded && item.children}
    {#each item.children as child}
      {@render treeNode(child, depth + 1)}
    {/each}
  {/if}
{/snippet}

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    node={contextMenu.node}
    onclose={() => contextMenu = null}
    onrefresh={refreshTree}
  />
{/if}

<style>
  .sidebar {
    width: 100%;
    height: 100%;
    background: var(--color-bg-surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    height: 34px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .sidebar-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .toolbar-btn {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .toolbar-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .sidebar-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    gap: 12px;
  }

  .open-folder-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--color-accent);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .open-folder-btn:hover {
    background: var(--color-accent-hover);
  }

  .empty-hint {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .file-tree {
    padding: 4px 0;
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    height: 26px;
    border: none;
    background: transparent;
    color: var(--color-text-primary);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.1s ease;
    text-align: left;
  }

  .tree-item:hover {
    background: var(--color-bg-hover);
  }

  .tree-item.active-file {
    background: var(--color-bg-active);
  }

  .tree-item.active-file:hover {
    background: var(--color-bg-active);
  }

  .chevron {
    flex-shrink: 0;
    color: var(--color-text-muted);
    transition: transform 0.15s ease;
  }

  .tree-item.expanded > .chevron {
    transform: rotate(90deg);
  }

  .chevron-space {
    width: 12px;
    flex-shrink: 0;
  }

  .file-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
  }

  .tree-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .repo-label {
    font-weight: 600;
  }

  .git-modified {
    color: var(--color-info) !important;
  }

  .git-added {
    color: var(--color-success) !important;
  }

  .git-deleted {
    color: var(--color-error) !important;
    text-decoration: line-through;
  }

  .placeholder-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: 12px;
  }

  .placeholder-text {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .search-panel {
    padding: 8px;
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text-muted);
    transition: border-color 0.15s ease;
  }

  .search-input-wrapper:focus-within {
    border-color: var(--color-accent);
  }

  .search-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--color-text-primary);
    font-size: 13px;
    font-family: inherit;
  }

  .search-input::placeholder {
    color: var(--color-text-muted);
  }

  .search-status {
    padding: 12px 8px;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .search-results {
    margin-top: 4px;
  }

  .search-count {
    font-size: 11px;
    color: var(--color-text-muted);
    padding: 0 8px 6px;
  }

  .result-group {
    margin-bottom: 2px;
  }

  .result-file-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px 3px;
    position: sticky;
    top: 0;
    background: var(--color-bg-surface);
  }

  .result-filename {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .result-filepath {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .result-badge {
    font-size: 10px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--color-bg-hover);
    color: var(--color-text-muted);
    font-weight: 600;
    flex-shrink: 0;
  }

  .search-result {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 3px 8px 3px 12px;
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .search-result:hover {
    background: var(--color-bg-hover);
  }

  .result-line-num {
    font-size: 11px;
    color: var(--color-text-muted);
    font-family: var(--font-editor);
    min-width: 28px;
    text-align: right;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .result-line {
    font-size: 12px;
    color: var(--color-text-secondary);
    font-family: var(--font-editor);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .result-line :global(mark) {
    background: var(--color-accent-subtle);
    color: var(--color-accent);
    border-radius: 2px;
    padding: 0 1px;
    font-weight: 600;
  }
</style>
