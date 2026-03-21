import { writable } from 'svelte/store';

export type SidebarPanel = 'files' | 'git' | 'search' | 'structure' | 'bookmarks' | 'todo';
export type BottomPanel = 'terminal' | 'run' | 'git-log' | 'problems' | 'todo' | 'debug' | null;

export const activeSidebarPanel = writable<SidebarPanel>('files');
export const activeBottomPanel = writable<BottomPanel>(null);
export const sidebarWidth = writable(260);
export const bottomPanelHeight = writable(250);
export const isSidebarCollapsed = writable(false);
