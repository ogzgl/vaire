<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal as XTerm } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { invoke } from '@tauri-apps/api/core';
  import { activeTheme } from '$lib/stores/theme';
  import { fontSettings } from '$lib/stores/theme';
  import { breakpoints, debugSession } from '$lib/stores/debug';
  import { runConfigs, activeRunConfigId } from '$lib/stores/runConfigs';
  import { workspacePath } from '$lib/stores/workspace';
  import '@xterm/xterm/css/xterm.css';

  let containerEl: HTMLDivElement | undefined;
  let terminal: XTerm | undefined;
  let fitAddon: FitAddon | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let unlistenOutput: UnlistenFn | undefined;
  let unlistenStopped: UnlistenFn | undefined;

  function themeToXterm(theme: typeof $activeTheme) {
    return {
      background: theme.colors.bgBase,
      foreground: theme.colors.textPrimary,
      cursor: theme.colors.accent,
      selectionBackground: theme.colors.accentSubtle,
    };
  }

  function initTerminal() {
    if (!containerEl || terminal) return;
    const theme = $activeTheme;
    const font = $fontSettings;

    terminal = new XTerm({
      theme: themeToXterm(theme),
      fontFamily: `'${font.family}', 'SF Mono', monospace`,
      fontSize: font.size,
      lineHeight: font.lineHeight,
      cursorBlink: false,
      cursorStyle: 'bar',
      cursorWidth: 2,
      allowProposedApi: true,
      scrollback: 10000,
      disableStdin: true,
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerEl);
    requestAnimationFrame(() => fitAddon?.fit());

    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitAddon?.fit());
    });
    resizeObserver.observe(containerEl);
  }

  function getActiveConfig() {
    const id = $activeRunConfigId;
    return $runConfigs.find(c => c.id === id) ?? $runConfigs[0] ?? null;
  }

  async function startDebug() {
    const config = getActiveConfig();
    if (!config) {
      terminal?.write('\x1b[33mNo run configuration selected.\x1b[0m\r\n');
      return;
    }
    const wsPath = $workspacePath || '.';
    const cwd = config.cwd === '.' ? wsPath : `${wsPath}/${config.cwd}`;

    if (!terminal && containerEl) initTerminal();
    terminal?.clear();
    terminal?.write(`\x1b[90m[debug] Starting: ${config.command}\x1b[0m\r\n`);

    try {
      const pid = await invoke<number>('debug_start', {
        cwd,
        command: config.command,
        args: [],
      });

      debugSession.set({ active: true, processId: pid, status: 'running' });

      unlistenOutput = await listen<string>('debug-output', (event) => {
        terminal?.write(event.payload.replace(/\n/g, '\r\n'));
      });

      unlistenStopped = await listen<number>('debug-stopped', (_event) => {
        debugSession.update(s => ({ ...s, status: 'stopped', active: false }));
        terminal?.write('\x1b[90m[debug] Process exited.\x1b[0m\r\n');
        window.dispatchEvent(new CustomEvent('vaire:debug-status', { detail: false }));
        unlistenOutput?.();
        unlistenStopped?.();
      });

      window.dispatchEvent(new CustomEvent('vaire:debug-status', { detail: true }));
    } catch (e) {
      terminal?.write(`\x1b[31m[debug] Failed to start: ${e}\x1b[0m\r\n`);
      debugSession.set({ active: false, processId: null, status: 'idle' });
    }
  }

  async function stopDebug() {
    const session = $debugSession;
    if (session.processId !== null) {
      try {
        await invoke('debug_stop', { pid: session.processId });
      } catch (e) {
        console.warn('debug_stop error:', e);
      }
    }
    debugSession.set({ active: false, processId: null, status: 'stopped' });
    terminal?.write('\x1b[33m[debug] Stopped.\x1b[0m\r\n');
    window.dispatchEvent(new CustomEvent('vaire:debug-status', { detail: false }));
    unlistenOutput?.();
    unlistenStopped?.();
  }

  async function restartDebug() {
    await stopDebug();
    await startDebug();
  }

  function handleDebugStart(e: Event) {
    const { command, cwd } = (e as CustomEvent<{ command: string; cwd: string }>).detail;
    if (!terminal && containerEl) initTerminal();
    terminal?.clear();
    terminal?.write(`\x1b[90m[debug] Starting: ${command}\x1b[0m\r\n`);
    invoke<number>('debug_start', { cwd, command, args: [] }).then(async (pid) => {
      debugSession.set({ active: true, processId: pid, status: 'running' });
      unlistenOutput = await listen<string>('debug-output', (event) => {
        terminal?.write(event.payload.replace(/\n/g, '\r\n'));
      });
      unlistenStopped = await listen<number>('debug-stopped', (_event) => {
        debugSession.update(s => ({ ...s, status: 'stopped', active: false }));
        terminal?.write('\x1b[90m[debug] Process exited.\x1b[0m\r\n');
        window.dispatchEvent(new CustomEvent('vaire:debug-status', { detail: false }));
        unlistenOutput?.();
        unlistenStopped?.();
      });
      window.dispatchEvent(new CustomEvent('vaire:debug-status', { detail: true }));
    }).catch(e => {
      terminal?.write(`\x1b[31m[debug] Failed: ${e}\x1b[0m\r\n`);
      debugSession.set({ active: false, processId: null, status: 'idle' });
    });
  }

  function handleDebugStop() {
    stopDebug();
  }

  $effect(() => {
    if (terminal) {
      terminal.options.theme = themeToXterm($activeTheme);
    }
  });

  $effect(() => {
    if (terminal) {
      const f = $fontSettings;
      terminal.options.fontFamily = `'${f.family}', 'SF Mono', monospace`;
      terminal.options.fontSize = f.size;
      terminal.options.lineHeight = f.lineHeight;
      requestAnimationFrame(() => fitAddon?.fit());
    }
  });

  onMount(() => {
    initTerminal();
    window.addEventListener('vaire:debug-start', handleDebugStart);
    window.addEventListener('vaire:debug-stop', handleDebugStop);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    unlistenOutput?.();
    unlistenStopped?.();
    terminal?.dispose();
    window.removeEventListener('vaire:debug-start', handleDebugStart);
    window.removeEventListener('vaire:debug-stop', handleDebugStop);
  });
