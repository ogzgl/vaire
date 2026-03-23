import { writable, get } from 'svelte/store';

export interface DbConnectionConfig {
  id: string;
  label: string;
  dbType: 'postgres' | 'mongodb';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  isProd: boolean;
  ssl: boolean;
}

const STORAGE_KEY = 'vaire:db-connections';

function loadFromStorage(): DbConnectionConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(connections: DbConnectionConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
}

export const dbConnections = writable<DbConnectionConfig[]>(loadFromStorage());

dbConnections.subscribe(saveToStorage);

export function addConnection(config: Omit<DbConnectionConfig, 'id'>): DbConnectionConfig {
  const newConfig: DbConnectionConfig = {
    ...config,
    id: crypto.randomUUID(),
  };
  dbConnections.update(conns => [...conns, newConfig]);
  return newConfig;
}

export function updateConnection(id: string, changes: Partial<DbConnectionConfig>) {
  dbConnections.update(conns =>
    conns.map(c => (c.id === id ? { ...c, ...changes } : c))
  );
}

export function removeConnection(id: string) {
  dbConnections.update(conns => conns.filter(c => c.id !== id));
}

export function loadDbConnections() {
  dbConnections.set(loadFromStorage());
}

// Global dialog state — rendered at page root to avoid overflow clipping
export const dbDialogOpen = writable<boolean>(false);
export const dbDialogEditConfig = writable<DbConnectionConfig | null>(null);

export function openDbDialog(editConfig?: DbConnectionConfig | null) {
  dbDialogEditConfig.set(editConfig ?? null);
  dbDialogOpen.set(true);
}

export function closeDbDialog() {
  dbDialogOpen.set(false);
  dbDialogEditConfig.set(null);
}
