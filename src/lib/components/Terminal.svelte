<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal as XTerm } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { WebLinksAddon } from '@xterm/addon-web-links';
  import { invoke } from '@tauri-apps/api/core';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { activeTheme } from '$lib/stores/theme';
  import { fontSettings } from '$lib/stores/theme';
  import { workspacePath } from '$lib/stores/workspace';
  import { homeDir } from '@tauri-apps/api/path';
  import '@xterm/xterm/css/xterm.css';

  let homeDirPath = $state<string | null>(null);
  homeDir().then(d => { homeDirPath = d; }).catch(() => {});

  interface TerminalTab {
    id: number;           // PTY id from backend
    label: string;
    terminalInstance: XTerm | null;
    fitAddon: FitAddon | null;
    containerEl: HTMLDivElement | null;
    unlisten: UnlistenFn | null;
    resizeObserver: ResizeObserver | null;
    mounted: boolean;
  }

  let tabs = $state<TerminalTab[]>([]);
  let activeTerminalIndex = $state(0);
  let nextLabel = $state(1);

  function themeToXterm(theme: typeof $activeTheme) {
    return {
      background: theme.colors.bgBase,
      foreground: theme.colors.textPrimary,
      cursor: theme.colors.accent,
      cursorAccent: theme.colors.bgBase,
      selectionBackground: theme.colors.accentSubtle,
      selectionForeground: theme.colors.textPrimary,
      black: '#1e1e1e',
      brightBlack: theme.colors.textMuted,
      red: '#f44747',
      brightRed: '#f44747',
      green: '#6a9955',
      brightGreen: '#98c379',
      yellow: '#d7ba7d',
      brightYellow: '#e5c07b',
      blue: theme.colors.accent,
      brightBlue: theme.colors.accentHover,
      magenta: '#c678dd',
      brightMagenta: '#d19aff',
      cyan: '#56b6c2',
      brightCyan: '#56b6c2',
      white: '#d4d4d4',
      brightWhite: '#ffffff',
    };
  }

  async function spawnTerminal(tab: TerminalTab) {
    // Mark as mounted immediately to prevent double-spawn
    tab.mounted = true;

    const theme = $activeTheme;
    const font = $fontSettings;

    if (!tab.containerEl) return;

    const terminal = new XTerm({
      theme: themeToXterm(theme),
      fontFamily: `'${font.family}', 'SF Mono', 'Cascadia Code', monospace`,
      fontSize: font.size,
      lineHeight: font.lineHeight,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      allowProposedApi: true,
      scrollback: 10000,
      tabStopWidth: 4,
      drawBoldTextInBrightColors: true,
      fontWeight: '400',
      fontWeightBold: '600',
      letterSpacing: 0,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(tab.containerEl);

    tab.terminalInstance = terminal;
    tab.fitAddon = fitAddon;

    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    const cwd = $workspacePath || homeDirPath || '/tmp';
    try {
      const ptyId = await invoke<number>('terminal_spawn', { cwd });
      tab.id = ptyId;

      tab.unlisten = await listen<string>(`terminal-output-${ptyId}`, (event) => {
        terminal.write(event.payload);
      });

      terminal.onData((data) => {
        invoke('terminal_write', { id: ptyId, data });
      });

      // Send initial resize to match actual terminal dimensions
      requestAnimationFrame(() => {
        fitAddon.fit();
        const cols = terminal.cols;
        const rows = terminal.rows;
        if (cols > 0 && rows > 0) {
          invoke('terminal_resize', { id: ptyId, rows, cols });
        }
      });
    } catch (e) {
      terminal.writeln(`\x1b[31mFailed to start terminal: ${e}\x1b[0m`);
    }

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        if (tab.id >= 0 && terminal.cols > 0 && terminal.rows > 0) {
          invoke('terminal_resize', { id: tab.id, rows: terminal.rows, cols: terminal.cols });
        }
      });
    });
    resizeObserver.observe(tab.containerEl);
    tab.resizeObserver = resizeObserver;
  }

  async function addTab() {
    const newTab: TerminalTab = {
      id: -1,
      label: `Terminal ${nextLabel}`,
      terminalInstance: null,
      fitAddon: null,
      containerEl: null,
      unlisten: null,
      resizeObserver: null,
      mounted: false,
    };
    nextLabel++;
    tabs = [...tabs, newTab];
    activeTerminalIndex = tabs.length - 1;
    // Mount happens via $effect watching the containerEl binding
  }

  function closeTab(index: number) {
    const tab = tabs[index];
    destroyTab(tab);
    tabs = tabs.filter((_, i) => i !== index);
    if (activeTerminalIndex >= tabs.length) {
      activeTerminalIndex = Math.max(0, tabs.length - 1);
    } else if (activeTerminalIndex > index) {
      activeTerminalIndex--;
    }
  }

  function destroyTab(tab: TerminalTab) {
    tab.resizeObserver?.disconnect();
    tab.unlisten?.();
    tab.terminalInstance?.dispose();
  }

  // Containers for each terminal tab (indexed array)
  let containerEls = $state<(HTMLDivElement | null)[]>([]);

  $effect(() => {
    // When a new tab is added and its container becomes available, spawn the terminal
    tabs.forEach((tab, i) => {
      const el = containerEls[i];
      if (el && !tab.mounted) {
        tab.containerEl = el;
        spawnTerminal(tab);
      }
    });
  });

  // Theme and font reactivity for all terminals
  $effect(() => {
    const theme = $activeTheme;
    for (const tab of tabs) {
      if (tab.terminalInstance) {
        tab.terminalInstance.options.theme = themeToXterm(theme);
      }
    }
  });

  $effect(() => {
    const f = $fontSettings;
    for (const tab of tabs) {
      if (tab.terminalInstance) {
        tab.terminalInstance.options.fontFamily = `'${f.family}', 'SF Mono', 'Cascadia Code', monospace`;
        tab.terminalInstance.options.fontSize = f.size;
        tab.terminalInstance.options.lineHeight = f.lineHeight;
        if (tab.fitAddon) {
          requestAnimationFrame(() => tab.fitAddon?.fit());
        }
      }
    }
  });

  // Fit active terminal when switching tabs
  $effect(() => {
    const idx = activeTerminalIndex;
    const tab = tabs[idx];
    if (tab?.fitAddon) {
      requestAnimationFrame(() => tab.fitAddon?.fit());
    }
  });

  onMount(() => {
    // Create the first terminal
    addTab();
  });

  onDestroy(() => {
    for (const tab of tabs) {
      destroyTab(tab);
    }
  });
