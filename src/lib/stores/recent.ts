import { writable } from 'svelte/store';

export interface RecentProject {
  name: string;
  path: string;
  openedAt: number; // timestamp ms
}

const STORAGE_KEY = 'vaire_recent_projects';
const MAX_RECENT = 10;

function loadFromStorage(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentProject[];
  } catch {
    return [];
  }
}

function saveToStorage(projects: RecentProject[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // ignore storage errors
  }
}

const initial = typeof localStorage !== 'undefined' ? loadFromStorage() : [];
export const recentProjects = writable<RecentProject[]>(initial);

export function addRecentProject(path: string) {
  const name = path.split('/').pop() || path;
  recentProjects.update(projects => {
    // Remove any existing entry for the same path
    const filtered = projects.filter(p => p.path !== path);
    const updated = [{ name, path, openedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
    saveToStorage(updated);
    return updated;
  });
}

export function removeRecentProject(path: string) {
  recentProjects.update(projects => {
    const updated = projects.filter(p => p.path !== path);
    saveToStorage(updated);
    return updated;
  });
}