</script>

<div class="debug-panel">
  <!-- Toolbar -->
  <div class="debug-toolbar">
    <div class="debug-controls">
      {#if $debugSession.active}
        <button class="debug-btn stop" title="Stop" onclick={stopDebug}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="1"/>
          </svg>
          Stop
        </button>
        <button class="debug-btn restart" title="Restart" onclick={restartDebug}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
          </svg>
          Restart
        </button>
      {:else}
        <button class="debug-btn start" title="Start Debug" onclick={startDebug}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.25 3v10l8.5-5-8.5-5Z"/>
          </svg>
          Debug
        </button>
      {/if}
    </div>

    <div class="debug-config-label">
      {#if getActiveConfig()}
        <span class="config-name">{getActiveConfig()?.name}</span>
      {:else}
        <span class="config-none">No configuration</span>
      {/if}
    </div>

    <div class="debug-status">
      <span class="status-dot" class:running={$debugSession.status === 'running'} class:stopped={$debugSession.status === 'stopped' || $debugSession.status === 'idle'}></span>
      <span class="status-text">{$debugSession.status}</span>
    </div>
  </div>

  <!-- Main layout: left=console+breakpoints, right=variables+callstack -->
  <div class="debug-body">
    <!-- Left: Console output + Breakpoints -->
    <div class="debug-left">
      <!-- Console output -->
      <div class="debug-section-label">Console</div>
      <div class="debug-console" bind:this={containerEl}></div>

      <!-- Breakpoints list -->
      <div class="debug-section-label breakpoints-label">
        Breakpoints
        {#if $breakpoints.length > 0}
          <button class="clear-btn" onclick={() => breakpoints.clear()} title="Clear all breakpoints">Clear all</button>
        {/if}
      </div>
      <div class="breakpoints-list">
        {#if $breakpoints.length === 0}
          <div class="breakpoints-empty">No breakpoints set. Click in the gutter to add one.</div>
        {:else}
          {#each $breakpoints as bp (bp.id)}
            <div class="breakpoint-item" class:disabled={!bp.enabled}>
              <input
                type="checkbox"
                checked={bp.enabled}
                onchange={() => breakpoints.toggle(bp.id)}
                title={bp.enabled ? 'Disable breakpoint' : 'Enable breakpoint'}
              />
              <span class="bp-dot" class:hollow={!bp.enabled}></span>
              <span class="bp-location" title={bp.filePath}>
                {bp.filePath.split('/').pop()}:{bp.line}
              </span>
              <button class="bp-remove" onclick={() => breakpoints.remove(bp.id)} title="Remove breakpoint">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                </svg>
              </button>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Right: Variables + Call Stack -->
    <div class="debug-right">
      <div class="debug-section-label">Variables</div>
      <div class="debug-placeholder">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span>Variables will appear here during debugging</span>
      </div>

      <div class="debug-section-label">Call Stack</div>
      <div class="debug-placeholder">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <line x1="8" y1="6" x2="21" y2="6"/>
          <line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        <span>Call stack will appear here during debugging</span>
      </div>
    </div>
  </div>
</div>

<style>
  .debug-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg-base);
  }

  .debug-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    background: var(--color-bg-surface);
    height: 36px;
  }

  .debug-controls {
    display: flex;
    gap: 4px;
  }

  .debug-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 5px;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s;
  }

  .debug-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .debug-btn.start:hover {
    color: var(--color-success);
    border-color: var(--color-success);
  }

  .debug-btn.stop:hover {
    color: var(--color-error, #f87171);
    border-color: var(--color-error, #f87171);
  }

  .debug-config-label {
    flex: 1;
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .config-name {
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .config-none {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .debug-status {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-text-muted);
    flex-shrink: 0;
  }

  .status-dot.running {
    background: var(--color-success);
    box-shadow: 0 0 4px var(--color-success);
  }

  .status-dot.stopped {
    background: var(--color-text-muted);
  }

  .debug-body {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .debug-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--color-border);
    min-width: 0;
  }

  .debug-right {
    width: 220px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .debug-console {
    flex: 1;
    min-height: 0;
    padding: 4px 0 0 8px;
    overflow: hidden;
  }

  .debug-console :global(.xterm) {
    height: 100%;
  }

  .debug-console :global(.xterm-viewport) {
    overflow-y: auto !important;
  }

  .debug-console :global(.xterm-viewport::-webkit-scrollbar) {
    width: 6px;
  }

  .debug-console :global(.xterm-viewport::-webkit-scrollbar-track) {
    background: transparent;
  }

  .debug-console :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: var(--color-border);
    border-radius: 3px;
  }

  .debug-section-label {
    padding: 4px 10px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
    background: var(--color-bg-surface);
    border-top: 1px solid var(--color-border-subtle);
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .breakpoints-label {
    margin-top: 0;
  }

  .clear-btn {
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 10px;
    cursor: pointer;
    padding: 0 4px;
    border-radius: 3px;
    font-family: inherit;
    text-transform: none;
    letter-spacing: 0;
  }

  .clear-btn:hover {
    color: var(--color-text-secondary);
    background: var(--color-bg-hover);
  }

  .breakpoints-list {
    overflow-y: auto;
    max-height: 120px;
    flex-shrink: 0;
  }

  .breakpoints-empty {
    padding: 8px 10px;
    font-size: 11px;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .breakpoint-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-size: 11px;
    color: var(--color-text-secondary);
    transition: background 0.1s;
  }

  .breakpoint-item:hover {
    background: var(--color-bg-hover);
  }

  .breakpoint-item.disabled {
    opacity: 0.5;
  }

  .bp-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ef4444;
    flex-shrink: 0;
  }

  .bp-dot.hollow {
    background: transparent;
    border: 2px solid #ef4444;
  }

  .bp-location {
    flex: 1;
    font-family: var(--font-editor, monospace);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bp-remove {
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 2px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .bp-remove:hover {
    color: var(--color-error, #f87171);
    background: var(--color-bg-hover);
  }

  .debug-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px;
    font-size: 11px;
    color: var(--color-text-muted);
    text-align: center;
    min-height: 60px;
    max-height: 100px;
  }

  input[type="checkbox"] {
    width: 12px;
    height: 12px;
    cursor: pointer;
    flex-shrink: 0;
    accent-color: #ef4444;
  }
</style>
