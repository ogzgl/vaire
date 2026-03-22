<script lang="ts">
  import { workspaceName, gitRepos, workspacePath } from '$lib/stores/workspace';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { invoke } from '@tauri-apps/api/core';
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  import { runConfigs, activeRunConfigId } from '$lib/stores/runConfigs';
  import { debugSession } from '$lib/stores/debug';
  import { activeBottomPanel } from '$lib/stores/app';
  import RunConfigDialog from './RunConfigDialog.svelte';

  let isFetchingAll = $state(false);
  let isPullingAll = $state(false);
  let opResult = $state<string | null>(null);
  let resultTimer: ReturnType<typeof setTimeout>;

  // Run state
  let isRunning = $state(false);
  let runningNames = $state<string[]>([]);
  let showRunConfigDialog = $state(false);
  let showRunDropdown = $state(false);

  // Debug state
  let isDebugging = $state(false);

  // Listen for run panel status updates
  import { onMount, onDestroy } from 'svelte';

  // Fullscreen detection
  let isFullscreen = $state(false);
  let branchNames = $state<Map<string, string>>(new Map());
  let displayBranch = $derived.by(() => {
    const names = branchNames;
    if (names.size === 0) return '';
    const values = [...names.values()];
    const counts = new Map<string, number>();
    for (const b of values) {
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    let mostCommon = values[0];
    let maxCount = 0;
    for (const [branch, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = branch;
      }
    }
    if (maxCount === names.size) return mostCommon;
    return `${mostCommon} (${maxCount}/${names.size})`;
  });

  function handleRunning(e: Event) {
    const detail = (e as CustomEvent).detail;
    if (typeof detail === 'boolean') {
      isRunning = detail;
      if (!detail) runningNames = [];
    } else if (detail && typeof detail === 'object') {
      isRunning = detail.running;
      runningNames = detail.names || [];
    }
  }
  function handleDebugging(e: Event) {
    const detail = (e as CustomEvent).detail;
    if (typeof detail === 'boolean') {
      isDebugging = detail;
    } else if (detail && typeof detail === 'object') {
      isDebugging = detail.running;
    }
  }

  async function checkFullscreen() {
    try {
      isFullscreen = await getCurrentWindow().isFullscreen();
    } catch {}
  }

  // Fetch branch names for all repos
  async function fetchBranchNames() {
    const repos = $gitRepos;
    const map = new Map<string, string>();
    await Promise.all(repos.map(async (repoPath) => {
      try {
        const status = await invoke<{ branch: string }>('get_git_status', { repoPath });
        if (status.branch) map.set(repoPath, status.branch);
      } catch {}
    }));
    branchNames = map;
  }

  $effect(() => {
    const repos = $gitRepos;
    if (repos.length > 0) {
      fetchBranchNames();
    }
  });

  onMount(() => {
    window.addEventListener('vaire:run-status', handleRunning);
    window.addEventListener('vaire:debug-status', handleDebugging);
    window.addEventListener('resize', checkFullscreen);
    checkFullscreen();
  });
  onDestroy(() => {
    window.removeEventListener('vaire:run-status', handleRunning);
    window.removeEventListener('vaire:debug-status', handleDebugging);
    window.removeEventListener('resize', checkFullscreen);
  });

  function getActiveConfig() {
    const id = $activeRunConfigId;
    return $runConfigs.find(c => c.id === id) ?? $runConfigs[0] ?? null;
  }

  async function runActiveConfig() {
    const config = getActiveConfig();
    if (!config) {
      showRunConfigDialog = true;
      return;
    }
    const wsPath = $workspacePath || '.';
    const cwd = config.cwd === '.' ? wsPath : `${wsPath}/${config.cwd}`;
    window.dispatchEvent(new CustomEvent('vaire:run-start', {
      detail: { command: config.command, cwd, env: config.env, name: config.name },
    }));
  }

  function stopRun() {
    window.dispatchEvent(new CustomEvent('vaire:run-stop'));
  }

  function selectConfig(id: string) {
    activeRunConfigId.set(id);
    showRunDropdown = false;
  }

  function debugActiveConfig() {
    const config = getActiveConfig();
    if (!config) {
      showRunConfigDialog = true;
      return;
    }
    const wsPath = $workspacePath || '.';
    const cwd = config.cwd === '.' ? wsPath : `${wsPath}/${config.cwd}`;
    activeBottomPanel.set('debug');
    window.dispatchEvent(new CustomEvent('vaire:debug-start', {
      detail: { command: config.command, cwd, env: config.env, name: config.name },
    }));
  }

  function stopDebug() {
    window.dispatchEvent(new CustomEvent('vaire:debug-stop'));
  }

  async function openNewWindow() {
    try {
      const selected = await openDialog({ directory: true, multiple: false, title: 'Open Project in New Window' });
      if (selected && typeof selected === 'string') {
        await invoke('open_new_window', { workspacePath: selected });
      }
    } catch (e) {
      console.error('Failed to open new window:', e);
    }
  }

  function showResult(msg: string) {
    clearTimeout(resultTimer);
    opResult = msg;
    resultTimer = setTimeout(() => { opResult = null; }, 3000);
  }

  async function fetchAll() {
    if (isFetchingAll) return;
    const repos = $gitRepos;
    if (repos.length === 0) { showResult('No git repos found'); return; }
    isFetchingAll = true;
    const errors: string[] = [];
    await Promise.all(repos.map(async (repoPath) => {
      try {
        await invoke<string>('git_fetch', { repoPath });
      } catch (e: any) {
        errors.push(String(e));
      }
    }));
    isFetchingAll = false;
    showResult(errors.length > 0 ? `Fetch error: ${errors[0]}` : `Fetched ${repos.length} repo(s)`);
  }

  async function pullAll() {
    if (isPullingAll) return;
    const repos = $gitRepos;
    if (repos.length === 0) { showResult('No git repos found'); return; }
    isPullingAll = true;
    const errors: string[] = [];
    for (const repoPath of repos) {
      try {
        await invoke<string>('git_pull', { repoPath });
      } catch (e: any) {
        errors.push(String(e));
      }
    }
    isPullingAll = false;
    showResult(errors.length > 0 ? `Pull error: ${errors[0]}` : `Pulled ${repos.length} repo(s)`);
  }

  async function handleMouseDown(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) {
      return;
    }
    if (e.buttons === 1) {
      e.preventDefault();
      try {
        await getCurrentWindow().startDragging();
      } catch (err) {
        console.error('startDragging failed:', err);
      }
    }
  }

  async function handleDoubleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    try {
      const win = getCurrentWindow();
      const maximized = await win.isMaximized();
      if (maximized) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    } catch (err) {
      console.error('maximize failed:', err);
    }
  }
