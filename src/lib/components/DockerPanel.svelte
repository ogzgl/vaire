<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal as XTerm } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { invoke } from '@tauri-apps/api/core';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { activeTheme, fontSettings } from '$lib/stores/theme';
  import '@xterm/xterm/css/xterm.css';

  interface DockerContainer {
    id: string;
    name: string;
    image: string;
    status: string;
    state: string;
    ports: string;
    compose_project: string | null;
    compose_service: string | null;
  }

  interface ComposeGroup {
    project: string;
    containers: DockerContainer[];
    expanded: boolean;
    allRunning: boolean;
    anyRunning: boolean;
  }

  let containers = $state<DockerContainer[]>([]);
  let loading = $state(false);
  let error = $state('');
  let onlyRunning = $state(false);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;
  let expandedProjects = $state<Set<string>>(new Set());

  // Log viewer
  let logContainerId = $state<string | null>(null);
  let logContainerName = $state('');
  let logPtyId = $state<number | null>(null);
  let logTerminal: XTerm | null = null;
  let logFitAddon: FitAddon | null = null;
  let logUnlisten: UnlistenFn | null = null;
  let logEl: HTMLDivElement | null = null;

  // Resizable split
  let splitPercent = $state(55);
  let panelEl: HTMLDivElement | null = null;

  // Group containers by compose project
  let groups = $derived.by(() => {
    const filtered = onlyRunning ? containers.filter(c => c.state === 'running') : containers;
    const projectMap = new Map<string, DockerContainer[]>();
    const standalone: DockerContainer[] = [];

    for (const c of filtered) {
      if (c.compose_project) {
        if (!projectMap.has(c.compose_project)) projectMap.set(c.compose_project, []);
        projectMap.get(c.compose_project)!.push(c);
      } else {
        standalone.push(c);
      }
    }

    const composeGroups: ComposeGroup[] = [...projectMap.entries()].map(([project, ctrs]) => ({
      project,
      containers: ctrs,
      expanded: expandedProjects.has(project),
      allRunning: ctrs.every(c => c.state === 'running'),
      anyRunning: ctrs.some(c => c.state === 'running'),
    }));

    // Sort: groups with running containers first, then alphabetical
    composeGroups.sort((a, b) => {
      if (a.anyRunning !== b.anyRunning) return a.anyRunning ? -1 : 1;
      return a.project.localeCompare(b.project);
    });

    return { composeGroups, standalone };
  });

  function toggleProject(project: string) {
    const next = new Set(expandedProjects);
    if (next.has(project)) next.delete(project);
    else next.add(project);
    expandedProjects = next;
  }

  async function refresh() {
    loading = true;
    error = '';
    try {
      containers = await invoke<DockerContainer[]>('docker_list_containers');
    } catch (e) {
      error = String(e);
      containers = [];
    }
    loading = false;
  }

  async function containerAction(id: string, action: string) {
    try {
      await invoke('docker_container_action', { containerId: id, action });
      await refresh();
    } catch (e) {
      error = String(e);
    }
  }

  async function composeAction(project: string, action: string) {
    try {
      await invoke('docker_compose_action', { project, action });
      await refresh();
    } catch (e) {
      error = String(e);
    }
  }

  async function showLogs(container: DockerContainer) {
    await cleanupLogs();

    logContainerId = container.id;
    logContainerName = container.compose_service || container.name;

    const theme = $activeTheme;
    const font = $fontSettings;

    logTerminal = new XTerm({
      theme: {
        background: theme.colors.bgBase,
        foreground: theme.colors.textPrimary,
        cursor: theme.colors.accent,
        selectionBackground: theme.colors.accentSubtle,
      },
      fontFamily: `'${font.family}', 'SF Mono', monospace`,
      fontSize: font.size,
      lineHeight: font.lineHeight,
      cursorBlink: false,
      scrollback: 5000,
      disableStdin: true,
    });

    logFitAddon = new FitAddon();
    logTerminal.loadAddon(logFitAddon);

    await new Promise(r => setTimeout(r, 30));

    if (logEl) {
      logTerminal.open(logEl);
      requestAnimationFrame(() => logFitAddon?.fit());
    }

    try {
      const ptyId = await invoke<number>('docker_logs_spawn', { containerId: container.id });
      logPtyId = ptyId;
      logUnlisten = await listen<string>(`terminal-output-${ptyId}`, (event) => {
        logTerminal?.write(event.payload);
      });
    } catch (e) {
      logTerminal?.write(`\x1b[31mFailed to get logs: ${e}\x1b[0m\r\n`);
    }
  }

  async function cleanupLogs() {
    if (logPtyId !== null) {
      try { await invoke('terminal_kill', { id: logPtyId }); } catch {}
      logPtyId = null;
    }
    logUnlisten?.();
    logUnlisten = null;
    logTerminal?.dispose();
    logTerminal = null;
    logFitAddon = null;
    logContainerId = null;
  }

  function startDrag(e: MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startPct = splitPercent;

    function onMove(ev: MouseEvent) {
      if (!panelEl) return;
      const h = panelEl.getBoundingClientRect().height;
      splitPercent = Math.max(20, Math.min(80, startPct + ((ev.clientY - startY) / h) * 100));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      requestAnimationFrame(() => logFitAddon?.fit());
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  $effect(() => {
    const theme = $activeTheme;
    if (logTerminal) {
      logTerminal.options.theme = {
        background: theme.colors.bgBase,
        foreground: theme.colors.textPrimary,
        cursor: theme.colors.accent,
        selectionBackground: theme.colors.accentSubtle,
      };
    }
  });

  onMount(() => {
    refresh();
    refreshInterval = setInterval(refresh, 5000);
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
    cleanupLogs();
  });
</script>

<div class="docker-panel" bind:this={panelEl}>
  <div class="container-list" style="height: {logContainerId ? splitPercent : 100}%">
    <div class="panel-toolbar">
      <label class="toggle-label">
        <input type="checkbox" bind:checked={onlyRunning} />
        <span>Running only</span>
      </label>
      <button class="toolbar-btn" title="Refresh" onclick={refresh}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
          <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
        </svg>
      </button>
    </div>

    {#if error}
      <div class="error-msg">{error}</div>
    {/if}

    <div class="container-items">
      {#if loading && containers.length === 0}
        <div class="empty-msg">Loading...</div>
      {:else if groups.composeGroups.length === 0 && groups.standalone.length === 0}
        <div class="empty-msg">No containers found</div>
      {:else}
        <!-- Compose groups -->
        {#each groups.composeGroups as group}
          <div class="group-header" role="button" tabindex="0" onclick={() => toggleProject(group.project)}>
            <svg class="chevron" class:expanded={group.expanded} width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 4l4 4-4 4"/>
            </svg>
            <span class="group-dot" class:dot-running={group.anyRunning} class:dot-stopped={!group.anyRunning}></span>
            <span class="group-name">{group.project}</span>
            <span class="group-count">{group.containers.length}</span>
            <div class="group-actions" onclick={(e) => e.stopPropagation()}>
              {#if group.anyRunning}
                <button class="action-btn" title="Stop all" onclick={() => composeAction(group.project, 'stop')}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                </button>
                <button class="action-btn" title="Restart all" onclick={() => composeAction(group.project, 'restart')}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                  </svg>
                </button>
              {:else}
                <button class="action-btn play" title="Start all" onclick={() => composeAction(group.project, 'start')}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
              {/if}
            </div>
          </div>

          {#if group.expanded}
            {#each group.containers as c}
              <div class="container-row nested" class:running={c.state === 'running'}>
                <div class="container-info" role="button" tabindex="0" onclick={() => showLogs(c)}>
                  <span class="state-dot" class:dot-running={c.state === 'running'} class:dot-stopped={c.state !== 'running'}></span>
                  <div class="container-details">
                    <span class="container-name">{c.compose_service || c.name}</span>
                    <span class="container-image">{c.image}</span>
                  </div>
                  <span class="container-status">{c.status}</span>
                </div>
                <div class="container-actions">
                  {#if c.state === 'running'}
                    <button class="action-btn" title="Stop" onclick={() => containerAction(c.id, 'stop')}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                    </button>
                    <button class="action-btn" title="Restart" onclick={() => containerAction(c.id, 'restart')}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                      </svg>
                    </button>
                  {:else}
                    <button class="action-btn play" title="Start" onclick={() => containerAction(c.id, 'start')}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}
        {/each}

        <!-- Standalone containers -->
        {#each groups.standalone as c}
          <div class="container-row" class:running={c.state === 'running'}>
            <div class="container-info" role="button" tabindex="0" onclick={() => showLogs(c)}>
              <span class="state-dot" class:dot-running={c.state === 'running'} class:dot-stopped={c.state !== 'running'}></span>
              <div class="container-details">
                <span class="container-name">{c.name}</span>
                <span class="container-image">{c.image}</span>
              </div>
              <span class="container-status">{c.status}</span>
            </div>
            <div class="container-actions">
              {#if c.state === 'running'}
                <button class="action-btn" title="Stop" onclick={() => containerAction(c.id, 'stop')}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                </button>
              {:else}
                <button class="action-btn play" title="Start" onclick={() => containerAction(c.id, 'start')}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
              {/if}
              <button class="action-btn danger" title="Remove" onclick={() => containerAction(c.id, 'rm')}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  {#if logContainerId}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="split-handle" onmousedown={startDrag}></div>
    <div class="log-viewer" style="height: {100 - splitPercent}%">
      <div class="log-header">
        <span class="log-title">Logs: {logContainerName}</span>
        <button class="toolbar-btn" onclick={cleanupLogs} title="Close logs">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>
      <div class="log-terminal" bind:this={logEl}></div>
    </div>
  {/if}
</div>

<style>
  .docker-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .container-list {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .toggle-label input { margin: 0; }

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
  }

  .toolbar-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .error-msg {
    padding: 8px 10px;
    font-size: 11px;
    color: var(--color-error);
  }

  .empty-msg {
    padding: 24px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .container-items {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
  }

  /* ── Compose group header ── */
  .group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.1s;
    border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.04));
  }

  .group-header:hover { background: var(--color-bg-hover); }

  .chevron {
    flex-shrink: 0;
    color: var(--color-text-muted);
    transition: transform 0.15s;
  }

  .chevron.expanded { transform: rotate(90deg); }

  .group-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .group-name {
    font-weight: 600;
    color: var(--color-text-primary);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .group-count {
    font-size: 10px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--color-bg-hover);
    color: var(--color-text-muted);
    font-weight: 600;
    flex-shrink: 0;
  }

  .group-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .group-header:hover .group-actions { opacity: 1; }

  /* ── Container rows ── */
  .container-row {
    display: flex;
    align-items: center;
    padding: 0 4px 0 0;
    border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.04));
  }

  .container-row.nested {
    padding-left: 18px;
  }

  .container-row:hover { background: var(--color-bg-hover); }

  .container-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    cursor: pointer;
    min-width: 0;
  }

  .state-dot, .dot-running, .dot-stopped {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-running { background: var(--color-success); }
  .dot-stopped { background: var(--color-text-muted); }

  .container-details {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .container-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .container-image {
    font-size: 10px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .container-status {
    font-size: 10px;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .container-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.1s;
    flex-shrink: 0;
  }

  .container-row:hover .container-actions { opacity: 1; }

  .action-btn {
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
  }

  .action-btn:hover {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }

  .action-btn.play:hover { color: var(--color-success); }
  .action-btn.danger:hover { color: var(--color-error); }

  /* ── Log viewer ── */
  .split-handle {
    height: 4px;
    background: var(--color-border);
    cursor: row-resize;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .split-handle:hover { background: var(--color-accent); }

  .log-viewer {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .log-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .log-terminal {
    flex: 1;
    padding: 4px 0 0 8px;
  }

  .log-terminal :global(.xterm) { height: 100%; }
  .log-terminal :global(.xterm-viewport) { overflow-y: auto !important; }
  .log-terminal :global(.xterm-viewport::-webkit-scrollbar) { width: 8px; }
  .log-terminal :global(.xterm-viewport::-webkit-scrollbar-track) { background: transparent; }
  .log-terminal :global(.xterm-viewport::-webkit-scrollbar-thumb) { background: var(--color-border); border-radius: 4px; }
</style>
