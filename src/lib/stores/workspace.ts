import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { addRecentProject } from './recent';
import { loadWorkspaceSettings } from './workspaceSettings';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder' | 'repo';
  children?: FileNode[];
  lang?: string;
  is_git_repo: boolean;
  expanded?: boolean;
}

export type PreviewType = 'image' | 'markdown' | 'svg' | 'settings' | null;

export interface OpenTab {
  path: string;
  name: string;
  lang?: string;
  content?: string;
  isDiff?: boolean;
  diffRepoPath?: string;
  diffFilePath?: string;
  diffStaged?: boolean;
  pinned?: boolean;
  isScratch?: boolean;
  previewType?: PreviewType;
}

export const workspacePath = writable<string | null>(null);
export const workspaceName = writable<string>('');
export const fileTree = writable<FileNode[]>([]);
export const openTabs = writable<OpenTab[]>([]);
export const activeTabIndex = writable<number>(-1);
export const gitRepos = writable<string[]>([]);
// Map of file path -> git status for coloring the file tree
export const gitFileStatuses = writable<Map<string, string>>(new Map());

export const activeTab = derived(
  [openTabs, activeTabIndex],
  ([$tabs, $idx]) => ($idx >= 0 && $idx < $tabs.length ? $tabs[$idx] : null)
);

export const activeFilePath = derived(
  [openTabs, activeTabIndex],
  ([$tabs, $idx]) => ($idx >= 0 && $idx < $tabs.length ? $tabs[$idx].path : null)
);

export async function openWorkspace(path: string) {
  workspacePath.set(path);
  workspaceName.set(path.split('/').pop() || path);
  addRecentProject(path);

  try {
    const tree: FileNode[] = await invoke('read_directory', { path });
    // Set expanded = false on all folders/repos
    function initExpanded(nodes: FileNode[]): FileNode[] {
      return nodes.map(n => ({
        ...n,
        expanded: false,
        children: n.children ? initExpanded(n.children) : undefined,
      }));
    }
    fileTree.set(initExpanded(tree));

    const repos: string[] = await invoke('get_git_repos', { path });
    gitRepos.set(repos);

    // Load per-project settings from .vaire/settings.json
    await loadWorkspaceSettings(path);
  } catch (e) {
    console.error('Failed to open workspace:', e);
  }
}

function detectPreviewType(filename: string): PreviewType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico'];
  if (imageExts.includes(ext)) return 'image';
  if (ext === 'svg') return 'svg';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  return null;
}

export async function openFile(node: FileNode) {
  if (node.type !== 'file') return;

  // Check if already open
  let tabs: OpenTab[] = [];
  openTabs.subscribe(v => tabs = v)();

  const existingIdx = tabs.findIndex(t => t.path === node.path);
  if (existingIdx >= 0) {
    activeTabIndex.set(existingIdx);
    return;
  }

  const previewType = detectPreviewType(node.name);

  // For image files, don't read content
  if (previewType === 'image' || previewType === 'svg') {
    const newTab: OpenTab = {
      path: node.path,
      name: node.name,
      lang: node.lang || undefined,
      content: '',
      previewType,
    };
    openTabs.update(t => [...t, newTab]);
    activeTabIndex.set(tabs.length);
    return;
  }

  try {
    const content: string = await invoke('read_file_content', { path: node.path });
    const newTab: OpenTab = {
      path: node.path,
      name: node.name,
      lang: node.lang || undefined,
      content,
      previewType,
    };
    openTabs.update(t => [...t, newTab]);
    activeTabIndex.set(tabs.length);
  } catch (e) {
    console.error('Failed to read file:', e);
  }
}

export function closeTab(index: number) {
  openTabs.update(tabs => {
    const newTabs = tabs.filter((_, i) => i !== index);
    return newTabs;
  });
  activeTabIndex.update(idx => {
    let tabs: OpenTab[] = [];
    openTabs.subscribe(v => tabs = v)();
    if (tabs.length === 0) return -1;
    if (idx >= tabs.length) return tabs.length - 1;
    return idx;
  });
}

export function openSettingsTab() {
  const settingsPath = 'vaire://settings';
  let tabs: OpenTab[] = [];
  openTabs.subscribe(v => tabs = v)();

  const existingIdx = tabs.findIndex(t => t.path === settingsPath);
  if (existingIdx >= 0) {
    activeTabIndex.set(existingIdx);
    return;
  }

  const newTab: OpenTab = {
    path: settingsPath,
    name: 'Settings',
    previewType: 'settings',
  };
  openTabs.update(t => [...t, newTab]);
  activeTabIndex.set(tabs.length);
}

