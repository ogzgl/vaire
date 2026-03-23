<script lang="ts">
  import TitleBar from '$lib/components/TitleBar.svelte';
  import ActivityBar from '$lib/components/ActivityBar.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import EditorArea from '$lib/components/EditorArea.svelte';
  import BottomPanel from '$lib/components/BottomPanel.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
  import CommitDialog from '$lib/components/CommitDialog.svelte';
  import PushDialog from '$lib/components/PushDialog.svelte';
  import DiffDialog from '$lib/components/DiffDialog.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import DbConnectionDialog from '$lib/components/DbConnectionDialog.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { sidebarWidth, activeBottomPanel, isSidebarCollapsed } from '$lib/stores/app';
  import { activeTheme, fontSettings } from '$lib/stores/theme';
  import { openWorkspace, workspacePath, saveOpenSessions, getOpenSessions, clearOpenSessions, restoreSessionTabs } from '$lib/stores/workspace';
  import { recentProjects } from '$lib/stores/recent';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { open } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';

  let showRecentProjectsModal = $state(false);
  let showDbDialog = $state(false);
  let dbDialogEditConfig = $state<any>(null);

  let isResizing = $state(false);
  let menuListeners: UnlistenFn[] = [];

  // Global Esc handler: ALWAYS prevent fullscreen exit
  function handleGlobalEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault(); // ALWAYS prevent fullscreen exit
      // Dialogs handle their own close via their own Escape handlers
    }
  }

  function handleDbDialog(e: Event) {
    const detail = (e as CustomEvent).detail;
    dbDialogEditConfig = detail?.config ?? null;
    showDbDialog = true;
  }

  onMount(async () => {
    window.addEventListener('keydown', handleGlobalEsc);
    window.addEventListener('vaire:db-dialog', handleDbDialog);

    // Read workspace from URL query param (new window opened with specific project)
    const params = new URLSearchParams(window.location.search);
    const wsParam = params.get('workspace');

    if (wsParam) {
      const decodedPath = decodeURIComponent(wsParam);
      try {
        await openWorkspace(decodedPath);
        restoreSessionTabs(decodedPath);
      } catch {
        // Path doesn't exist, stay on welcome screen
      }
    } else if (!$workspacePath) {
      // Session restore: check for previously open sessions
      const sessions = getOpenSessions();
      if (sessions.length > 0) {
        clearOpenSessions();
        // Open first session in current window
        try {
          await invoke('read_directory', { path: sessions[0] });
          await openWorkspace(sessions[0]);
          restoreSessionTabs(sessions[0]);
        } catch {
          // Path doesn't exist, skip
        }
        // Open additional sessions in new windows
        for (let i = 1; i < sessions.length; i++) {
          try {
            await invoke('open_new_window', { workspacePath: sessions[i] });
          } catch {}
        }
      } else {
        // Fallback: auto-open last recent project
        let recent: typeof $recentProjects = [];
        recentProjects.subscribe(v => { recent = v; })();
        if (recent.length > 0) {
          try {
            await invoke('read_directory', { path: recent[0].path });
            await openWorkspace(recent[0].path);
            restoreSessionTabs(recent[0].path);
          } catch {
            // Path doesn't exist, skip auto-open
          }
        }
      }
    }

    // Save session on window close
    window.addEventListener('beforeunload', () => {
      saveOpenSessions();
    });

    menuListeners.push(await listen('menu-new-window', async () => {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        await invoke('open_new_window', { workspacePath: selected });
      }
    }));

    menuListeners.push(await listen('menu-open-folder', async () => {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        await openWorkspace(selected);
      }
    }));

    menuListeners.push(await listen('menu-open-in-new-window', async () => {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        await invoke('open_new_window', { workspacePath: selected });
      }
    }));

    menuListeners.push(await listen('menu-recent-projects', () => {
      showRecentProjectsModal = true;
    }));

    menuListeners.push(await listen('menu-toggle-terminal', () => {
      activeBottomPanel.update(v => v === 'terminal' ? null : 'terminal');
    }));

    menuListeners.push(await listen('menu-toggle-sidebar', () => {
      isSidebarCollapsed.update(v => !v);
    }));
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleGlobalEsc);
    window.removeEventListener('vaire:db-dialog', handleDbDialog);
    menuListeners.forEach(u => u());
  });

  function startResize(e: MouseEvent) {
    isResizing = true;
    const startX = e.clientX;
    const startWidth = $sidebarWidth;

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientX - startX;
      const newWidth = Math.max(180, Math.min(500, startWidth + delta));
      sidebarWidth.set(newWidth);
    }

    function onMouseUp() {
      isResizing = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // Build CSS variable string from active theme
  $effect(() => {
    const t = $activeTheme;
    const f = $fontSettings;
    const root = document.documentElement;

    root.style.setProperty('--color-bg-base', t.colors.bgBase);
    root.style.setProperty('--color-bg-surface', t.colors.bgSurface);
    root.style.setProperty('--color-bg-elevated', t.colors.bgElevated);
    root.style.setProperty('--color-bg-overlay', t.colors.bgOverlay);
    root.style.setProperty('--color-bg-hover', t.colors.bgHover);
    root.style.setProperty('--color-bg-active', t.colors.bgActive);
    root.style.setProperty('--color-text-primary', t.colors.textPrimary);
    root.style.setProperty('--color-text-secondary', t.colors.textSecondary);
    root.style.setProperty('--color-text-tertiary', t.colors.textTertiary);
    root.style.setProperty('--color-text-muted', t.colors.textMuted);
    root.style.setProperty('--color-accent', t.colors.accent);
    root.style.setProperty('--color-accent-hover', t.colors.accentHover);
    root.style.setProperty('--color-accent-subtle', t.colors.accentSubtle);
    root.style.setProperty('--color-border', t.colors.border);
    root.style.setProperty('--color-border-subtle', t.colors.borderSubtle);
    root.style.setProperty('--color-border-focus', t.colors.borderFocus);
    root.style.setProperty('--color-success', t.colors.success);
    root.style.setProperty('--color-warning', t.colors.warning);
    root.style.setProperty('--color-error', t.colors.error);
    root.style.setProperty('--color-info', t.colors.info);

    root.style.setProperty('--font-editor', `'${f.family}', monospace`);
    root.style.setProperty('--font-editor-size', `${f.size}px`);
    root.style.setProperty('--font-editor-line-height', `${f.lineHeight}`);
    root.style.setProperty('--font-ui', `'${f.uiFamily}', -apple-system, sans-serif`);
    root.style.setProperty('--font-ui-size', `${f.uiSize}px`);
  });
</script>

<div class="app-shell" class:resizing={isResizing}>
  <TitleBar />

  <div class="main-area">
    <ActivityBar />

    <div class="sidebar-container" style="width: {$sidebarWidth}px">
      <Sidebar />
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resize-handle" onmousedown={startResize}></div>
    </div>

    <div class="editor-container">
      <EditorArea />
      <BottomPanel />
    </div>
  </div>

  <StatusBar />
  <CommandPalette />
  <KeyboardShortcuts />
  <CommitDialog />
  <PushDialog />
  <DiffDialog />
  <Toasts />
  {#if showDbDialog}
    <DbConnectionDialog editConfig={dbDialogEditConfig} onclose={() => { showDbDialog = false; dbDialogEditConfig = null; }} />
  {/if}
</div>

{#if showRecentProjectsModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="recent-modal-backdrop" onclick={() => showRecentProjectsModal = false} onkeydown={(e) => { if (e.key === 'Escape') showRecentProjectsModal = false; }}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="recent-modal" onclick={(e) => e.stopPropagation()}>
      <div class="recent-modal-header">
        <span>Recent Projects</span>
        <button class="recent-modal-close" onclick={() => showRecentProjectsModal = false}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>
      <div class="recent-modal-list">
        {#each $recentProjects as project}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="recent-modal-item" onclick={() => { openWorkspace(project.path); showRecentProjectsModal = false; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"/>
            </svg>
            <div class="recent-modal-info">
              <span class="recent-modal-name">{project.name}</span>
              <span class="recent-modal-path">{project.path}</span>
            </div>
          </div>
        {/each}
        {#if $recentProjects.length === 0}
          <div class="recent-modal-empty">No recent projects</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .app-shell {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--font-ui);
    font-size: var(--font-ui-size);
  }

  .app-shell.resizing {
    cursor: col-resize;
    user-select: none;
  }

  .main-area {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .sidebar-container {
    position: relative;
    flex-shrink: 0;
    border-right: 1px solid var(--color-border);
  }

  .resize-handle {
    position: absolute;
    right: -2px;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    z-index: 10;
    transition: background 0.15s ease;
  }

  .resize-handle:hover,
  .resizing .resize-handle {
    background: var(--color-accent);
  }

  .editor-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .recent-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .recent-modal {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    width: 420px;
    max-height: 400px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
    animation: dialogIn 0.12s ease-out;
  }

  @keyframes dialogIn {
    from { opacity: 0; transform: scale(0.97) translateY(-4px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  .recent-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .recent-modal-close {
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

  .recent-modal-close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .recent-modal-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .recent-modal-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: background 0.1s;
  }

  .recent-modal-item:hover {
    background: var(--color-bg-hover);
  }

  .recent-modal-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow: hidden;
  }

  .recent-modal-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .recent-modal-path {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-modal-empty {
    padding: 20px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }
</style>
