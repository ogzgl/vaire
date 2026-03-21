import { writable } from 'svelte/store';

export interface Breakpoint {
  id: string;
  filePath: string;
  line: number;
  enabled: boolean;
}

export interface DebugSession {
  active: boolean;
  processId: number | null;
  status: 'idle' | 'running' | 'paused' | 'stopped';
}

const BREAKPOINTS_KEY = 'vaire:breakpoints';

function loadBreakpoints(): Breakpoint[] {
  try {
    const raw = localStorage.getItem(BREAKPOINTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Breakpoint[];
  } catch {
    return [];
  }
}

function saveBreakpoints(bps: Breakpoint[]) {
  localStorage.setItem(BREAKPOINTS_KEY, JSON.stringify(bps));
}

function createBreakpointsStore() {
  const { subscribe, update, set } = writable<Breakpoint[]>(loadBreakpoints());

  return {
    subscribe,
    add(filePath: string, line: number) {
      // Check if already exists
      let existing: Breakpoint | undefined;
      const unsub = subscribe(bps => { existing = bps.find(b => b.filePath === filePath && b.line === line); });
      unsub();
      if (existing) return;

      const bp: Breakpoint = {
        id: crypto.randomUUID(),
        filePath,
        line,
        enabled: true,
      };
      update(bps => {
        const updated = [...bps, bp];
        saveBreakpoints(updated);
        return updated;
      });
    },
    remove(id: string) {
      update(bps => {
        const updated = bps.filter(b => b.id !== id);
        saveBreakpoints(updated);
        return updated;
      });
    },
    removeByFileAndLine(filePath: string, line: number) {
      update(bps => {
        const updated = bps.filter(b => !(b.filePath === filePath && b.line === line));
        saveBreakpoints(updated);
        return updated;
      });
    },
    toggle(id: string) {
      update(bps => {
        const updated = bps.map(b => b.id === id ? { ...b, enabled: !b.enabled } : b);
        saveBreakpoints(updated);
        return updated;
      });
    },
    toggleByFileAndLine(filePath: string, line: number) {
      let found = false;
      update(bps => {
        const existing = bps.find(b => b.filePath === filePath && b.line === line);
        if (existing) {
          found = true;
          const updated = bps.filter(b => !(b.filePath === filePath && b.line === line));
          saveBreakpoints(updated);
          return updated;
        }
        return bps;
      });
      if (!found) {
        this.add(filePath, line);
      }
    },
    clear() {
      set([]);
      saveBreakpoints([]);
    },
  };
}

export const breakpoints = createBreakpointsStore();

export const debugSession = writable<DebugSession>({
  active: false,
  processId: null,
  status: 'idle',
});
