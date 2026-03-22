import { writable, derived } from 'svelte/store';

export interface Keybinding {
  action: string;
  shortcut: string;
}

export const defaultKeybindings: Keybinding[] = [
  { action: 'Open File', shortcut: 'Cmd+P' },
  { action: 'Search Everywhere', shortcut: 'Double Shift' },
  { action: 'Find in Files', shortcut: 'Cmd+Shift+F' },
  { action: 'Command Palette', shortcut: 'Cmd+Shift+A' },
  { action: 'Commit', shortcut: 'Cmd+K' },
  { action: 'Push', shortcut: 'Cmd+Shift+K' },
  { action: 'Toggle Terminal', shortcut: 'Cmd+`' },
  { action: 'Split Editor', shortcut: 'Cmd+\\' },
  { action: 'Close Tab', shortcut: 'Cmd+W' },
  { action: 'Toggle Bookmark', shortcut: 'Cmd+F11' },
  { action: 'Next Bookmark', shortcut: 'F11' },
  { action: 'New Scratch File', shortcut: 'Cmd+Shift+N' },
  { action: 'Recent Files', shortcut: 'Cmd+E' },
  { action: 'Toggle Sidebar', shortcut: 'Cmd+B' },
  { action: 'Show Diff (in dialog)', shortcut: 'Cmd+D' },
  { action: 'Commit & Push', shortcut: 'Cmd+Shift+Enter' },
];

const STORAGE_KEY = 'vaire:custom-keybindings';

function loadCustomKeybindings(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCustomKeybindings(customs: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customs));
}

export const customKeybindings = writable<Record<string, string>>(loadCustomKeybindings());

customKeybindings.subscribe(value => {
  saveCustomKeybindings(value);
});

export const effectiveKeybindings = derived(customKeybindings, ($custom) => {
  return defaultKeybindings.map(kb => ({
    ...kb,
    shortcut: $custom[kb.action] || kb.shortcut,
    isCustom: !!$custom[kb.action],
  }));
});

export function updateKeybinding(action: string, shortcut: string) {
  customKeybindings.update(c => ({ ...c, [action]: shortcut }));
}

export function resetKeybinding(action: string) {
  customKeybindings.update(c => {
    const { [action]: _, ...rest } = c;
    return rest;
  });
}

export function buildShortcutString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push('Cmd');
  if (e.ctrlKey && !e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = e.key;
  // Skip modifier-only keys
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return '';

  // Map special keys
  const keyMap: Record<string, string> = {
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Enter': 'Enter',
    'Tab': 'Tab',
    'Escape': 'Escape',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    ' ': 'Space',
    '`': '`',
    '\\': '\\',
  };

  const mappedKey = keyMap[key] || (key.length === 1 ? key.toUpperCase() : key);
  parts.push(mappedKey);

  return parts.join('+');
}
