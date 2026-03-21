import { writable, get } from 'svelte/store';

export interface RunConfig {
  id: string;
  name: string;
  command: string;
  cwd: string; // relative to workspace root
  env?: Record<string, string>;
}

const STORAGE_KEY = 'vaire:run-configs';

function loadConfigs(): RunConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RunConfig[];
  } catch {
    return [];
  }
}

function saveConfigs(configs: RunConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

function createRunConfigsStore() {
  const { subscribe, set, update } = writable<RunConfig[]>(loadConfigs());

  return {
    subscribe,
    add(config: Omit<RunConfig, 'id'>) {
      const newConfig: RunConfig = {
        ...config,
        id: crypto.randomUUID(),
      };
      update(configs => {
        const updated = [...configs, newConfig];
        saveConfigs(updated);
        return updated;
      });
      return newConfig;
    },
    updateConfig(id: string, changes: Partial<Omit<RunConfig, 'id'>>) {
      update(configs => {
        const updated = configs.map(c => c.id === id ? { ...c, ...changes } : c);
        saveConfigs(updated);
        return updated;
      });
    },
    remove(id: string) {
      update(configs => {
        const updated = configs.filter(c => c.id !== id);
        saveConfigs(updated);
        return updated;
      });
    },
    reset() {
      set([]);
      saveConfigs([]);
    },
  };
}

export const runConfigs = createRunConfigsStore();

// Active run config selection
const ACTIVE_KEY = 'vaire:active-run-config';

function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

function createActiveConfigStore() {
  const { subscribe, set } = writable<string | null>(loadActiveId());

  return {
    subscribe,
    set(id: string | null) {
      if (id) {
        localStorage.setItem(ACTIVE_KEY, id);
      } else {
        localStorage.removeItem(ACTIVE_KEY);
      }
      set(id);
    },
  };
}

export const activeRunConfigId = createActiveConfigStore();
