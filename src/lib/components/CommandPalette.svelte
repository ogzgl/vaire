<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { workspacePath, openFile, type FileNode } from '$lib/stores/workspace';
  import { showSettings } from '$lib/stores/theme';
  import { activeSidebarPanel, activeBottomPanel } from '$lib/stores/app';

  let isOpen = $state(false);
  let query = $state('');
  let inputEl: HTMLInputElement;
  let selectedIndex = $state(0);
  let mode = $state<'files' | 'actions' | 'all'>('all');

  interface PaletteItem {
    type: 'file' | 'action';
    label: string;
    description?: string;
    icon?: string;
    iconColor?: string;
    action: () => void;
  }

  // File cache for quick search
  let allFiles = $state<FileNode[]>([]);
  let filesCached = false;

  async function cacheFiles() {
    const ws = $workspacePath;
    if (!ws || filesCached) return;
    try {
      const tree: FileNode[] = await invoke('read_directory', { path: ws });
      allFiles = flattenTree(tree);
      filesCached = true;
    } catch (e) {
      console.error('Failed to cache files:', e);
    }
  }

  function flattenTree(nodes: FileNode[], result: FileNode[] = []): FileNode[] {
    for (const node of nodes) {
      if (node.type === 'file') {
        result.push(node);
      }
      if (node.children) {
        flattenTree(node.children, result);
      }
    }
    return result;
  }

  // Actions
  const actions: PaletteItem[] = [
    { type: 'action', label: 'Settings', description: 'Open settings', icon: '⚙', action: () => { showSettings.set(true); close(); } },
    { type: 'action', label: 'Toggle Terminal', description: 'Show/hide terminal', icon: '▸', action: () => { activeBottomPanel.update(v => v === 'terminal' ? null : 'terminal'); close(); } },
    { type: 'action', label: 'Toggle Git Log', description: 'Show/hide git log', icon: '⊙', action: () => { activeBottomPanel.update(v => v === 'git-log' ? null : 'git-log'); close(); } },
    { type: 'action', label: 'File Explorer', description: 'Show file tree', icon: '☰', action: () => { activeSidebarPanel.set('files'); close(); } },
    { type: 'action', label: 'Search in Files', description: 'Open search panel', icon: '⌕', action: () => { activeSidebarPanel.set('search'); close(); } },
    { type: 'action', label: 'Git Changes', description: 'Show git panel', icon: '⑂', action: () => { activeSidebarPanel.set('git'); close(); } },
  ];

  function getFileIcon(lang?: string): { icon: string; color: string } {
    switch (lang) {
      case 'kotlin': return { icon: 'K', color: '#a97bff' };
      case 'java': return { icon: 'J', color: '#e76f00' };
      case 'typescript': return { icon: 'TS', color: '#3178c6' };
      case 'javascript': return { icon: 'JS', color: '#f0db4f' };
      case 'python': return { icon: 'Py', color: '#3776ab' };
      case 'rust': return { icon: 'Rs', color: '#dea584' };
      case 'yaml': return { icon: 'Y', color: '#cb171e' };
      case 'json': return { icon: 'J', color: '#f0db4f' };
      case 'html': return { icon: 'H', color: '#e34f26' };
      case 'css': return { icon: 'C', color: '#1572b6' };
      case 'svelte': return { icon: 'Sv', color: '#ff3e00' };
      case 'terraform': return { icon: 'TF', color: '#7b42bc' };
      case 'sql': return { icon: 'SQ', color: '#336791' };
      default: return { icon: 'F', color: 'var(--color-text-muted)' };
    }
  }

  // Fuzzy match scoring
  function fuzzyScore(query: string, target: string): number {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    if (t === q) return 10000;
    if (t.startsWith(q)) return 5000;
    if (t.includes(q)) return 1000;

    // Character-by-character fuzzy match
    let score = 0;
    let qi = 0;
    let consecutive = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) {
        score += 10 + consecutive * 5;
        consecutive++;
        qi++;
      } else {
        consecutive = 0;
      }
    }
    return qi === q.length ? score : 0;
  }

  let filteredItems = $derived.by(() => {
    const q = query.trim();

    let items: PaletteItem[] = [];

    // File items
    if (mode === 'all' || mode === 'files') {
      const ws = $workspacePath || '';
      const fileItems: (PaletteItem & { score: number })[] = allFiles
        .map(f => {
          const nameScore = q ? fuzzyScore(q, f.name) : 1;
          const pathScore = q ? fuzzyScore(q, f.path.replace(ws + '/', '')) * 0.5 : 0;
          const score = Math.max(nameScore, pathScore);
          const fi = getFileIcon(f.lang);
          return {
            type: 'file' as const,
            label: f.name,
            description: f.path.replace(ws + '/', '').replace('/' + f.name, ''),
            icon: fi.icon,
            iconColor: fi.color,
            action: () => { openFile(f); close(); },
            score,
          };
        })
        .filter(f => !q || f.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      items.push(...fileItems);
    }

    // Action items
    if (mode === 'all' || mode === 'actions') {
      const actionItems = actions
        .filter(a => !q || fuzzyScore(q, a.label) > 0)
        .sort((a, b) => fuzzyScore(q, b.label) - fuzzyScore(q, a.label));
      items.push(...actionItems);
    }

    return items;
  });

  function open() {
    isOpen = true;
    query = '';
    selectedIndex = 0;
    mode = 'all';
    cacheFiles();
    requestAnimationFrame(() => inputEl?.focus());
  }

  function close() {
    isOpen = false;
    query = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredItems.length - 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
      return;
    }
  }

  // Reset selection when query changes
  $effect(() => {
    query;
    selectedIndex = 0;
  });

  // Global keyboard listener for Double Shift and Cmd+Shift+A
  let lastShiftTime = 0;

  function globalKeyHandler(e: KeyboardEvent) {
    // Double Shift detection
    if (e.key === 'Shift' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      if (now - lastShiftTime < 400) {
        e.preventDefault();
        open();
        lastShiftTime = 0;
      } else {
        lastShiftTime = now;
      }
      return;
    }

    // Cmd+Shift+A — Actions
    if (e.key === 'a' && e.metaKey && e.shiftKey) {
      e.preventDefault();
      mode = 'actions';
      open();
      return;
    }

    // Cmd+Shift+O — Files
    if (e.key === 'o' && e.metaKey && e.shiftKey) {
      e.preventDefault();
      mode = 'files';
      open();
      return;
    }

    // Cmd+E — Recent Files (same as open palette in file mode for now)
    if (e.key === 'e' && e.metaKey && !e.shiftKey) {
      e.preventDefault();
      mode = 'files';
      open();
      return;
    }

    // Cmd+P — Quick open file (VS Code style)
    if (e.key === 'p' && e.metaKey && !e.shiftKey) {
      e.preventDefault();
      mode = 'files';
      open();
      return;
    }
  }

  function handleOpenPaletteEvent(e: Event) {
    const detail = (e as CustomEvent<{ mode?: 'files' | 'actions' | 'all' }>).detail;
    mode = detail?.mode || 'all';
    open();
  }

  onMount(() => {
    window.addEventListener('keydown', globalKeyHandler);
    window.addEventListener('vaire:open-palette', handleOpenPaletteEvent);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', globalKeyHandler);
    window.removeEventListener('vaire:open-palette', handleOpenPaletteEvent);
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="palette-overlay" onclick={close}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="palette" onclick={(e) => e.stopPropagation()} onkeydown={handleKeydown}>
      <div class="palette-input-wrapper">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          bind:this={inputEl}
          type="text"
          class="palette-input"
          placeholder={mode === 'files' ? 'Search files...' : mode === 'actions' ? 'Search actions...' : 'Search everywhere...'}
          bind:value={query}
        />
        <div class="palette-mode-pills">
          <button class="mode-pill" class:active={mode === 'all'} onclick={() => mode = 'all'}>All</button>
          <button class="mode-pill" class:active={mode === 'files'} onclick={() => mode = 'files'}>Files</button>
          <button class="mode-pill" class:active={mode === 'actions'} onclick={() => mode = 'actions'}>Actions</button>
        </div>
      </div>

      <div class="palette-results">
        {#if filteredItems.length === 0}
          <div class="palette-empty">No results found</div>
        {:else}
          {#each filteredItems as item, i}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="palette-item"
              class:selected={i === selectedIndex}
              onclick={item.action}
              onmouseenter={() => selectedIndex = i}
            >
              <span class="palette-item-icon" style="color: {item.iconColor || 'var(--color-text-muted)'}">
                {item.icon || ''}
              </span>
              <div class="palette-item-text">
                <span class="palette-item-label">{item.label}</span>
                {#if item.description}
                  <span class="palette-item-desc">{item.description}</span>
                {/if}
              </div>
              <span class="palette-item-type">{item.type}</span>
            </div>
          {/each}
        {/if}
      </div>

      <div class="palette-footer">
        <span class="palette-hint">
          <kbd>↑↓</kbd> navigate
          <kbd>↵</kbd> open
          <kbd>esc</kbd> close
        </span>
      </div>
    </div>
  </div>
{/if}

<style>
  .palette-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    justify-content: center;
    padding-top: 15vh;
    z-index: 200;
    backdrop-filter: blur(4px);
  }

  .palette {
    width: 580px;
    max-height: 420px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    animation: paletteIn 0.15s ease-out;
  }

  @keyframes paletteIn {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .palette-input-wrapper {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-muted);
  }

  .palette-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--color-text-primary);
    font-size: 15px;
    font-family: inherit;
  }

  .palette-input::placeholder {
    color: var(--color-text-muted);
  }

  .palette-mode-pills {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .mode-pill {
    padding: 3px 8px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 11px;
    font-family: inherit;
    font-weight: 500;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.1s ease;
  }

  .mode-pill:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .mode-pill.active {
    background: var(--color-accent-subtle);
    color: var(--color-accent);
  }

  .palette-results {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .palette-empty {
    padding: 24px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .palette-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.08s ease;
  }

  .palette-item.selected {
    background: var(--color-bg-hover);
  }

  .palette-item-icon {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: var(--color-bg-active);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .palette-item-text {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .palette-item-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .palette-item-desc {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .palette-item-type {
    font-size: 10px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
    opacity: 0.5;
  }

  .palette-footer {
    padding: 8px 16px;
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: center;
  }

  .palette-hint {
    font-size: 11px;
    color: var(--color-text-muted);
    display: flex;
    gap: 12px;
  }

  .palette-hint kbd {
    font-family: inherit;
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--color-bg-active);
    border: 1px solid var(--color-border);
  }
</style>
