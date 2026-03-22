<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { revealItemInDir } from '@tauri-apps/plugin-opener';
  import { workspacePath, openFile, type FileNode } from '$lib/stores/workspace';

  interface Props {
    x: number;
    y: number;
    node: FileNode;
    onclose: () => void;
    onrefresh: () => void;
  }

  let { x, y, node, onclose, onrefresh }: Props = $props();

  let showDeleteConfirm = $state(false);
  let showRenameInput = $state(false);
  let showNewFileInput = $state(false);
  let showNewFolderInput = $state(false);
  let newName = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if ((showRenameInput || showNewFileInput || showNewFolderInput) && inputEl) {
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  function getParentPath(nodePath: string): string {
    const parts = nodePath.split('/');
    if (node.type === 'file') {
      parts.pop();
      return parts.join('/');
    }
    return nodePath;
  }

  async function handleNewFile() {
    const name = newName.trim();
    if (!name) return;
    const parent = getParentPath(node.path);
    const fullPath = `${parent}/${name}`;
    try {
      await invoke('create_file', { path: fullPath });
      onrefresh();
      // Open the newly created file
      await openFile({ name, path: fullPath, type: 'file', is_git_repo: false });
    } catch (e) {
      console.error('Failed to create file:', e);
      alert(`Failed to create file: ${e}`);
    }
    onclose();
  }

  async function handleNewFolder() {
    const name = newName.trim();
    if (!name) return;
    const parent = getParentPath(node.path);
    const fullPath = `${parent}/${name}`;
    try {
      await invoke('create_directory', { path: fullPath });
      onrefresh();
    } catch (e) {
      console.error('Failed to create folder:', e);
      alert(`Failed to create folder: ${e}`);
    }
    onclose();
  }

  async function handleRename() {
    const name = newName.trim();
    if (!name || name === node.name) {
      onclose();
      return;
    }
    const parts = node.path.split('/');
    parts.pop();
    const newPath = [...parts, name].join('/');
    try {
      await invoke('rename_path', { oldPath: node.path, newPath });
      onrefresh();
    } catch (e) {
      console.error('Failed to rename:', e);
      alert(`Failed to rename: ${e}`);
    }
    onclose();
  }

  async function handleDelete() {
    try {
      await invoke('delete_path', { path: node.path });
      onrefresh();
    } catch (e) {
      console.error('Failed to delete:', e);
      alert(`Failed to delete: ${e}`);
    }
    onclose();
  }

  async function handleCopyPath() {
    try {
      await navigator.clipboard.writeText(node.path);
    } catch (e) {
      console.error('Failed to copy path:', e);
    }
    onclose();
  }

  async function handleCopyRelativePath() {
    const ws = $workspacePath;
    const rel = ws ? node.path.replace(ws + '/', '') : node.path;
    try {
      await navigator.clipboard.writeText(rel);
    } catch (e) {
      console.error('Failed to copy relative path:', e);
    }
    onclose();
  }

  async function handleRevealInFinder() {
    try {
      await revealItemInDir(node.path);
    } catch (e) {
      console.error('Failed to reveal in Finder:', e);
    }
    onclose();
  }

  function startRename() {
    newName = node.name;
    showRenameInput = true;
  }

  function startNewFile() {
    newName = '';
    showNewFileInput = true;
  }

  function startNewFolder() {
    newName = '';
    showNewFolderInput = true;
  }

  function onInputKeydown(e: KeyboardEvent, action: () => void) {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    } else if (e.key === 'Escape') {
      onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="context-overlay" onclick={onclose}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="context-menu"
    style="left: {x}px; top: {y}px"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && onclose()}
  >
    {#if showDeleteConfirm}
      <div class="confirm-box">
        <p class="confirm-text">Delete <strong>{node.name}</strong>?</p>
        <div class="confirm-actions">
          <button class="confirm-btn danger" onclick={handleDelete}>Delete</button>
          <button class="confirm-btn" onclick={onclose}>Cancel</button>
        </div>
      </div>
    {:else if showRenameInput}
      <div class="inline-input-box">
        <span class="inline-input-label">Rename to:</span>
        <input
          bind:this={inputEl}
          class="inline-input"
          bind:value={newName}
          onkeydown={(e) => onInputKeydown(e, handleRename)}
        />
        <button class="inline-input-ok" onclick={handleRename}>OK</button>
      </div>
    {:else if showNewFileInput}
      <div class="inline-input-box">
        <span class="inline-input-label">New file name:</span>
        <input
          bind:this={inputEl}
          class="inline-input"
          bind:value={newName}
          onkeydown={(e) => onInputKeydown(e, handleNewFile)}
          placeholder="filename.ext"
        />
        <button class="inline-input-ok" onclick={handleNewFile}>Create</button>
      </div>
    {:else if showNewFolderInput}
      <div class="inline-input-box">
        <span class="inline-input-label">New folder name:</span>
        <input
          bind:this={inputEl}
          class="inline-input"
          bind:value={newName}
          onkeydown={(e) => onInputKeydown(e, handleNewFolder)}
          placeholder="folder-name"
        />
        <button class="inline-input-ok" onclick={handleNewFolder}>Create</button>
      </div>
    {:else}
      <!-- New submenu -->
      <button class="menu-item" onclick={startNewFile}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        New File
      </button>
      <button class="menu-item" onclick={startNewFolder}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
        </svg>
        New Folder
      </button>
      <div class="menu-separator"></div>

      <!-- Edit operations -->
      <button class="menu-item" onclick={startRename}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
        <span class="menu-label">Rename</span>
        <span class="menu-shortcut">F2</span>
      </button>
      <button class="menu-item danger" onclick={() => showDeleteConfirm = true}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        <span class="menu-label">Delete</span>
        <span class="menu-shortcut">Del</span>
      </button>
      <div class="menu-separator"></div>

      <!-- Find in Files -->
      <button class="menu-item" onclick={() => { onclose(); window.dispatchEvent(new CustomEvent('vaire:find-in-path', { detail: { path: node.path } })); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <span class="menu-label">Find in Files</span>
        <span class="menu-shortcut">Cmd+Shift+F</span>
      </button>
      <div class="menu-separator"></div>

      <!-- Copy operations -->
      <button class="menu-item" onclick={handleCopyPath}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span class="menu-label">Copy Path</span>
        <span class="menu-shortcut">Cmd+Shift+C</span>
      </button>
      <button class="menu-item" onclick={handleCopyRelativePath}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy Relative Path
      </button>
      <div class="menu-separator"></div>

      <!-- Reveal -->
      <button class="menu-item" onclick={handleRevealInFinder}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"/>
        </svg>
        <span class="menu-label">Reveal in Finder</span>
        <span class="menu-shortcut">Cmd+Shift+R</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .context-overlay {
    position: fixed;
    inset: 0;
    z-index: 500;
  }

  .context-menu {
    position: fixed;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 4px;
    min-width: 200px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 501;
    animation: menuIn 0.1s ease-out;
  }

  @keyframes menuIn {
    from { opacity: 0; transform: scale(0.95); }
    to   { opacity: 1; transform: scale(1); }
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    font-size: 13px;
    font-family: inherit;
    text-align: left;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;
  }

  .menu-label {
    flex: 1;
  }

  .menu-shortcut {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-left: auto;
    flex-shrink: 0;
  }

  .menu-item:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .menu-item.danger:hover {
    background: rgba(244, 71, 71, 0.15);
    color: var(--color-error);
  }

  .menu-separator {
    height: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }

  /* Confirm / inline input boxes */
  .confirm-box,
  .inline-input-box {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .confirm-text {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .confirm-text strong {
    color: var(--color-text-primary);
  }

  .confirm-actions {
    display: flex;
    gap: 6px;
  }

  .confirm-btn {
    flex: 1;
    padding: 5px 10px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .confirm-btn:hover {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }

  .confirm-btn.danger {
    background: var(--color-error);
    color: white;
    border-color: var(--color-error);
  }

  .confirm-btn.danger:hover {
    opacity: 0.85;
  }

  .inline-input-label {
    font-size: 11px;
    color: var(--color-text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .inline-input {
    padding: 5px 8px;
    background: var(--color-bg-base);
    border: 1px solid var(--color-accent);
    border-radius: 5px;
    color: var(--color-text-primary);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .inline-input-ok {
    align-self: flex-end;
    padding: 4px 14px;
    background: var(--color-accent);
    border: none;
    border-radius: 5px;
    color: white;
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.1s ease;
  }

  .inline-input-ok:hover {
    opacity: 0.85;
  }
</style>
