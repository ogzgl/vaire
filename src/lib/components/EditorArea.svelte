<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { openTabs, activeTabIndex, closeTab, workspacePath, openWorkspace, gitRepos, pinTab, unpinTab, loadPinnedPaths, type OpenTab, type PreviewType } from '$lib/stores/workspace';
  import { recentProjects, removeRecentProject } from '$lib/stores/recent';
  import MonacoEditor from './MonacoEditor.svelte';
  import MonacoDiffEditor from './MonacoDiffEditor.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import MarkdownPreview from './MarkdownPreview.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import QueryTab from './QueryTab.svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { getFileIconSvg } from '$lib/utils/fileIcons';
  import { invoke } from '@tauri-apps/api/core';

  // Scratch language chooser
  let showScratchLangPicker = $state(false);
  const SCRATCH_LANGUAGES = [
    'plaintext', 'typescript', 'javascript', 'python', 'rust', 'go',
    'java', 'kotlin', 'html', 'css', 'json', 'yaml', 'sql', 'shell',
    'markdown', 'ruby', 'cpp', 'c', 'csharp',
  ];

  // ─── Split pane model ───────────────────────────────────────────
  interface EditorPane {
    tabs: OpenTab[];
    activeTabIndex: number;
  }

  const MAX_PANES = 4;

  // Blame toggle (global, applies to all panes)
  let showBlame = $state(false);

  function getRepoPathForFile(filePath: string): string {
    // Find the git repo that owns this file
    const repos = $gitRepos;
    for (const repo of repos) {
      if (filePath.startsWith(repo)) return repo;
    }
    return '';
  }

  let panes = $state<EditorPane[]>([]);
  let activePaneIndex = $state(0);
  let paneWidths = $state<number[]>([]); // percentages summing to 100
  let isDraggingDivider = $state<number | null>(null); // index of divider being dragged

  // Tab context menu
  let tabContextMenu = $state<{
    x: number;
    y: number;
    paneIdx: number;
    tabIdx: number;
    tab: OpenTab;
  } | null>(null);

  function openTabContextMenu(e: MouseEvent, paneIdx: number, tabIdx: number, tab: OpenTab) {
    e.preventDefault();
    e.stopPropagation();
    tabContextMenu = { x: e.clientX, y: e.clientY, paneIdx, tabIdx, tab };
  }

  function closeTabContextMenu() {
    tabContextMenu = null;
  }

  function ctxPinTab() {
    if (!tabContextMenu) return;
    const { tab, paneIdx } = tabContextMenu;
    // Pin in global workspace store
    pinTab(tab.path);
    // Update all panes that have this tab
    for (const pane of panes) {
      const idx = pane.tabs.findIndex(t => t.path === tab.path);
      if (idx >= 0) pane.tabs[idx] = { ...pane.tabs[idx], pinned: true };
    }
    // Re-sort pane 0 tabs: pinned first
    sortPaneTabs(paneIdx);
    panes = [...panes];
    closeTabContextMenu();
  }

  function ctxUnpinTab() {
    if (!tabContextMenu) return;
    const { tab, paneIdx } = tabContextMenu;
    unpinTab(tab.path);
    for (const pane of panes) {
      const idx = pane.tabs.findIndex(t => t.path === tab.path);
      if (idx >= 0) pane.tabs[idx] = { ...pane.tabs[idx], pinned: false };
    }
    sortPaneTabs(paneIdx);
    panes = [...panes];
    closeTabContextMenu();
  }

  function sortPaneTabs(paneIdx: number) {
    const pane = panes[paneIdx];
    if (!pane) return;
    const active = pane.tabs[pane.activeTabIndex];
    const pinned = pane.tabs.filter(t => t.pinned);
    const unpinned = pane.tabs.filter(t => !t.pinned);
    pane.tabs = [...pinned, ...unpinned];
    // Restore active tab index after sort
    if (active) {
      const newIdx = pane.tabs.findIndex(t => t.path === active.path);
      pane.activeTabIndex = newIdx >= 0 ? newIdx : 0;
    }
  }

  function ctxCloseTab() {
    if (!tabContextMenu) return;
    const { paneIdx, tabIdx, tab } = tabContextMenu;
    if (tab.pinned) return; // Can't close pinned tabs
    closePaneTab(paneIdx, tabIdx);
    closeTabContextMenu();
  }

  function ctxCloseOthers() {
    if (!tabContextMenu) return;
    const { paneIdx, tab } = tabContextMenu;
    const pane = panes[paneIdx];
    // Keep pinned tabs and the selected tab
    pane.tabs = pane.tabs.filter(t => t.pinned || t.path === tab.path);
    pane.activeTabIndex = pane.tabs.findIndex(t => t.path === tab.path);
    if (pane.activeTabIndex < 0) pane.activeTabIndex = 0;
    panes = [...panes];
    if (paneIdx === 0) {
      openTabs.set(panes[0].tabs);
      activeTabIndex.set(panes[0].activeTabIndex);
    }
    closeTabContextMenu();
  }

  function ctxCloseAll() {
    if (!tabContextMenu) return;
    const { paneIdx } = tabContextMenu;
    const pane = panes[paneIdx];
    // Keep pinned tabs
    pane.tabs = pane.tabs.filter(t => t.pinned);
    pane.activeTabIndex = pane.tabs.length > 0 ? 0 : -1;
    panes = [...panes];
    if (paneIdx === 0) {
      openTabs.set(panes[0].tabs);
      activeTabIndex.set(panes[0].activeTabIndex);
    }
    closeTabContextMenu();
  }

  // Sync the existing workspace openTabs/activeTabIndex into pane 0 on first load
  $effect(() => {
    const tabs = $openTabs;
    const idx = $activeTabIndex;
    if (panes.length === 0) {
      // Apply pinned state from localStorage
      const pinnedPaths = new Set(loadPinnedPaths());
      const hydratedTabs = tabs.map(t => ({ ...t, pinned: pinnedPaths.has(t.path) }));
      // Sort: pinned first
      const sortedTabs = [
        ...hydratedTabs.filter(t => t.pinned),
        ...hydratedTabs.filter(t => !t.pinned),
      ];
      panes = [{ tabs: sortedTabs, activeTabIndex: Math.max(0, idx) }];
      paneWidths = [100];
    } else {
      // Keep pane 0 in sync with the global store (for backwards compat with other panels)
      panes[0] = { tabs: tabs.slice(), activeTabIndex: Math.max(0, idx) };
    }
  });

  function addPane(startTab?: OpenTab) {
    if (panes.length >= MAX_PANES) return;
    // New pane starts with specified tab, or a copy of the active tab in current pane
    const currentPane = panes[activePaneIndex];
    const startTabs: OpenTab[] = startTab
      ? [startTab]
      : currentPane.tabs.length > 0
        ? [currentPane.tabs[currentPane.activeTabIndex]]
        : [];
    const newPane: EditorPane = { tabs: startTabs, activeTabIndex: 0 };
    // Insert after active pane
    const newPanes = [...panes];
    newPanes.splice(activePaneIndex + 1, 0, newPane);
    panes = newPanes;
    activePaneIndex = activePaneIndex + 1;
    // Recalculate equal widths
    paneWidths = newPanes.map(() => 100 / newPanes.length);
  }

  function splitPaneWithTab(fromPaneIdx: number, tabIdx: number) {
    if (panes.length >= MAX_PANES) return;
    const tab = panes[fromPaneIdx].tabs[tabIdx];
    if (!tab) return;
    // Temporarily set activePaneIndex to fromPaneIdx so addPane inserts after it
    activePaneIndex = fromPaneIdx;
    addPane(tab);
    // activePaneIndex is now fromPaneIdx + 1 (the new pane)
  }

  function closePaneTab(paneIdx: number, tabIdx: number) {
    const pane = panes[paneIdx];
    // Don't close pinned tabs
    if (pane.tabs[tabIdx]?.pinned) return;
    const newTabs = pane.tabs.filter((_, i) => i !== tabIdx);
    let newActive = pane.activeTabIndex;
    if (newTabs.length === 0) {
      // Remove the whole pane if it has no tabs (only if more than 1 pane)
      if (panes.length > 1) {
        const newPanes = panes.filter((_, i) => i !== paneIdx);
        panes = newPanes;
        activePaneIndex = Math.min(activePaneIndex, newPanes.length - 1);
        paneWidths = newPanes.map(() => 100 / newPanes.length);
        return;
      }
      newActive = -1;
    } else {
      if (newActive >= newTabs.length) newActive = newTabs.length - 1;
    }
    panes[paneIdx] = { tabs: newTabs, activeTabIndex: newActive };
    // Sync pane 0 back to global store
    if (paneIdx === 0) {
      openTabs.set(newTabs);
      activeTabIndex.set(newActive);
    }
  }

  function setActivePaneTab(paneIdx: number, tabIdx: number) {
    panes[paneIdx] = { ...panes[paneIdx], activeTabIndex: tabIdx };
    activePaneIndex = paneIdx;
    // Sync pane 0 to global store
    if (paneIdx === 0) {
      activeTabIndex.set(tabIdx);
    }
  }

  // Divider drag handling
  let dragStartX = 0;
  let dragStartWidths: number[] = [];

  function startDividerDrag(e: MouseEvent, dividerIdx: number) {
    e.preventDefault();
    isDraggingDivider = dividerIdx;
    dragStartX = e.clientX;
    dragStartWidths = [...paneWidths];

    function onMove(ev: MouseEvent) {
      if (isDraggingDivider === null) return;
      const dx = ev.clientX - dragStartX;
      const totalWidth = (document.querySelector('.editor-panes') as HTMLElement)?.offsetWidth || window.innerWidth;
      const dPct = (dx / totalWidth) * 100;
      const leftIdx = dividerIdx;
      const rightIdx = dividerIdx + 1;
      const minPct = 15;
      let newLeft = dragStartWidths[leftIdx] + dPct;
      let newRight = dragStartWidths[rightIdx] - dPct;
      if (newLeft < minPct) { newRight += newLeft - minPct; newLeft = minPct; }
      if (newRight < minPct) { newLeft += newRight - minPct; newRight = minPct; }
      const updated = [...paneWidths];
      updated[leftIdx] = newLeft;
      updated[rightIdx] = newRight;
      paneWidths = updated;
    }

    function onUp() {
      isDraggingDivider = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ─── Tab drag-to-split (custom mouse events) ──────────────────
  let tabDrag = $state<{
    active: boolean;
    paneIdx: number;
    tabIdx: number;
    tab: OpenTab;
    mouseX: number;
    mouseY: number;
    startX: number;
    startY: number;
    dropZone: 'left' | 'right' | 'top' | 'bottom' | 'center' | null;
    dropPane: number;
  } | null>(null);

  const DRAG_THRESHOLD = 8;

  function onTabMouseDown(e: MouseEvent, paneIdx: number, tabIdx: number, tab: OpenTab) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.tab-close')) return;

    e.preventDefault(); // prevent text selection during drag

    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;

    function onMouseMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (!started && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
        started = true;
        tabDrag = {
          active: true,
          paneIdx, tabIdx, tab,
          mouseX: ev.clientX, mouseY: ev.clientY,
          startX, startY,
          dropZone: null, dropPane: -1,
        };
      }

      if (started && tabDrag) {
        tabDrag.mouseX = ev.clientX;
        tabDrag.mouseY = ev.clientY;

        // Detect drop target
        const paneEls = document.querySelectorAll('.editor-pane');
        let foundPane = -1;
        let zone: 'left' | 'right' | 'top' | 'bottom' | 'center' = 'center';

        paneEls.forEach((el, idx) => {
          const rect = el.getBoundingClientRect();
          if (ev.clientX >= rect.left && ev.clientX <= rect.right &&
              ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
            foundPane = idx;

            const relX = (ev.clientX - rect.left) / rect.width;

            // Simple: left/right edges for split, center for merge
            if (relX > 0.85) zone = 'right';
            else if (relX < 0.15) zone = 'left';
            else zone = 'center';
          }
        });

        tabDrag.dropPane = foundPane;
        tabDrag.dropZone = foundPane >= 0 ? zone : null;
        tabDrag = tabDrag; // trigger reactivity
      }
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      if (started && tabDrag && tabDrag.dropPane >= 0) {
        const { paneIdx: fromPane, tabIdx: fromTab, tab: dragTab, dropZone: dz, dropPane } = tabDrag;

        if ((dz === 'right' || dz === 'left' || dz === 'top' || dz === 'bottom') && panes.length < MAX_PANES) {
          // Split: create new pane
          const newPane: EditorPane = { tabs: [dragTab], activeTabIndex: 0 };
          const insertIdx = (dz === 'right' || dz === 'bottom') ? dropPane + 1 : dropPane;

          const newPanes = [...panes];
          newPanes.splice(insertIdx, 0, newPane);

          // Remove tab from source (adjust index for insertion)
          const adjustedFrom = fromPane >= insertIdx ? fromPane + 1 : fromPane;
          const srcPane = newPanes[adjustedFrom];
          srcPane.tabs = srcPane.tabs.filter((_, i) => i !== fromTab);
          if (srcPane.activeTabIndex >= srcPane.tabs.length) {
            srcPane.activeTabIndex = Math.max(0, srcPane.tabs.length - 1);
          }

          // Remove empty panes
          const filtered = newPanes.filter(p => p.tabs.length > 0);
          panes = filtered.length > 0 ? filtered : [{ tabs: [], activeTabIndex: -1 }];
          paneWidths = panes.map(() => 100 / panes.length);
          activePaneIndex = Math.min(insertIdx, panes.length - 1);

          if (panes[0]) {
            openTabs.set(panes[0].tabs);
            activeTabIndex.set(panes[0].activeTabIndex);
          }
        } else if (dz === 'center' && fromPane !== dropPane) {
          // Move tab to target pane (merge)
          const targetPane = panes[dropPane];
          if (!targetPane.tabs.some(t => t.path === dragTab.path)) {
            targetPane.tabs.push(dragTab);
          }
          targetPane.activeTabIndex = targetPane.tabs.findIndex(t => t.path === dragTab.path);

          // Remove from source pane
          const srcPane = panes[fromPane];
          srcPane.tabs = srcPane.tabs.filter((_, i) => i !== fromTab);
          if (srcPane.activeTabIndex >= srcPane.tabs.length) {
            srcPane.activeTabIndex = Math.max(0, srcPane.tabs.length - 1);
          }

          // Remove empty panes
          const filtered = panes.filter(p => p.tabs.length > 0);
          panes = filtered.length > 0 ? filtered : [{ tabs: [], activeTabIndex: -1 }];
          paneWidths = panes.map(() => 100 / panes.length);
          activePaneIndex = Math.min(dropPane, panes.length - 1);

          // Sync pane 0 to global store
          if (panes[0]) {
            openTabs.set(panes[0].tabs);
            activeTabIndex.set(panes[0].activeTabIndex);
          }
        }
      }

      tabDrag = null;
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  async function createScratchFile(language: string) {
    showScratchLangPicker = false;
    try {
      const scratchPath = await invoke<string>('create_scratch', { language });
      const name = scratchPath.split('/').pop() || 'scratch';
      const newTab: OpenTab = {
        path: scratchPath,
        name,
        lang: language,
        content: '',
        isScratch: true,
      };
      const pane = panes[activePaneIndex] || panes[0];
      if (pane) {
        pane.tabs.push(newTab);
        pane.activeTabIndex = pane.tabs.length - 1;
        if (activePaneIndex === 0 || panes.length === 1) {
          openTabs.set(panes[0].tabs);
          activeTabIndex.set(panes[0].activeTabIndex);
        }
        panes = [...panes];
      }
    } catch (e) {
      console.error('Failed to create scratch file:', e);
    }
  }

  // ─── Keyboard shortcut: Cmd+\ to split, Cmd+W to close ──────────────────────────
  function handleGlobalKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
      e.preventDefault();
      addPane();
    }
    // Cmd+W: close current tab if not pinned
    if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
      const pane = panes[activePaneIndex];
      if (pane) {
        const tab = pane.tabs[pane.activeTabIndex];
        if (tab && !tab.pinned) {
          e.preventDefault();
          closePaneTab(activePaneIndex, pane.activeTabIndex);
        }
      }
    }
    // Cmd+Shift+N: new scratch file
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'n') {
      e.preventDefault();
      showScratchLangPicker = true;
    }
  }

  function handleBlameToggle(e: Event) {
    showBlame = (e as CustomEvent<{ enabled: boolean }>).detail.enabled;
  }

  async function handleOpenFilePath(e: Event) {
    const filePath = (e as CustomEvent<{ path: string }>).detail.path;
    if (!filePath) return;

    // Check if already open in any pane
    for (let pi = 0; pi < panes.length; pi++) {
      const pane = panes[pi];
      const ti = pane.tabs.findIndex(t => t.path === filePath);
      if (ti >= 0) {
        setActivePaneTab(pi, ti);
        return;
      }
    }

    // Load the file content
    const name = filePath.split('/').pop() || filePath;
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      kt: 'kotlin', ts: 'typescript', tsx: 'typescript', js: 'javascript',
      jsx: 'javascript', py: 'python', rs: 'rust', go: 'go', rb: 'ruby',
      java: 'java', swift: 'swift', cs: 'csharp', json: 'json', yaml: 'yaml',
      yml: 'yaml', toml: 'toml', md: 'markdown', html: 'html', css: 'css',
      svelte: 'svelte', sh: 'shell', sql: 'sql',
    };
    const lang = langMap[ext] || undefined;

    // Detect preview type
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico'];
    let previewType: PreviewType = null;
    if (imageExts.includes(ext)) previewType = 'image';
    else if (ext === 'svg') previewType = 'svg';
    else if (ext === 'md' || ext === 'markdown') previewType = 'markdown';

    // For images, don't read content
    if (previewType === 'image' || previewType === 'svg') {
      const newTab: OpenTab = { path: filePath, name, lang, content: '', previewType };
      const targetPane = panes[activePaneIndex] || panes[0];
      if (targetPane) {
        targetPane.tabs.push(newTab);
        targetPane.activeTabIndex = targetPane.tabs.length - 1;
        if (activePaneIndex === 0 || panes.length === 1) {
          openTabs.set(panes[0].tabs);
          activeTabIndex.set(panes[0].activeTabIndex);
        }
        panes = [...panes];
      }
      return;
    }

    try {
      const content = await invoke<string>('read_file_content', { path: filePath });
      const newTab: OpenTab = { path: filePath, name, lang, content, previewType };
      const targetPane = panes[activePaneIndex] || panes[0];
      if (targetPane) {
        targetPane.tabs.push(newTab);
        targetPane.activeTabIndex = targetPane.tabs.length - 1;
        if (activePaneIndex === 0 || panes.length === 1) {
          openTabs.set(panes[0].tabs);
          activeTabIndex.set(panes[0].activeTabIndex);
        }
        panes = [...panes];
      }
    } catch (e) {
      console.error('Failed to open file:', filePath, e);
    }
  }

  function handleWindowClick() {
    if (tabContextMenu) closeTabContextMenu();
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    handleGlobalKey(e);
    if (e.key === 'Escape' && tabContextMenu) closeTabContextMenu();
  }

  onMount(() => {
    window.addEventListener('keydown', handleWindowKeydown);
    window.addEventListener('vaire:toggle-blame', handleBlameToggle);
    window.addEventListener('vaire:open-file', handleOpenFilePath);
    window.addEventListener('click', handleWindowClick);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleWindowKeydown);
    window.removeEventListener('vaire:toggle-blame', handleBlameToggle);
    window.removeEventListener('vaire:open-file', handleOpenFilePath);
    window.removeEventListener('click', handleWindowClick);
  });

  // ─── Icon helpers ────────────────────────────────────────────────
  function getTabIcon(tab: OpenTab): string {
    if (tab.isDiff) {
      return `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style="color: var(--color-accent)">
        <path d="M6 7h2.79l-1.147 1.146a.5.5 0 0 0 .707.708l2-1.999.007-.007.006-.006a.5.5 0 0 0-.006-.706l-2-2a.5.5 0 0 0-.707.707L8.79 6H6a1 1 0 0 1-1-1V3.5a.5.5 0 0 0-1 0V5a2 2 0 0 0 2 2"/>
      </svg>`;
    }
    if (tab.isScratch) {
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-warning, #f59e0b)">
        <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>
      </svg>`;
    }
    if (tab.previewType === 'settings') {
      return `<img src="/icons/settings.svg" width="13" height="13" alt="" style="display:block" />`;
    }
    return getFileIconSvg(tab.lang, 'file');
  }

  function getBreadcrumbs(tab: OpenTab): string[] {
    const wsPath = $workspacePath;
    if (!wsPath) return [tab.name];
    const relative = tab.path.replace(wsPath + '/', '');
    return relative.split('/');
  }

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      await openWorkspace(selected);
    }
  }

  function formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - ts) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  }

  // Welcome screen context menu
  let welcomeContextMenu = $state<{ x: number; y: number; project: { name: string; path: string; openedAt: number } } | null>(null);

  function handleWelcomeContextMenu(e: MouseEvent, project: { name: string; path: string; openedAt: number }) {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 200;
    const menuHeight = 120;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);
    welcomeContextMenu = { x, y, project };
  }

  function closeWelcomeContextMenu() {
    welcomeContextMenu = null;
  }
</script>

<div class="editor-area" class:dragging={isDraggingDivider !== null}>
  {#if $openTabs.length === 0 && panes.every(p => p.tabs.length === 0)}
    <!-- Welcome state -->
    <div class="welcome">
      <img src="/vaire-icon.png" width="64" height="64" alt="Vaire" class="welcome-logo" />
      <h1 class="welcome-title">Vaire</h1>
      <p class="welcome-subtitle">A fast, beautiful code editor</p>

      <div class="welcome-actions">
        <button class="welcome-open-btn" onclick={handleOpenFolder}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"/>
            <path d="M12 10v6M9 13h6"/>
          </svg>
          Open Folder
        </button>
      </div>

      {#if $recentProjects.length > 0}
        <div class="recent-section">
          <h2 class="recent-title">Recent Projects</h2>
          <div class="recent-list">
            {#each $recentProjects as project}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="recent-item" onclick={() => openWorkspace(project.path)} oncontextmenu={(e) => handleWelcomeContextMenu(e, project)} role="button" tabindex="0">
                <div class="recent-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"/>
                  </svg>
                </div>
                <div class="recent-info">
                  <span class="recent-name">{project.name}</span>
                  <span class="recent-path">{project.path}</span>
                </div>
                <span class="recent-date">{formatDate(project.openedAt)}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="welcome-shortcuts">
        <div class="shortcut-row">
          <kbd>Double Shift</kbd>
          <span>Search Everywhere</span>
        </div>
        <div class="shortcut-row">
          <kbd>Cmd+Shift+F</kbd>
          <span>Find in Files</span>
        </div>
        <div class="shortcut-row">
          <kbd>Cmd+P</kbd>
          <span>Quick Open File</span>
        </div>
        <div class="shortcut-row">
          <kbd>Cmd+\</kbd>
          <span>Split Editor</span>
        </div>
      </div>

      {#if welcomeContextMenu}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="welcome-ctx-backdrop" onclick={closeWelcomeContextMenu}>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="welcome-ctx-menu" style="left: {welcomeContextMenu.x}px; top: {welcomeContextMenu.y}px;" onclick={(e) => e.stopPropagation()}>
            <button class="welcome-ctx-item" onclick={() => { invoke('open_new_window', { workspacePath: welcomeContextMenu!.project.path }); closeWelcomeContextMenu(); }}>
              Open in New Window
            </button>
            <button class="welcome-ctx-item" onclick={() => { removeRecentProject(welcomeContextMenu!.project.path); closeWelcomeContextMenu(); }}>
              Remove from Recent
            </button>
            <button class="welcome-ctx-item" onclick={() => { navigator.clipboard.writeText(welcomeContextMenu!.project.path); closeWelcomeContextMenu(); }}>
              Copy Path
            </button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Split panes -->
    <div class="editor-panes">
      {#each panes as pane, paneIdx}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="editor-pane"
          class:pane-active={activePaneIndex === paneIdx}
          style="width: {paneWidths[paneIdx] ?? 100}%"
          onclick={() => { activePaneIndex = paneIdx; }}
        >
          <!-- Drop zone indicator -->
          {#if tabDrag?.active && tabDrag.dropPane === paneIdx && tabDrag.dropZone}
            <div class="drop-indicator {tabDrag.dropZone}">
              <div class="drop-indicator-label">
                {#if tabDrag.dropZone === 'center'}
                  Move Here
                {:else if tabDrag.dropZone === 'right'}
                  Split Right
                {:else if tabDrag.dropZone === 'left'}
                  Split Left
                {:else if tabDrag.dropZone === 'top'}
                  Split Top
                {:else}
                  Split Bottom
                {/if}
              </div>
            </div>
          {/if}
          <!-- Tab bar for this pane -->
          <div class="tab-bar">
            <div class="tabs-scroll">
              {#each pane.tabs as tab, i}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="tab"
                  class:active={pane.activeTabIndex === i}
                  class:pinned={tab.pinned}
                  onclick={(e) => { e.stopPropagation(); setActivePaneTab(paneIdx, i); }}
                  onmousedown={(e) => onTabMouseDown(e, paneIdx, i, tab)}
                  onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); closePaneTab(paneIdx, i); } }}
                  oncontextmenu={(e) => openTabContextMenu(e, paneIdx, i, tab)}
                  role="tab"
                  tabindex="0"
                >
                  <span class="tab-icon">{@html getTabIcon(tab)}</span>
                  <span class="tab-name">{tab.name}</span>
                  {#if tab.pinned}
                    <!-- Pin icon: click to unpin -->
                    <button
                      class="tab-pin-btn"
                      onclick={(e) => { e.stopPropagation(); unpinTab(tab.path); for (const p of panes) { const idx = p.tabs.findIndex(t => t.path === tab.path); if (idx >= 0) p.tabs[idx] = { ...p.tabs[idx], pinned: false }; } sortPaneTabs(paneIdx); panes = [...panes]; }}
                      title="Unpin tab"
                      aria-label="Unpin tab"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 3a1 1 0 0 0-1 1v4.586l-1.293-1.293a1 1 0 0 0-1.414 1.414L13.586 10H9a1 1 0 0 0-.707 1.707L12 15.414V20a1 1 0 0 0 1.707.707l4-4A1 1 0 0 0 18 16v-4.586l1.293 1.293a1 1 0 0 0 1.414-1.414L16.414 8H20a1 1 0 0 0 .707-1.707L17 2.586A1 1 0 0 0 16 3z"/>
                      </svg>
                    </button>
                  {:else}
                    <button class="tab-close" onclick={(e) => { e.stopPropagation(); closePaneTab(paneIdx, i); }} aria-label="Close tab">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                      </svg>
                    </button>
                  {/if}
                </div>
              {/each}
              <!-- Split button -->
              {#if panes.length < MAX_PANES}
                <button
                  class="split-btn"
                  onclick={(e) => { e.stopPropagation(); activePaneIndex = paneIdx; addPane(); }}
                  title="Split Editor (Cmd+\)"
                  aria-label="Split editor"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M12 3v18"/>
                  </svg>
                </button>
              {/if}
            </div>
          </div>

          <!-- Breadcrumbs for active tab in this pane -->
          {#if pane.tabs[pane.activeTabIndex]}
            {@const activeTab = pane.tabs[pane.activeTabIndex]}
            <div class="breadcrumbs">
              {#each getBreadcrumbs(activeTab) as segment, i}
                {#if i > 0}
                  <svg class="breadcrumb-separator" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6 4l4 4-4 4"/>
                  </svg>
                {/if}
                <span class="breadcrumb-segment" class:last={i === getBreadcrumbs(activeTab).length - 1}>
                  {segment}
                </span>
              {/each}
            </div>

            <!-- Editor, Diff View, or Preview -->
            <div class="editor-wrapper">
              {#if activeTab.isDiff}
                {#key activeTab.path + paneIdx}
                  <MonacoDiffEditor
                    repoPath={activeTab.diffRepoPath || ''}
                    filePath={activeTab.diffFilePath || ''}
                    staged={activeTab.diffStaged || false}
                  />
                {/key}
              {:else if activeTab.previewType === 'image' || activeTab.previewType === 'svg'}
                {#key activeTab.path + paneIdx}
                  <ImageViewer path={activeTab.path} />
                {/key}
              {:else if activeTab.previewType === 'markdown'}
                {#key activeTab.path + paneIdx}
                  <MarkdownPreview
                    content={activeTab.content || ''}
                    path={activeTab.path}
                    repoPath={getRepoPathForFile(activeTab.path)}
                  />
                {/key}
              {:else if activeTab.previewType === 'settings'}
                <SettingsPanel />
              {:else if activeTab.previewType === 'query'}
                {#key activeTab.path + paneIdx}
                  <QueryTab
                    connectionId={activeTab.connectionId || ''}
                    initialQuery={activeTab.content || ''}
                  />
                {/key}
              {:else}
                {#key activeTab.path + paneIdx}
                  <MonacoEditor
                    content={activeTab.content || ''}
                    language={activeTab.lang || 'plaintext'}
                    path={activeTab.path}
                    repoPath={getRepoPathForFile(activeTab.path)}
                    showBlame={showBlame}
                  />
                {/key}
              {/if}
            </div>
          {:else}
            <div class="pane-empty">
              <span class="pane-empty-text">No file open</span>
            </div>
          {/if}
        </div>

        <!-- Resizable divider between panes -->
        {#if paneIdx < panes.length - 1}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="pane-divider"
            class:divider-dragging={isDraggingDivider === paneIdx}
            onmousedown={(e) => startDividerDrag(e, paneIdx)}
          ></div>
        {/if}
      {/each}

    </div>
  {/if}
</div>

<!-- Scratch language picker -->
{#if showScratchLangPicker}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog-backdrop" onclick={() => { showScratchLangPicker = false; }} onkeydown={(e) => e.key === 'Escape' && (showScratchLangPicker = false)} role="dialog" aria-modal="true">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="scratch-picker" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="scratch-picker-header">
        <span>New Scratch File</span>
        <button onclick={() => { showScratchLangPicker = false; }} aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>
      <div class="scratch-lang-grid">
        {#each SCRATCH_LANGUAGES as lang}
          <button class="scratch-lang-btn" onclick={() => createScratchFile(lang)}>
            {@html getFileIconSvg(lang, 'file')}
            <span>{lang}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- Tab context menu -->
{#if tabContextMenu}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="tab-context-menu"
    style="left: {tabContextMenu.x}px; top: {tabContextMenu.y}px"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="menu"
  >
    {#if tabContextMenu.tab.pinned}
      <button class="ctx-item" role="menuitem" onclick={ctxUnpinTab}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 3a1 1 0 0 0-1 1v4.586l-1.293-1.293a1 1 0 0 0-1.414 1.414L13.586 10H9a1 1 0 0 0-.707 1.707L12 15.414V20a1 1 0 0 0 1.707.707l4-4A1 1 0 0 0 18 16v-4.586l1.293 1.293a1 1 0 0 0 1.414-1.414L16.414 8H20a1 1 0 0 0 .707-1.707L17 2.586A1 1 0 0 0 16 3z"/>
        </svg>
        Unpin Tab
      </button>
    {:else}
      <button class="ctx-item" role="menuitem" onclick={ctxPinTab}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 3a1 1 0 0 0-1 1v4.586l-1.293-1.293a1 1 0 0 0-1.414 1.414L13.586 10H9a1 1 0 0 0-.707 1.707L12 15.414V20a1 1 0 0 0 1.707.707l4-4A1 1 0 0 0 18 16v-4.586l1.293 1.293a1 1 0 0 0 1.414-1.414L16.414 8H20a1 1 0 0 0 .707-1.707L17 2.586A1 1 0 0 0 16 3z"/>
        </svg>
        Pin Tab
      </button>
    {/if}
    <div class="ctx-separator"></div>
    <button class="ctx-item" role="menuitem" onclick={ctxCloseTab} disabled={tabContextMenu.tab.pinned}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
      </svg>
      Close
    </button>
    <button class="ctx-item" role="menuitem" onclick={ctxCloseOthers}>Close Others</button>
    <button class="ctx-item" role="menuitem" onclick={ctxCloseAll}>Close All</button>
    {#if !tabContextMenu.tab.isDiff && !tabContextMenu.tab.isScratch}
      <div class="ctx-separator"></div>
      <button
        class="ctx-item"
        role="menuitem"
        onclick={() => {
          if (tabContextMenu) {
            window.dispatchEvent(new CustomEvent('vaire:show-local-history', { detail: { path: tabContextMenu.tab.path } }));
          }
          closeTabContextMenu();
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        Show Local History
      </button>
    {/if}
  </div>
{/if}

<!-- Floating tab ghost while dragging -->
{#if tabDrag?.active}
  <div
    class="tab-drag-ghost"
    style="left: {tabDrag.mouseX + 12}px; top: {tabDrag.mouseY - 14}px"
  >
    <span class="ghost-icon">{@html getTabIcon(tabDrag.tab)}</span>
    <span class="ghost-name">{tabDrag.tab.name}</span>
  </div>
  <div class="drag-overlay-blocker"></div>
{/if}

<style>
  .editor-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--color-bg-base);
    overflow: hidden;
    position: relative;
  }

  .editor-area.dragging {
    cursor: col-resize;
    user-select: none;
  }

  /* ── Welcome ── */
  .welcome {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px 32px;
    overflow-y: auto;
    gap: 0;
  }

  .welcome-logo {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    margin-bottom: 12px;
  }

  .welcome-title {
    font-size: 24px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .welcome-subtitle {
    font-size: 13px;
    color: var(--color-text-muted);
    margin: 4px 0 20px;
  }

  .welcome-actions {
    margin-bottom: 32px;
  }

  .welcome-open-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 20px;
    background: var(--color-accent);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .welcome-open-btn:hover {
    background: var(--color-accent-hover);
  }

  /* Recent projects */
  .recent-section {
    width: 100%;
    max-width: 480px;
    margin-bottom: 32px;
  }

  .recent-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
    margin: 0 0 8px;
  }

  .recent-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .recent-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.1s ease;
    text-align: left;
  }

  .recent-item:hover {
    background: var(--color-bg-hover);
  }

  .recent-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .recent-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .recent-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-path {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-date {
    font-size: 11px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  /* Shortcuts */
  .welcome-shortcuts {
    display: flex;
    flex-direction: column;
    gap: 8px;
    opacity: 0.6;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
  }

  .shortcut-row span {
    color: var(--color-text-secondary);
  }

  kbd {
    display: inline-block;
    padding: 2px 8px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
    color: var(--color-text-secondary);
    min-width: 120px;
    text-align: center;
  }

  /* ── Split panes ── */
  .editor-panes {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  .editor-pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    transition: outline 0.1s;
    outline: 2px solid transparent;
    outline-offset: -2px;
    position: relative;
  }

  .editor-pane.pane-active {
    outline-color: var(--color-accent);
  }

  .editor-panes {
    position: relative;
  }

  /* Floating tab ghost */
  .tab-drag-ghost {
    position: fixed;
    z-index: 999;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-accent);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-size: 12px;
    color: var(--color-text-primary);
    pointer-events: none;
    white-space: nowrap;
  }

  .ghost-icon {
    display: flex;
    align-items: center;
  }

  .ghost-name {
    font-weight: 500;
  }

  /* Overlay to prevent Monaco from stealing mouse events during drag */
  .drag-overlay-blocker {
    position: fixed;
    inset: 0;
    z-index: 100;
    cursor: grabbing;
  }

  .drop-indicator {
    position: absolute;
    background: var(--color-accent);
    opacity: 0.15;
    border: 2px solid var(--color-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 90;
  }

  .drop-indicator.left {
    top: 0; bottom: 0; left: 0; width: 50%;
  }

  .drop-indicator.right {
    top: 0; bottom: 0; right: 0; width: 50%;
  }

  .drop-indicator.top {
    top: 0; left: 0; right: 0; height: 50%;
  }

  .drop-indicator.bottom {
    bottom: 0; left: 0; right: 0; height: 50%;
  }

  .drop-indicator.center {
    top: 0; bottom: 0; left: 0; right: 0; width: 100%;
  }

  .drop-indicator-label {
    background: var(--color-accent);
    color: white;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    pointer-events: none;
    opacity: 1;
  }

  .pane-divider {
    width: 4px;
    flex-shrink: 0;
    background: var(--color-border);
    cursor: col-resize;
    transition: background 0.15s;
    position: relative;
    z-index: 5;
  }

  .pane-divider:hover,
  .pane-divider.divider-dragging {
    background: var(--color-accent);
  }

  /* ── Tabs ── */
  .tab-bar {
    height: 36px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: end;
    overflow-x: auto;
    flex-shrink: 0;
  }

  .tabs-scroll {
    display: flex;
    height: 100%;
    align-items: end;
    flex: 1;
    min-width: 0;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 12px;
    cursor: default;
    border-bottom: 2px solid transparent;
    transition: all 0.15s ease;
    white-space: nowrap;
    position: relative;
    flex-shrink: 0;
  }

  .tab:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .tab.active {
    color: var(--color-text-primary);
    background: var(--color-bg-base);
    border-bottom-color: var(--color-accent);
  }

  .tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .tab-name {
    font-weight: 500;
  }

  .tab-split {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: all 0.1s ease;
    flex-shrink: 0;
  }

  .tab:hover .tab-split {
    opacity: 1;
  }

  .tab-split:hover {
    background: var(--color-bg-active);
    color: var(--color-accent);
  }

  .tab-close {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: all 0.1s ease;
  }

  .tab:hover .tab-close {
    opacity: 1;
  }

  .tab-close:hover {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }

  /* Pinned tab */
  .tab.pinned {
    border-bottom-color: var(--color-warning, #f59e0b);
  }

  .tab-pin-btn {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: none;
    background: transparent;
    color: var(--color-warning, #f59e0b);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.7;
    transition: all 0.1s ease;
    padding: 0;
    flex-shrink: 0;
  }

  .tab:hover .tab-pin-btn {
    opacity: 1;
  }

  .tab-pin-btn:hover {
    background: var(--color-bg-active);
    opacity: 1;
  }

  /* Tab context menu */
  .tab-context-menu {
    position: fixed;
    z-index: 2000;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 4px;
    min-width: 160px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .ctx-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    border-radius: 4px;
    text-align: left;
    transition: background 0.1s;
  }

  .ctx-item:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .ctx-item:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .ctx-separator {
    height: 1px;
    background: var(--color-border-subtle);
    margin: 3px 6px;
  }

  /* Scratch picker dialog */
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .scratch-picker {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    width: 380px;
    max-width: 96vw;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .scratch-picker-header {
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .scratch-picker-header button {
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
  }

  .scratch-picker-header button:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .scratch-lang-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    padding: 8px;
  }

  .scratch-lang-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 6px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.1s;
  }

  .scratch-lang-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .split-btn {
    margin-left: auto;
    width: 30px;
    height: 30px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.1s, color 0.1s;
    flex-shrink: 0;
  }

  .split-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  /* ── Breadcrumbs ── */
  .breadcrumbs {
    height: 26px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--color-bg-base);
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  .breadcrumb-segment {
    color: var(--color-text-muted);
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 3px;
  }

  .breadcrumb-segment.last {
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .breadcrumb-separator {
    color: var(--color-text-muted);
    opacity: 0.5;
  }

  /* ── Editor wrapper ── */
  .editor-wrapper {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .pane-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pane-empty-text {
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .welcome-ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
  }

  .welcome-ctx-menu {
    position: fixed;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 4px 0;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    min-width: 180px;
    z-index: 101;
  }

  .welcome-ctx-item {
    display: block;
    width: 100%;
    padding: 6px 14px;
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }

  .welcome-ctx-item:hover {
    background: var(--color-accent);
    color: #fff;
  }
</style>
