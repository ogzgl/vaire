<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { activeTheme } from '$lib/stores/theme';
  import { fontSettings } from '$lib/stores/theme';
  import { invoke } from '@tauri-apps/api/core';
  import type * as Monaco from 'monaco-editor';
  import { bookmarks, toggleBookmark, hasBookmark, getNextBookmark } from '$lib/stores/bookmarks';

  let {
    content = '',
    language = 'plaintext',
    path = '',
    repoPath = '',
    showBlame = false,
  }: {
    content?: string;
    language?: string;
    path?: string;
    repoPath?: string;
    showBlame?: boolean;
  } = $props();

  let containerEl: HTMLDivElement;
  let editor: Monaco.editor.IStandaloneCodeEditor | undefined;
  let monaco: typeof Monaco;
  let saveTimeout: ReturnType<typeof setTimeout>;
  let disposables: Monaco.IDisposable[] = [];

  // Bookmark decorations
  let bookmarkDecorations: string[] = [];
  let currentBookmarks: typeof $bookmarks = [];
  const unsubBookmarks = bookmarks.subscribe(bm => {
    currentBookmarks = bm;
    applyBookmarkDecorations();
  });

  function applyBookmarkDecorations() {
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();

    const newDecs: Monaco.editor.IModelDeltaDecoration[] = currentBookmarks
      .filter(b => b.filePath === path && b.line <= lineCount)
      .map(b => ({
        range: new monaco.Range(b.line, 1, b.line, 1),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: 'vaire-bookmark-gutter',
          className: 'vaire-bookmark-line',
        },
      }));

    bookmarkDecorations = editor.deltaDecorations(bookmarkDecorations, newDecs);
  }

  // Git blame state
  interface BlameEntry {
    line: number;
    short_commit: string;
    author: string;
    time: number;
    is_committed: boolean;
  }
  let blameData = $state<BlameEntry[]>([]);
  let blameDecorations: string[] = [];

  function relativeTime(unixTs: number): string {
    const now = Date.now() / 1000;
    const diff = now - unixTs;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo ago`;
    return `${Math.floor(diff / (86400 * 365))}y ago`;
  }

  async function fetchBlame() {
    if (!repoPath || !path || path.startsWith('diff:')) {
      blameData = [];
      return;
    }
    try {
      // Get relative path from absolute path and repoPath
      const relativePath = path.startsWith(repoPath)
        ? path.slice(repoPath.length).replace(/^\//, '')
        : path;
      const data = await invoke<BlameEntry[]>('git_blame', { repoPath, filePath: relativePath });
      blameData = data;
    } catch {
      blameData = [];
    }
  }

  function applyBlameDecorations() {
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    // Clear existing decorations
    blameDecorations = editor.deltaDecorations(blameDecorations, []);

    if (!showBlame || blameData.length === 0) return;

    const newDecorations: Monaco.editor.IModelDeltaDecoration[] = blameData
      .filter(b => b.is_committed)
      .map(b => ({
        range: new monaco.Range(b.line, 1, b.line, 1),
        options: {
          isWholeLine: false,
          linesDecorationsClassName: undefined,
          beforeContentClassName: undefined,
          after: {
            content: `  ${b.short_commit} ${b.author.split(' ')[0]} ${relativeTime(b.time)}`,
            inlineClassName: 'vaire-blame-annotation',
          },
        },
      }));

    blameDecorations = editor.deltaDecorations([], newDecorations);
  }

  // Auto-save: debounced write to disk
  function scheduleAutoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      if (!editor || !path || path.startsWith('diff:')) return;
      const currentContent = editor.getModel()?.getValue();
      if (currentContent !== undefined && currentContent !== content) {
        try {
          await invoke('write_file_content', { path, content: currentContent });
        } catch (e) {
          console.error('Auto-save failed:', e);
        }
      }
    }, 500);
  }

  function langToMonacoLang(lang?: string): string {
    if (!lang) return 'plaintext';
    const map: Record<string, string> = {
      kotlin: 'kotlin',
      java: 'java',
      typescript: 'typescript',
      javascript: 'javascript',
      python: 'python',
      rust: 'rust',
      go: 'go',
      ruby: 'ruby',
      swift: 'swift',
      c: 'c',
      cpp: 'cpp',
      csharp: 'csharp',
      json: 'json',
      yaml: 'yaml',
      toml: 'plaintext',
      xml: 'xml',
      html: 'html',
      css: 'css',
      sql: 'sql',
      shell: 'shell',
      markdown: 'markdown',
      terraform: 'hcl',
      gradle: 'kotlin',
      dockerfile: 'dockerfile',
      graphql: 'graphql',
      svelte: 'html',
      vue: 'html',
      csv: 'plaintext',
      env: 'plaintext',
      properties: 'ini',
      ini: 'ini',
    };
    return map[lang] || 'plaintext';
  }

  function buildTheme(theme: typeof $activeTheme): Monaco.editor.IStandaloneThemeData {
    return {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: theme.colors.textMuted.replace('#', ''), fontStyle: 'italic' },
        { token: 'keyword', foreground: theme.colors.accent.replace('#', '') },
        { token: 'string', foreground: theme.colors.success.replace('#', '') },
        { token: 'number', foreground: theme.colors.warning.replace('#', '') },
        { token: 'type', foreground: theme.colors.info.replace('#', '') },
        { token: 'annotation', foreground: theme.colors.warning.replace('#', '') },
      ],
      colors: {
        'editor.background': theme.colors.bgBase,
        'editor.foreground': theme.colors.textPrimary,
        'editor.lineHighlightBackground': theme.colors.bgHover,
        'editor.selectionBackground': theme.colors.accentSubtle,
        'editorLineNumber.foreground': theme.colors.textMuted,
        'editorLineNumber.activeForeground': theme.colors.textSecondary,
        'editorCursor.foreground': theme.colors.accent,
        'editor.inactiveSelectionBackground': theme.colors.bgActive,
        'editorWidget.background': theme.colors.bgElevated,
        'editorWidget.border': theme.colors.border,
        'editorIndentGuide.background': theme.colors.borderSubtle,
        'editorIndentGuide.activeBackground': theme.colors.border,
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': theme.colors.border + '80',
        'scrollbarSlider.hoverBackground': theme.colors.textMuted + '80',
        'scrollbarSlider.activeBackground': theme.colors.textMuted,
        'minimap.background': theme.colors.bgBase,
      },
    };
  }

  onMount(async () => {
    monaco = await import('monaco-editor');

    // Configure Monaco workers for Vite
    self.MonacoEnvironment = {
      getWorker: function (_moduleId: string, label: string) {
        switch (label) {
          case 'json':
            return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), { type: 'module' });
          case 'css':
          case 'scss':
          case 'less':
            return new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), { type: 'module' });
          case 'html':
          case 'handlebars':
          case 'razor':
            return new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), { type: 'module' });
          case 'typescript':
          case 'javascript':
            return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), { type: 'module' });
          default:
            return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' });
        }
      },
    };

    monaco.editor.defineTheme('vaire', buildTheme($activeTheme));

    editor = monaco.editor.create(containerEl, {
      value: content,
      language: langToMonacoLang(language),
      theme: 'vaire',
      fontFamily: $fontSettings.family,
      fontSize: $fontSettings.size,
      lineHeight: $fontSettings.size * $fontSettings.lineHeight,
      fontLigatures: true,
      minimap: { enabled: true, size: 'proportional' },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'line',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      padding: { top: 8 },
      automaticLayout: true,
      readOnly: false,
      wordWrap: 'off',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false,
      },
    });

    // Auto-save on content change
    const changeDisposable = editor.onDidChangeModelContent(() => {
      scheduleAutoSave();
    });
    disposables.push(changeDisposable);

    // Forward key shortcuts that Monaco would otherwise swallow
    // Cmd+K, Cmd+Shift+K, Cmd+D, Double Shift — dispatch to window
    const keysToForward = [
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK,
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD,
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE,
    ];

    for (const keybinding of keysToForward) {
      const action = editor.addAction({
        id: `vaire-forward-${keybinding}`,
        label: 'Forward to Vaire',
        keybindings: [keybinding],
        run: () => {
          // Re-dispatch as a native keyboard event so our global handlers catch it
          const e = new KeyboardEvent('keydown', {
            key: keybinding & monaco.KeyCode.KeyK ? 'k' :
                 keybinding & monaco.KeyCode.KeyD ? 'd' :
                 keybinding & monaco.KeyCode.KeyE ? 'e' : '',
            metaKey: true,
            ctrlKey: false,
            shiftKey: !!(keybinding & monaco.KeyMod.Shift),
            bubbles: true,
          });
          window.dispatchEvent(e);
        },
      });
      disposables.push(action);
    }

    // Bookmark: Cmd+F11 to toggle, F11 to jump to next
    const bookmarkToggleAction = editor.addAction({
      id: 'vaire-bookmark-toggle',
      label: 'Toggle Bookmark',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F11],
      run: (ed) => {
        const line = ed.getPosition()?.lineNumber;
        if (line && path) {
          const name = path.split('/').pop() || path;
          toggleBookmark(path, line, name);
          applyBookmarkDecorations();
        }
      },
    });
    disposables.push(bookmarkToggleAction);

    const bookmarkNextAction = editor.addAction({
      id: 'vaire-bookmark-next',
      label: 'Jump to Next Bookmark',
      keybindings: [monaco.KeyCode.F11],
      run: (ed) => {
        const currentLine = ed.getPosition()?.lineNumber ?? 0;
        const next = getNextBookmark(currentBookmarks, path, currentLine);
        if (next) {
          if (next.filePath === path) {
            ed.revealLineInCenter(next.line);
            ed.setPosition({ lineNumber: next.line, column: 1 });
          } else {
            // Navigate to another file via custom event
            window.dispatchEvent(new CustomEvent('vaire:goto-bookmark', { detail: next }));
          }
        }
      },
    });
    disposables.push(bookmarkNextAction);

    // Initial bookmark decorations
    applyBookmarkDecorations();
  });

  // React to theme changes
  $effect(() => {
    if (monaco && editor) {
      const theme = $activeTheme;
      monaco.editor.defineTheme('vaire', buildTheme(theme));
      monaco.editor.setTheme('vaire');
    }
  });

  // React to font changes
  $effect(() => {
    if (editor) {
      const f = $fontSettings;
      editor.updateOptions({
        fontFamily: f.family,
        fontSize: f.size,
        lineHeight: f.size * f.lineHeight,
      });
    }
  });

  // React to content/language changes
  $effect(() => {
    if (editor && monaco) {
      const model = editor.getModel();
      if (model) {
        const currentValue = model.getValue();
        if (currentValue !== content) {
          model.setValue(content);
        }
        const monacoLang = langToMonacoLang(language);
        if (model.getLanguageId() !== monacoLang) {
          monaco.editor.setModelLanguage(model, monacoLang);
        }
      }
    }
  });

  // Fetch blame when path or repoPath changes
  $effect(() => {
    const _path = path;
    const _repo = repoPath;
    if (editor && monaco) {
      fetchBlame();
      applyBookmarkDecorations();
    }
  });

  // Apply/remove blame decorations when showBlame or blameData changes
  $effect(() => {
    const _show = showBlame;
    const _data = blameData;
    if (editor && monaco) {
      applyBlameDecorations();
    }
  });

  // Listen for structure-panel goto-line events
  function handleGotoLine(e: Event) {
    const detail = (e as CustomEvent<{ line: number }>).detail;
    if (editor && detail?.line) {
      editor.revealLineInCenter(detail.line);
      editor.setPosition({ lineNumber: detail.line, column: 1 });
      editor.focus();
    }
  }

  onMount(() => {
    window.addEventListener('vaire:goto-line', handleGotoLine);
    return () => window.removeEventListener('vaire:goto-line', handleGotoLine);
  });

  onDestroy(() => {
    clearTimeout(saveTimeout);
    unsubBookmarks();
    disposables.forEach(d => d.dispose());
    editor?.dispose();
  });
</script>

<div class="monaco-wrapper" bind:this={containerEl}></div>

<style>
  .monaco-wrapper {
    width: 100%;
    height: 100%;
  }

  /* Blame annotation injected after line content */
  :global(.vaire-blame-annotation) {
    opacity: 0.35;
    font-size: 11px;
    font-style: italic;
    color: #abb2bf;
    padding-left: 8px;
    pointer-events: none;
    user-select: none;
  }

  /* Bookmark gutter marker */
  :global(.vaire-bookmark-gutter) {
    background: #f0a030;
    width: 4px !important;
    margin-left: 3px;
    border-radius: 2px;
  }

  /* Bookmark highlighted line (subtle) */
  :global(.vaire-bookmark-line) {
    background: rgba(240, 160, 48, 0.06);
  }
</style>
