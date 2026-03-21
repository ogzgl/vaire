import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { addRecentProject } from './recent';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder' | 'repo';
  children?: FileNode[];
  lang?: string;
  is_git_repo: boolean;
  expanded?: boolean;
}

export interface OpenTab {
  path: string;
  name: string;
  lang?: string;
  content?: string;
  isDiff?: boolean;
  diffRepoPath?: string;
  diffFilePath?: string;
  diffStaged?: boolean;
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
  } catch (e) {
    console.error('Failed to open workspace:', e);
  }
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

  try {
    const content: string = await invoke('read_file_content', { path: node.path });
    const newTab: OpenTab = {
      path: node.path,
      name: node.name,
      lang: node.lang || undefined,
      content,
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