</script>

{#if showRunConfigDialog}
  <RunConfigDialog onclose={() => { showRunConfigDialog = false; }} />
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="title-bar" onmousedown={handleMouseDown} ondblclick={handleDoubleClick} onclick={() => { showRunDropdown = false; }}>
  <div class="traffic-light-space" style="width: {isFullscreen ? '0px' : '78px'}"></div>

  <div class="project-info">
    <img src="/vaire-icon.png" width="18" height="18" alt="V" class="project-icon" />
    <span class="project-name">{$workspaceName || 'Vaire'}</span>
    <span class="branch-name">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 2.122a2.25 2.25 0 1 0-1 0v1.836A2.25 2.25 0 0 0 5.75 9.5h1.378a2.251 2.251 0 1 0 0-1H5.75a1.25 1.25 0 0 1-1.25-1.25V5.372Zm6.75 2.428a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3.5-6.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
      </svg>
      {displayBranch || '...'}
    </span>
  </div>

  <div class="spacer"></div>

  <div class="title-actions">
    {#if opResult}
      <span class="op-result">{opResult}</span>
    {/if}
    <button
      class="title-action-btn fetch-btn"
      class:spinning={isFetchingAll}
      title="Fetch All Repos"
      onclick={fetchAll}
      disabled={isFetchingAll || isPullingAll}
    >
      {#if isFetchingAll}
        <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      {/if}
    </button>
    <button
      class="title-action-btn pull-btn"
      title="Pull All Repos (ff-only)"
      onclick={pullAll}
      disabled={isFetchingAll || isPullingAll}
    >
      {#if isPullingAll}
        <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="17 1 21 5 17 9"/>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <polyline points="7 23 3 19 7 15"/>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
      {/if}
    </button>
    <!-- Run controls -->
    <div class="run-controls">
      {#if isRunning && runningNames.length > 0}
        <span class="run-config-name">{runningNames.join(', ')}</span>
        <span class="run-connected-badge">RUNNING</span>
      {:else if getActiveConfig()}
        <span class="run-config-name">{getActiveConfig()?.name}</span>
      {/if}
      <!-- Stop button (only when something is running) -->
      {#if isRunning}
        <button
          class="title-action-btn stop-btn"
          title="Stop active run"
          onclick={stopRun}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="1"/>
          </svg>
        </button>
      {/if}

      <!-- Run button -->
      <button
        class="title-action-btn run-btn"
        title={getActiveConfig()?.name ?? 'Run (no config)'}
        onclick={runActiveConfig}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.25 3v10l8.5-5-8.5-5Z"/>
        </svg>
      </button>

      <!-- Dropdown to select config -->
      <div class="run-dropdown-wrapper">
        <button
          class="run-dropdown-btn"
          title="Select run configuration"
          onclick={(e) => { e.stopPropagation(); showRunDropdown = !showRunDropdown; }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 5l6 6 6-6"/>
          </svg>
        </button>

        {#if showRunDropdown}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="run-dropdown" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            {#if $runConfigs.length === 0}
              <div class="run-dropdown-empty">No configurations</div>
            {:else}
              {#each $runConfigs as config}
                <button
                  class="run-dropdown-item"
                  class:active={$activeRunConfigId === config.id}
                  onclick={() => selectConfig(config.id)}
                >
                  {config.name}
                  <span class="run-dropdown-cmd">{config.command}</span>
                </button>
              {/each}
            {/if}
            <div class="run-dropdown-separator"></div>
            <button
              class="run-dropdown-item"
              onclick={() => { showRunDropdown = false; showRunConfigDialog = true; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Edit Configurations...
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Debug button -->
    <div class="run-controls debug-controls-group">
      {#if isDebugging}
        <button
          class="title-action-btn stop-btn"
          title="Stop Debug"
          onclick={stopDebug}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="1"/>
          </svg>
        </button>
      {/if}
      <button
        class="title-action-btn debug-btn"
        title="Debug {getActiveConfig()?.name ?? '(no config)'}"
        onclick={debugActiveConfig}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 2a2 2 0 0 1 4 0"/>
          <path d="M14 2a2 2 0 0 1 4 0"/>
          <path d="M12 12v6"/>
          <path d="M8 9h8"/>
          <path d="M19 9l2-2"/>
          <path d="M5 9 3 7"/>
          <path d="M19 14l2 1"/>
          <path d="M5 14l-2 1"/>
          <path d="M6 17l-2 2"/>
          <path d="M18 17l2 2"/>
          <rect x="6" y="8" width="12" height="12" rx="2"/>
        </svg>
      </button>
    </div>

    <!-- Open project in new window -->
    <button
      class="title-action-btn"
      title="Open Project in New Window"
      onclick={openNewWindow}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18"/>
        <path d="M9 3v6"/>
        <path d="M15 14h3"/>
        <path d="M15 17h3"/>
        <path d="M9 14h.01"/>
        <path d="M9 17h.01"/>
        <path d="M12 14h.01"/>
        <path d="M12 17h.01"/>
      </svg>
    </button>

    <button class="title-action-btn" title="Search Everywhere (Double Shift)">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="7" cy="7" r="4.5"/>
        <path d="M10.5 10.5 14 14"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .title-bar {
    height: var(--spacing-title-bar);
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 8px;
    -webkit-user-select: none;
    user-select: none;
    cursor: default;
  }

  .traffic-light-space {
    flex-shrink: 0;
    transition: width 0.15s ease;
  }

  .project-info {
    display: flex;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }

  .project-icon {
    width: 18px;
    height: 18px;
    border-radius: 4px;
  }

  .project-name {
    font-weight: 600;
    font-size: 12px;
    color: var(--color-text-primary);
  }

  .branch-name {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--color-text-tertiary);
    font-size: 11px;
  }

  .spacer {
    flex: 1;
  }

  .title-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .title-action-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .title-action-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .fetch-btn {
    color: #56b6c2;
  }

  .fetch-btn:hover:not(:disabled) {
    color: #6ec8d4;
  }

  .pull-btn {
    color: #6a9955;
  }

  .pull-btn:hover:not(:disabled) {
    color: #7ebf65;
  }

  .run-btn {
    color: var(--color-success);
  }

  .run-btn:hover:not(:disabled) {
    color: var(--color-success);
    filter: brightness(1.2);
  }

  .run-btn:disabled {
    cursor: default;
  }

  .run-config-name {
    font-size: 11px;
    color: var(--color-text-secondary);
    white-space: nowrap;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    margin-right: 2px;
  }

  .run-connected-badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(74, 222, 128, 0.2);
    color: var(--color-success);
    pointer-events: none;
    margin-right: 2px;
  }

  .run-controls {
    display: flex;
    align-items: center;
    gap: 1px;
    position: relative;
  }

  .stop-btn {
    color: var(--color-error, #f87171);
  }

  .stop-btn:hover {
    color: var(--color-error, #f87171);
    background: rgba(248, 113, 113, 0.15);
  }

  .run-dropdown-btn {
    width: 16px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.1s;
  }

  .run-dropdown-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .run-dropdown-wrapper {
    position: relative;
  }

  .run-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 4px;
    min-width: 200px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 500;
  }

  .run-dropdown-empty {
    padding: 8px 10px;
    font-size: 12px;
    color: var(--color-text-muted);
    text-align: center;
  }

  .run-dropdown-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    border-radius: 4px;
    text-align: left;
    transition: background 0.1s;
    flex-direction: column;
    align-items: flex-start;
  }

  .run-dropdown-item:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .run-dropdown-item.active {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }

  .run-dropdown-cmd {
    font-family: var(--font-editor, monospace);
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .run-dropdown-separator {
    height: 1px;
    background: var(--color-border-subtle);
    margin: 3px 6px;
  }

  .title-action-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .debug-controls-group {
    margin-left: 2px;
    padding-left: 4px;
    border-left: 1px solid var(--color-border-subtle);
  }

  .debug-btn {
    color: #e8875b;
  }

  .debug-btn:hover:not(:disabled) {
    color: #f09a72;
  }

  .debug-btn:disabled {
    cursor: default;
  }

  .op-result {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  .spin {
    animation: titlebar-spin 0.8s linear infinite;
  }

  @keyframes titlebar-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
</style>
