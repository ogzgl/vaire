<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal as XTerm } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { invoke } from '@tauri-apps/api/core';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { activeTheme } from '$lib/stores/theme';
  import { fontSettings } from '$lib/stores/theme';
  import { breakpoints } from '$lib/stores/debug';
  import '@xterm/xterm/css/xterm.css';

  interface DebugInstance {
    id: string;
    configName: string;
    ptyId: number;
    terminal: XTerm;
    fitAddon: FitAddon;
    unlisten?: UnlistenFn;
    running: boolean;
  }

  let instances = $state<DebugInstance[]>([]);
  let activeInstanceIdx = $state(0);
  let containerEls = $state<Map<string, HTMLDivElement>>(new Map());

  function emitDebugStatus() {
    const running = instances.filter(i => i.running);
    window.dispatchEvent(new CustomEvent('vaire:debug-status', {
      detail: { running: running.length > 0, names: running.map(i => i.configName) },
    }));
  }

  function themeToXterm(theme: typeof $activeTheme) {
    return {
      background: theme.colors.bgBase,
      foreground: theme.colors.textPrimary,
      cursor: theme.colors.accent,
      selectionBackground: theme.colors.accentSubtle,
    };
  }

  function mountTerminal(instance: DebugInstance) {
    requestAnimationFrame(() => {
      const el = containerEls.get(instance.id);
      if (!el || (instance.terminal as any)._core?._renderService) return;
      instance.terminal.open(el);
      requestAnimationFrame(() => instance.fitAddon.fit());

      const obs = new ResizeObserver(() => {
        requestAnimationFrame(() => instance.fitAddon.fit());
      });
      obs.observe(el);
    });
  }

  function bindContainer(el: HTMLDivElement, id: string) {
    containerEls.set(id, el);
    const inst = instances.find(i => i.id === id);
    if (inst) mountTerminal(inst);
    return {
      destroy() { containerEls.delete(id); },
    };
  }

  export async function startDebug(command: string, cwd: string, env?: Record<string, string>, name?: string) {
    const theme = $activeTheme;
    const font = $fontSettings;

    const terminal = new XTerm({
      theme: themeToXterm(theme),
      fontFamily: `'${font.family}', 'SF Mono', monospace`,
      fontSize: font.size,
      lineHeight: font.lineHeight,
      cursorBlink: false,
      cursorStyle: 'bar',
      cursorWidth: 2,
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    const instanceId = crypto.randomUUID();
    const configName = name || command;

    const instance: DebugInstance = {
      id: instanceId,
      configName,
      ptyId: -1,
      terminal,
      fitAddon,
      running: true,
    };

    instances = [...instances, instance];
    activeInstanceIdx = instances.length - 1;

    await new Promise(r => setTimeout(r, 50));
    mountTerminal(instance);

    terminal.write(`\x1b[90m[debug] $ ${command}\x1b[0m\r\n`);

    try {
      const ptyId = await invoke<number>('terminal_spawn', { cwd });
      instance.ptyId = ptyId;

      instance.unlisten = await listen<string>(`terminal-output-${ptyId}`, (event) => {
        terminal.write(event.payload);
      });

      await invoke('terminal_write', { id: ptyId, data: command + '\n' });
      emitDebugStatus();
    } catch (e) {
      terminal.write(`\x1b[31m[debug] Failed to start: ${e}\x1b[0m\r\n`);
      instance.running = false;
    }
  }

  export function stopDebug() {
    const instance = instances[activeInstanceIdx];
    if (!instance) return;
    stopInstance(instance);
  }

  async function stopInstance(instance: DebugInstance) {
    if (instance.ptyId >= 0) {
      try {
        await invoke('terminal_kill', { id: instance.ptyId });
      } catch {}
      instance.terminal.write(`\r\n\x1b[33m[debug] Process terminated.\x1b[0m\r\n`);
    }
    instance.running = false;
    instance.unlisten?.();
    instance.unlisten = undefined;
    instances = [...instances];
    emitDebugStatus();
  }

  async function closeInstance(idx: number) {
    const instance = instances[idx];
    if (!instance) return;
    if (instance.running) await stopInstance(instance);
    instance.unlisten?.();
    instance.terminal.dispose();
    instances = instances.filter((_, i) => i !== idx);
    containerEls.delete(instance.id);
    if (activeInstanceIdx >= instances.length) {
      activeInstanceIdx = Math.max(0, instances.length - 1);
    }
    emitDebugStatus();
  }

  function switchTab(idx: number) {
    activeInstanceIdx = idx;
    requestAnimationFrame(() => {
      const inst = instances[idx];
      if (inst) inst.fitAddon.fit();
    });
  }

  function handleDebugStart(e: Event) {
    const { command, cwd, env, name } = (e as CustomEvent<{ command: string; cwd: string; env?: Record<string, string>; name?: string }>).detail;
    startDebug(command, cwd, env, name);
  }

  function handleDebugStop() {
    stopDebug();
  }

  // Theme reactivity
  $effect(() => {
    const theme = $activeTheme;
    for (const inst of instances) {
      inst.terminal.options.theme = themeToXterm(theme);
    }
  });

  $effect(() => {
    const f = $fontSettings;
    for (const inst of instances) {
      inst.terminal.options.fontFamily = `'${f.family}', 'SF Mono', monospace`;
      inst.terminal.options.fontSize = f.size;
      inst.terminal.options.lineHeight = f.lineHeight;
      requestAnimationFrame(() => inst.fitAddon.fit());
    }
  });

  onMount(() => {
    window.addEventListener('vaire:debug-start', handleDebugStart);
    window.addEventListener('vaire:debug-stop', handleDebugStop);
  });

  onDestroy(() => {
    for (const inst of instances) {
      inst.unlisten?.();
      inst.terminal.dispose();
    }
    window.removeEventListener('vaire:debug-start', handleDebugStart);
    window.removeEventListener('vaire:debug-stop', handleDebugStop);
  });
</script>

<div class="debug-panel">
  <!-- Main layout: left=tabs+console+breakpoints, right=variables+callstack -->
  <div class="debug-body">
    <!-- Left: Console output + Breakpoints -->
    <div class="debug-left">
      {#if instances.length === 0}
        <div class="debug-empty">No debug sessions. Click the debug button to start one.</div>
      {:else}
        <!-- Tabs -->
        <div class="debug-tabs">
          {#each instances as inst, idx}
            <button
              class="debug-tab"
              class:debug-tab-active={activeInstanceIdx === idx}
              onclick={() => switchTab(idx)}
            >
              {#if inst.running}
                <span class="debug-tab-dot running"></span>
              {:else}
                <span class="debug-tab-dot stopped"></span>
              {/if}
              <span class="debug-tab-name">{inst.configName}</span>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <span class="debug-tab-close" onclick={(e: MouseEvent) => { e.stopPropagation(); closeInstance(idx); }}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                </svg>
              </span>
            </button>
          {/each}
        </div>

        <!-- Terminal containers -->
        {#each instances as inst, idx}
          <div
            class="debug-console"
            class:visible={activeInstanceIdx === idx}
            data-instance-id={inst.id}
            use:bindContainer={inst.id}
          ></div>
        {/each}
      {/if}

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

  .debug-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  /* Tabs */
  .debug-tabs {
    display: flex;
    gap: 0;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    overflow-x: auto;
    padding: 0 4px;
  }

  .debug-tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    transition: color 0.1s, background 0.1s;
  }

  .debug-tab:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .debug-tab-active {
    color: var(--color-text-primary);
    border-bottom-color: #e8875b;
  }

  .debug-tab-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .debug-tab-dot.running { background: var(--color-success); }
  .debug-tab-dot.stopped { background: var(--color-text-muted); }

  .debug-tab-name {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .debug-tab-close {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 3px;
    flex-shrink: 0;
    opacity: 0;
    color: var(--color-text-muted);
    transition: opacity 0.1s, background 0.1s;
  }

  .debug-tab:hover .debug-tab-close { opacity: 1; }
  .debug-tab-close:hover {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }

  /* Console */
  .debug-console {
    flex: 1;
    min-height: 0;
    padding: 4px 0 0 8px;
    overflow: hidden;
    display: none;
  }

  .debug-console.visible { display: block; }

  .debug-console :global(.xterm) { height: 100%; }
  .debug-console :global(.xterm-viewport) { overflow-y: auto !important; }
  .debug-console :global(.xterm-viewport::-webkit-scrollbar) { width: 6px; }
  .debug-console :global(.xterm-viewport::-webkit-scrollbar-track) { background: transparent; }
  .debug-console :global(.xterm-viewport::-webkit-scrollbar-thumb) { background: var(--color-border); border-radius: 3px; }

  /* Section labels */
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

  .breakpoint-item:hover { background: var(--color-bg-hover); }
  .breakpoint-item.disabled { opacity: 0.5; }

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