</script>

<div class="multi-terminal">
  <div class="terminal-tabs-bar">
    <div class="terminal-tabs">
      {#each tabs as tab, i}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="terminal-tab"
          class:active={activeTerminalIndex === i}
          onclick={() => activeTerminalIndex = i}
          role="tab"
          tabindex="0"
        >
          <span class="terminal-tab-label">{tab.label}</span>
          {#if tabs.length > 1}
            <button
              class="terminal-tab-close"
              onclick={(e) => { e.stopPropagation(); closeTab(i); }}
              aria-label="Close terminal"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>
          {/if}
        </div>
      {/each}
    </div>
    <button class="add-terminal-btn" onclick={addTab} title="New Terminal">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14M5 12h14"/>
      </svg>
    </button>
  </div>

  <div class="terminal-panels">
    {#each tabs as tab, i}
      <div
        class="terminal-panel"
        class:visible={activeTerminalIndex === i}
        bind:this={containerEls[i]}
      ></div>
    {/each}
  </div>
</div>

<style>
  .multi-terminal {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .terminal-tabs-bar {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-surface);
    flex-shrink: 0;
    height: 28px;
    padding: 0 4px;
    gap: 2px;
  }

  .terminal-tabs {
    display: flex;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    gap: 2px;
  }

  .terminal-tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    font-size: 12px;
    color: var(--color-text-muted);
    transition: background 0.1s ease, color 0.1s ease;
    flex-shrink: 0;
  }

  .terminal-tab:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .terminal-tab.active {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }

  .terminal-tab-label {
    font-family: var(--font-ui);
    font-size: 12px;
  }

  .terminal-tab-close {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;
    padding: 0;
    opacity: 0;
  }

  .terminal-tab:hover .terminal-tab-close {
    opacity: 1;
  }

  .terminal-tab-close:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .add-terminal-btn {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.1s ease, color 0.1s ease;
  }

  .add-terminal-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .terminal-panels {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .terminal-panel {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 6px 0 0 10px;
    visibility: hidden;
    pointer-events: none;
  }

  .terminal-panel.visible {
    visibility: visible;
    pointer-events: auto;
  }

  .terminal-panel :global(.xterm) {
    height: 100%;
    padding: 0;
  }

  .terminal-panel :global(.xterm-viewport) {
    overflow-y: auto !important;
  }

  .terminal-panel :global(.xterm-viewport::-webkit-scrollbar) {
    width: 8px;
  }

  .terminal-panel :global(.xterm-viewport::-webkit-scrollbar-track) {
    background: transparent;
  }

  .terminal-panel :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: var(--color-border);
    border-radius: 4px;
  }

  .terminal-panel :global(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
    background: var(--color-text-muted);
  }

  .terminal-panel :global(.xterm-screen) {
    padding: 0;
  }
</style>
