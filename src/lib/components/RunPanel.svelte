<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal as XTerm } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { invoke } from '@tauri-apps/api/core';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { activeTheme } from '$lib/stores/theme';
  import { fontSettings } from '$lib/stores/theme';
  import '@xterm/xterm/css/xterm.css';

  interface RunInstance {
    id: string;
    configName: string;
    ptyId: number;
    terminal: XTerm;
    fitAddon: FitAddon;
    unlisten?: UnlistenFn;
    running: boolean;
  }

  let instances = $state<RunInstance[]>([]);
  let activeInstanceIdx = $state(0);
  let containerEls = $state<Map<string, HTMLDivElement>>(new Map());

  function emitRunStatus() {
    const running = instances.filter(i => i.running);
    window.dispatchEvent(new CustomEvent('vaire:run-status', {
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

  function mountTerminal(instance: RunInstance) {
    // Wait for container element to appear
    requestAnimationFrame(() => {
      const el = containerEls.get(instance.id);
      if (!el || (instance.terminal as any)._core?._renderService) return; // already opened
      instance.terminal.open(el);
      requestAnimationFrame(() => instance.fitAddon.fit());

      const obs = new ResizeObserver(() => {
        requestAnimationFrame(() => instance.fitAddon.fit());
      });
      obs.observe(el);
    });
  }

  export async function startRun(command: string, cwd: string, env?: Record<string, string>, name?: string) {
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

    const instance: RunInstance = {
      id: instanceId,
      configName,
      ptyId: -1,
      terminal,
      fitAddon,
      running: true,
    };

    instances = [...instances, instance];
    activeInstanceIdx = instances.length - 1;

    // Give DOM time to mount
    await new Promise(r => setTimeout(r, 50));
    mountTerminal(instance);

    terminal.write(`\x1b[90m$ ${command}\x1b[0m\r\n`);

    try {
      const ptyId = await invoke<number>('terminal_spawn', { cwd });
      instance.ptyId = ptyId;

      instance.unlisten = await listen<string>(`terminal-output-${ptyId}`, (event) => {
        terminal.write(event.payload);
      });

      await invoke('terminal_write', { id: ptyId, data: command + '\n' });

      emitRunStatus();
    } catch (e) {
      terminal.write(`\x1b[31mFailed to start: ${e}\x1b[0m\r\n`);
      instance.running = false;
    }
  }

  export function stopRun() {
    const instance = instances[activeInstanceIdx];
    if (!instance) return;
    stopInstance(instance);
  }

  async function stopInstance(instance: RunInstance) {
    if (instance.ptyId >= 0) {
      // Kill the PTY — this closes the master fd, sending SIGHUP to the entire process group
      try {
        await invoke('terminal_kill', { id: instance.ptyId });
      } catch {}
      instance.terminal.write(`\r\n\x1b[33m[Process terminated]\x1b[0m\r\n`);
    }
    instance.running = false;
    instance.unlisten?.();
    instance.unlisten = undefined;
    instances = [...instances]; // trigger reactivity

    emitRunStatus();
  }

  async function closeInstance(idx: number) {
    const instance = instances[idx];
    if (!instance) return;

    // Stop if running
    if (instance.running) {
      await stopInstance(instance);
    }
    instance.unlisten?.();
    instance.terminal.dispose();

    instances = instances.filter((_, i) => i !== idx);
    containerEls.delete(instance.id);

    if (activeInstanceIdx >= instances.length) {
      activeInstanceIdx = Math.max(0, instances.length - 1);
    }

    const anyRunning = instances.some(i => i.running);
    window.dispatchEvent(new CustomEvent('vaire:run-status', { detail: anyRunning }));
  }

  function switchTab(idx: number) {
    activeInstanceIdx = idx;
    requestAnimationFrame(() => {
      const inst = instances[idx];
      if (inst) inst.fitAddon.fit();
    });
  }

  function bindContainer(el: HTMLDivElement, id: string) {
    containerEls.set(id, el);
    const inst = instances.find(i => i.id === id);
    if (inst) mountTerminal(inst);
    return {
      destroy() {
        containerEls.delete(id);
      },
    };
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

  onDestroy(() => {
    for (const inst of instances) {
      inst.unlisten?.();
      inst.terminal.dispose();
    }
  });
</script>

<div class="run-panel">
  {#if instances.length === 0}
    <div class="run-empty">No running processes</div>
  {:else}
    <!-- Tabs -->
    <div class="run-tabs">
      {#each instances as inst, idx}
        <button
          class="run-tab"
          class:run-tab-active={activeInstanceIdx === idx}
          onclick={() => switchTab(idx)}
        >
          {#if inst.running}
            <span class="run-tab-dot running"></span>
          {:else}
            <span class="run-tab-dot stopped"></span>
          {/if}
          <span class="run-tab-name">{inst.configName}</span>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <span class="run-tab-close" onclick={(e: MouseEvent) => { e.stopPropagation(); closeInstance(idx); }}>
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
        class="run-terminal-container"
        class:visible={activeInstanceIdx === idx}
        data-instance-id={inst.id}
        use:bindContainer={inst.id}
      ></div>
    {/each}
  {/if}
</div>

<style>
  .run-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .run-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .run-tabs {
    display: flex;
    gap: 0;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    overflow-x: auto;
    padding: 0 4px;
  }

  .run-tab {
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

  .run-tab:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .run-tab-active {
    color: var(--color-text-primary);
    border-bottom-color: var(--color-accent);
  }

  .run-tab-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .run-tab-dot.running {
    background: var(--color-success);
  }

  .run-tab-dot.stopped {
    background: var(--color-text-muted);
  }

  .run-tab-name {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .run-tab-close {
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 3px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.1s, background 0.1s;
  }

  .run-tab:hover .run-tab-close {
    opacity: 1;
  }

  .run-tab-close:hover {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }

  .run-terminal-container {
    flex: 1;
    padding: 4px 0 0 10px;
    box-sizing: border-box;
    display: none;
  }

  .run-terminal-container.visible {
    display: block;
  }

  .run-terminal-container :global(.xterm) {
    height: 100%;
  }

  .run-terminal-container :global(.xterm-viewport) {
    overflow-y: auto !important;
  }

  .run-terminal-container :global(.xterm-viewport::-webkit-scrollbar) {
    width: 8px;
  }

  .run-terminal-container :global(.xterm-viewport::-webkit-scrollbar-track) {
    background: transparent;
  }

  .run-terminal-container :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: var(--color-border);
    border-radius: 4px;
  }
</style>
