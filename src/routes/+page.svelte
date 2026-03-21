<script lang="ts">
  import TitleBar from '$lib/components/TitleBar.svelte';
  import ActivityBar from '$lib/components/ActivityBar.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import EditorArea from '$lib/components/EditorArea.svelte';
  import BottomPanel from '$lib/components/BottomPanel.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
  import CommitDialog from '$lib/components/CommitDialog.svelte';
  import PushDialog from '$lib/components/PushDialog.svelte';
  import DiffDialog from '$lib/components/DiffDialog.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import { sidebarWidth } from '$lib/stores/app';
  import { activeTheme, fontSettings } from '$lib/stores/theme';

  let isResizing = $state(false);

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
  <SettingsPanel />
  <CommandPalette />
  <KeyboardShortcuts />
  <CommitDialog />
  <PushDialog />
  <DiffDialog />
  <Toasts />
</div>

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
</style>
