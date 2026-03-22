import { writable, derived } from 'svelte/store';

export interface Theme {
  name: string;
  id: string;
  colors: {
    bgBase: string;
    bgSurface: string;
    bgElevated: string;
    bgOverlay: string;
    bgHover: string;
    bgActive: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    accentSubtle: string;
    border: string;
    borderSubtle: string;
    borderFocus: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };
}

export interface FontSettings {
  family: string;
  size: number;
  lineHeight: number;
  uiFamily: string;
  uiSize: number;
}

// JetBrains Darcula-inspired (neutral dark)
const darcula: Theme = {
  name: 'Darcula',
  id: 'darcula',
  colors: {
    bgBase: '#1e1e1e',
    bgSurface: '#252526',
    bgElevated: '#2d2d2d',
    bgOverlay: '#333333',
    bgHover: '#383838',
    bgActive: '#404040',
    textPrimary: '#d4d4d4',
    textSecondary: '#a0a0a0',
    textTertiary: '#727272',
    textMuted: '#585858',
    accent: '#4d9cf5',
    accentHover: '#5eaaff',
    accentSubtle: '#4d9cf520',
    border: '#393939',
    borderSubtle: '#2e2e2e',
    borderFocus: '#4d9cf5',
    success: '#6a9955',
    warning: '#d7ba7d',
    error: '#f44747',
    info: '#4d9cf5',
  },
};

// One Dark (Atom-inspired)
const oneDark: Theme = {
  name: 'One Dark',
  id: 'one-dark',
  colors: {
    bgBase: '#282c34',
    bgSurface: '#21252b',
    bgElevated: '#2c313a',
    bgOverlay: '#333842',
    bgHover: '#383d47',
    bgActive: '#3e4452',
    textPrimary: '#abb2bf',
    textSecondary: '#848b98',
    textTertiary: '#636b78',
    textMuted: '#4b5263',
    accent: '#61afef',
    accentHover: '#74baf2',
    accentSubtle: '#61afef20',
    border: '#3e4452',
    borderSubtle: '#333842',
    borderFocus: '#61afef',
    success: '#98c379',
    warning: '#e5c07b',
    error: '#e06c75',
    info: '#61afef',
  },
};

// GitHub Dark
const githubDark: Theme = {
  name: 'GitHub Dark',
  id: 'github-dark',
  colors: {
    bgBase: '#0d1117',
    bgSurface: '#161b22',
    bgElevated: '#1c2129',
    bgOverlay: '#21262d',
    bgHover: '#262c36',
    bgActive: '#2d333b',
    textPrimary: '#e6edf3',
    textSecondary: '#8b949e',
    textTertiary: '#6e7681',
    textMuted: '#484f58',
    accent: '#58a6ff',
    accentHover: '#79c0ff',
    accentSubtle: '#58a6ff20',
    border: '#30363d',
    borderSubtle: '#21262d',
    borderFocus: '#58a6ff',
    success: '#3fb950',
    warning: '#d29922',
    error: '#f85149',
    info: '#58a6ff',
  },
};

// Nord
const nord: Theme = {
  name: 'Nord',
  id: 'nord',
  colors: {
    bgBase: '#2e3440',
    bgSurface: '#3b4252',
    bgElevated: '#434c5e',
    bgOverlay: '#4c566a',
    bgHover: '#4c566a',
    bgActive: '#5a657a',
    textPrimary: '#eceff4',
    textSecondary: '#d8dee9',
    textTertiary: '#a0a8b7',
    textMuted: '#6b7384',
    accent: '#88c0d0',
    accentHover: '#8fbcbb',
    accentSubtle: '#88c0d020',
    border: '#4c566a',
    borderSubtle: '#434c5e',
    borderFocus: '#88c0d0',
    success: '#a3be8c',
    warning: '#ebcb8b',
    error: '#bf616a',
    info: '#81a1c1',
  },
};

// Warp-inspired (warm navy + cream + orange accent)
const warpDark: Theme = {
  name: 'Warp',
  id: 'warp-dark',
  colors: {
    bgBase: '#1a1b2e',
    bgSurface: '#1e1f36',
    bgElevated: '#252740',
    bgOverlay: '#2d2f4a',
    bgHover: '#33365a',
    bgActive: '#3a3d66',
    textPrimary: '#e8e4d9',
    textSecondary: '#b5b0a1',
    textTertiary: '#8a8577',
    textMuted: '#5e5a50',
    accent: '#e8875b',
    accentHover: '#f09a72',
    accentSubtle: '#e8875b20',
    border: '#2d2f4a',
    borderSubtle: '#252740',
    borderFocus: '#e8875b',
    success: '#8bc472',
    warning: '#e8c06a',
    error: '#e06060',
    info: '#6aaef5',
  },
};

// Monokai (Classic Sublime Text palette)
const monokai: Theme = {
  name: 'Monokai',
  id: 'monokai',
  colors: {
    bgBase: '#272822',
    bgSurface: '#2d2e27',
    bgElevated: '#3e3d32',
    bgOverlay: '#49483e',
    bgHover: '#4e4d43',
    bgActive: '#5b5a4f',
    textPrimary: '#f8f8f2',
    textSecondary: '#cfcfc2',
    textTertiary: '#90908a',
    textMuted: '#636357',
    accent: '#a6e22e',
    accentHover: '#b6f23e',
    accentSubtle: '#a6e22e20',
    border: '#49483e',
    borderSubtle: '#3e3d32',
    borderFocus: '#a6e22e',
    success: '#a6e22e',
    warning: '#e6db74',
    error: '#f92672',
    info: '#66d9ef',
  },
};

// Black (True black / AMOLED)
const black: Theme = {
  name: 'Black',
  id: 'black',
  colors: {
    bgBase: '#000000',
    bgSurface: '#0a0a0a',
    bgElevated: '#141414',
    bgOverlay: '#1a1a1a',
    bgHover: '#1e1e1e',
    bgActive: '#282828',
    textPrimary: '#e6edf3',
    textSecondary: '#8b949e',
    textTertiary: '#6e7681',
    textMuted: '#484f58',
    accent: '#58a6ff',
    accentHover: '#79c0ff',
    accentSubtle: '#58a6ff20',
    border: '#1e1e1e',
    borderSubtle: '#141414',
    borderFocus: '#58a6ff',
    success: '#3fb950',
    warning: '#d29922',
    error: '#f85149',
    info: '#58a6ff',
  },
};

export const themes: Theme[] = [darcula, oneDark, githubDark, nord, warpDark, monokai, black];

function loadThemeId(): string {
  try {
    return localStorage.getItem('vaire:theme') || 'darcula';
  } catch {
    return 'darcula';
  }
}

export const activeThemeId = writable<string>(loadThemeId());

// Persist theme changes to localStorage
activeThemeId.subscribe(id => {
  try { localStorage.setItem('vaire:theme', id); } catch {}
});

export const activeTheme = derived(activeThemeId, ($id) => {
  return themes.find((t) => t.id === $id) || darcula;
});

export const fontSettings = writable<FontSettings>({
  family: 'Fira Code',
  size: 13,
  lineHeight: 1.2,
  uiFamily: 'Inter',
  uiSize: 13,
});

export const showSettings = writable(false);
