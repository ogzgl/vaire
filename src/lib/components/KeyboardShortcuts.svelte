<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { activeSidebarPanel, activeBottomPanel } from '$lib/stores/app';
  import { openTabs, activeTabIndex, closeTab, openDiff, workspacePath, gitRepos } from '$lib/stores/workspace';
  import { showSettings } from '$lib/stores/theme';

  function handleKeydown(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;

    // Cmd+P — Quick Open (file mode command palette)
    if (meta && e.key === 'p' && !e.shiftKey) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('vaire:open-palette', { detail: { mode: 'files' } }));
      return;
    }

    // Cmd+W — Close active tab
    if (meta && e.key === 'w' && !e.shiftKey) {
      e.preventDefault();
      const idx = $activeTabIndex;
      if (idx >= 0) closeTab(idx);
      return;
    }

    // Cmd+, — Settings (JetBrains: Cmd+,)
    if (meta && e.key === ',') {
      e.preventDefault();
      showSettings.update(v => !v);
      return;
    }

    // Cmd+Shift+F — Focus search panel (JetBrains: Cmd+Shift+F)
    if (meta && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      activeSidebarPanel.set('search');
      return;
    }

    // Cmd+1 — Project Files (JetBrains: Alt+1, but Cmd+1 is more Mac-native)
    if (meta && e.key === '1' && !e.shiftKey) {
      e.preventDefault();
      activeSidebarPanel.set('files');
      return;
    }

    // Cmd+2 — Search
    if (meta && e.key === '2' && !e.shiftKey) {
      e.preventDefault();
      activeSidebarPanel.set('search');
      return;
    }

    // Cmd+3 — Git
    if (meta && e.key === '3' && !e.shiftKey) {
      e.preventDefault();
      activeSidebarPanel.set('git');
      return;
    }

    // Cmd+4 — Structure
    if (meta && e.key === '4' && !e.shiftKey) {
      e.preventDefault();
      activeSidebarPanel.set('structure');
      return;
    }

    // Cmd+5 — Bookmarks
    if (meta && e.key === '5' && !e.shiftKey) {
      e.preventDefault();
      activeSidebarPanel.set('bookmarks');
      return;
    }

    // Cmd+6 — TODO
    if (meta && e.key === '6' && !e.shiftKey) {
      e.preventDefault();
      activeSidebarPanel.set('todo');
      return;
    }

    // Cmd+7 — Terminal
    if (meta && e.key === '7' && !e.shiftKey) {
      e.preventDefault();
      activeBottomPanel.update(v => v === 'terminal' ? null : 'terminal');
      return;
    }

    // Cmd+8 — Git Log
    if (meta && e.key === '8' && !e.shiftKey) {
      e.preventDefault();
      activeBottomPanel.update(v => v === 'git-log' ? null : 'git-log');
      return;
    }

    // Cmd+D — Show diff for current file
    if (meta && e.key.toLowerCase() === 'd' && !e.shiftKey) {
      e.preventDefault();
      const tab = $openTabs[$activeTabIndex];
      if (tab && !tab.isDiff) {
        const ws = $workspacePath || '';
        const repos = $gitRepos;
        // Find which repo this file belongs to
        const repo = repos.find(r => tab.path.startsWith(r));
        if (repo) {
          const relativePath = tab.path.replace(repo + '/', '');
          openDiff(repo, relativePath, tab.name, false);
        }
      }
      return;
    }

    // Cmd+K and Cmd+Shift+K are handled by CommitDialog and PushDialog components

    // Ctrl+Tab — Next tab (works on all keyboard layouts)
    if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      let tabs: any[] = [];
      openTabs.subscribe(v => tabs = v)();
      if (tabs.length > 0) {
        activeTabIndex.update(i => (i + 1) % tabs.length);
      }
      return;
    }

    // Ctrl+Shift+Tab — Previous tab
    if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      let tabs: any[] = [];
      openTabs.subscribe(v => tabs = v)();
      if (tabs.length > 0) {
        activeTabIndex.update(i => (i - 1 + tabs.length) % tabs.length);
      }
      return;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>
