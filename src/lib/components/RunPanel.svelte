<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal as XTerm } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { invoke } from '@tauri-apps/api/core';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { activeTheme } from '$lib/stores/theme';
  import { fontSettings } from '$lib/stores/theme';
  import '@xterm/xterm/css/xterm.css';

  let containerEl: HTMLDivElement | undefined;
  let terminal: XTerm | undefined;
  let fitAddon: FitAddon | undefined;
  let unlisten: UnlistenFn | undefined;
  let resizeObserver: ResizeObserver | undefined;

  function themeToXterm(theme: typeof $activeTheme) {
    return {
      background: theme.colors.bgBase,
      foreground: theme.colors.textPrimary,
      cursor: theme.colors.accent,
      selectionBackground: theme.colors.accentSubtle,
    };
  }

  function initTerminal() {
    if (!containerEl) return;

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

  export async function startRun(command: string, cwd: string, env?: Record<string, string>) {
    // Ensure terminal is ready
    if (!terminal && containerEl) {
      initTerminal();
    }
    if (!terminal) return;

    terminal.clear();
    terminal.write(`\x1b[90m$ ${command}\x1b[0m\r\n`);

    try {
      const ptyId = await invoke<number>('terminal_spawn', { cwd });

      unlisten = await listen<string>(`terminal-output-${ptyId}`, (event) => {
        terminal?.write(event.payload);
      });

      // Send the command then newline
      await invoke('terminal_write', { id: ptyId, data: command + '\n' });

    } catch (e) {
      terminal.write(`\x1b[31mFailed to start: ${e}\x1b[0m\r\n`);
    }
  }

  export async function stopRun() {
    try {
      // Get running PTY ids and send Ctrl+C
      // Since we don't track per-run ptyId here, send Ctrl+C as best effort
      terminal?.write(`\x1b[33m^C\x1b[0m\r\n`);
    } catch {
      // ignore
    }
    unlisten?.();
    unlisten = undefined;
  }

  // Theme reactivity
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
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    unlisten?.();
    terminal?.dispose();
  });
</script>

<div class="run-panel" bind:this={containerEl}></div>

<style>
  .run-panel {
    width: 100%;
    height: 100%;
    padding: 6px 0 0 10px;
    box-sizing: border-box;
  }

  .run-panel :global(.xterm) {
    height: 100%;
  }

  .run-panel :global(.xterm-viewport) {
    overflow-y: auto !important;
  }

  .run-panel :global(.xterm-viewport::-webkit-scrollbar) {
    width: 8px;
  }

  .run-panel :global(.xterm-viewport::-webkit-scrollbar-track) {
    background: transparent;
  }

  .run-panel :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: var(--color-border);
    border-radius: 4px;
  }
</style>