export function openDiff(repoPath: string, filePath: string, fileName: string, staged: boolean) {
  const diffKey = `diff:${filePath}`;

  let tabs: OpenTab[] = [];
  openTabs.subscribe(v => tabs = v)();

  const existingIdx = tabs.findIndex(t => t.path === diffKey);
  if (existingIdx >= 0) {
    activeTabIndex.set(existingIdx);
    return;
  }

  const newTab: OpenTab = {
    path: diffKey,
    name: `${fileName} (diff)`,
    isDiff: true,
    diffRepoPath: repoPath,
    diffFilePath: filePath,
    diffStaged: staged,
  };
  openTabs.update(t => [...t, newTab]);
  activeTabIndex.set(tabs.length);
}

export function toggleNode(tree: FileNode[], path: string): FileNode[] {
  return tree.map(node => {
    if (node.path === path) {
      return { ...node, expanded: !node.expanded };
    }
    if (node.children) {
      return { ...node, children: toggleNode(node.children, path) };
    }
    return node;
  });
}

// ─── Pinned tabs persistence ─────────────────────────────────────────────────

const PINNED_TABS_KEY = 'vaire:pinned-tabs';

export function loadPinnedPaths(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_TABS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function savePinnedPaths(tabs: OpenTab[]) {
  const paths = tabs.filter(t => t.pinned).map(t => t.path);
  localStorage.setItem(PINNED_TABS_KEY, JSON.stringify(paths));
}

export function pinTab(path: string) {
  openTabs.update(tabs => {
    const updated = tabs.map(t => t.path === path ? { ...t, pinned: true } : t);
    savePinnedPaths(updated);
    return updated;
  });
}

export function unpinTab(path: string) {
  openTabs.update(tabs => {
    const updated = tabs.map(t => t.path === path ? { ...t, pinned: false } : t);
    savePinnedPaths(updated);
    return updated;
  });
}

// ─── Session persistence ─────────────────────────────────────────────────────

export function saveSessionTabs(wsPath: string) {
  let tabs: OpenTab[] = [];
  openTabs.subscribe(v => tabs = v)();
  let idx = -1;
  activeTabIndex.subscribe(v => idx = v)();

  // Skip transient tabs (diff, scratch, settings)
  const persistable = tabs.filter(t => !t.isDiff && !t.isScratch && t.path !== 'vaire://settings');
  if (persistable.length === 0) {
    localStorage.removeItem(`vaire:session:${wsPath}`);
    return;
  }

  const data = {
    tabs: persistable.map(t => ({
      path: t.path,
      name: t.name,
      lang: t.lang,
      pinned: t.pinned || false,
    })),
    activeIndex: Math.min(idx, persistable.length - 1),
  };
  localStorage.setItem(`vaire:session:${wsPath}`, JSON.stringify(data));
}

export async function restoreSessionTabs(wsPath: string): Promise<boolean> {
  try {
    const raw = localStorage.getItem(`vaire:session:${wsPath}`);
    if (!raw) return false;
    const data = JSON.parse(raw) as {
      tabs: { path: string; name: string; lang?: string; pinned: boolean }[];
      activeIndex: number;
    };
    if (!data.tabs || data.tabs.length === 0) return false;

    // Load file content for each tab
    const restoredTabs: OpenTab[] = [];
    for (const t of data.tabs) {
      const ext = t.name.split('.').pop()?.toLowerCase() || '';
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico'];
      const isImage = imageExts.includes(ext);
      const isSvg = ext === 'svg';
      const isMd = ext === 'md' || ext === 'markdown';

      let content = '';
      let previewType: PreviewType = null;
      if (isImage) { previewType = 'image'; }
      else if (isSvg) { previewType = 'svg'; }
      else if (isMd) { previewType = 'markdown'; }

      if (!isImage && !isSvg) {
        try {
          content = await invoke('read_file_content', { path: t.path });
        } catch {
          // File may have been deleted — skip this tab
          continue;
        }
      }

      restoredTabs.push({
        path: t.path,
        name: t.name,
        lang: t.lang,
        pinned: t.pinned,
        content,
        previewType,
      });
    }

    if (restoredTabs.length === 0) return false;

    openTabs.set(restoredTabs);
    const safeIdx = Math.min(data.activeIndex, restoredTabs.length - 1);
    activeTabIndex.set(safeIdx >= 0 ? safeIdx : 0);
    return true;
  } catch {
    return false;
  }
}

export function saveOpenSessions() {
  let wsPath: string | null = null;
  workspacePath.subscribe(v => wsPath = v)();
  if (wsPath) {
    saveSessionTabs(wsPath);
    // Add to open-sessions list
    try {
      const raw = localStorage.getItem('vaire:open-sessions');
      const sessions: string[] = raw ? JSON.parse(raw) : [];
      if (!sessions.includes(wsPath)) {
        sessions.push(wsPath);
      }
      localStorage.setItem('vaire:open-sessions', JSON.stringify(sessions));
    } catch {}
  }
}

export function getOpenSessions(): string[] {
  try {
    const raw = localStorage.getItem('vaire:open-sessions');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearOpenSessions() {
  localStorage.removeItem('vaire:open-sessions');
}
