<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { activeTheme, fontSettings } from '$lib/stores/theme';
  import { showToast } from '$lib/stores/notifications';
  import type * as Monaco from 'monaco-editor';

  let {
    repoPath = '',
    filePath = '',
    staged = false,
  }: {
    repoPath?: string;
    filePath?: string;
    staged?: boolean;
  } = $props();

  let containerEl: HTMLDivElement;
  let diffEditor: Monaco.editor.IStandaloneDiffEditor | undefined;
  let monaco: typeof Monaco;
  let diffCount = $state(0);
  let originalModel: Monaco.editor.ITextModel | undefined;
  let modifiedModel: Monaco.editor.ITextModel | undefined;

  function langFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      kt: 'kotlin', kts: 'kotlin', java: 'java', ts: 'typescript', tsx: 'typescript',
      js: 'javascript', jsx: 'javascript', py: 'python', rs: 'rust', go: 'go',
      json: 'json', yaml: 'yaml', yml: 'yaml', html: 'html', css: 'css',
      sql: 'sql', md: 'markdown', sh: 'shell', tf: 'hcl', svelte: 'html',
      xml: 'xml', toml: 'plaintext', gradle: 'kotlin',
    };
    return map[ext] || 'plaintext';
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
      ],
      colors: {
        'editor.background': theme.colors.bgBase,
        'editor.foreground': theme.colors.textPrimary,
        'diffEditor.insertedTextBackground': '#4ade8030',
        'diffEditor.removedTextBackground': '#f8717130',
        'diffEditor.insertedLineBackground': '#4ade801a',
        'diffEditor.removedLineBackground': '#f871711a',
        'diffEditorGutter.insertedLineBackground': '#4ade8025',
        'diffEditorGutter.removedLineBackground': '#f8717125',
        'editorLineNumber.foreground': theme.colors.textMuted,
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': theme.colors.border + '80',
      },
    };
  }

  function countDiffs(): number {
    if (!diffEditor) return 0;
    try {
      const lineChanges = diffEditor.getLineChanges();
      return lineChanges?.length ?? 0;
    } catch {
      return 0;
    }
  }

  function acceptAllChanges() {
    if (!diffEditor || !modifiedModel || !originalModel) return;
    try {
      // Copy entire modified content into original model
      const modContent = modifiedModel.getValue();
      originalModel.setValue(modContent);
      diffCount = 0;
      showToast('All changes accepted', 'success');
    } catch (e) {
      showToast('Failed to accept changes', 'error');
    }
  }

  async function rejectAllChanges() {
    if (!diffEditor || !modifiedModel || !originalModel) return;
    try {
      const origContent = originalModel.getValue();
      modifiedModel.setValue(origContent);
      // Write reverted content to disk
      const fullPath = repoPath + '/' + filePath;
      await invoke('write_file_content', { path: fullPath, content: origContent });
      diffCount = 0;
      showToast('All changes reverted', 'info');
    } catch (e) {
      showToast('Failed to reject changes', 'error');
    }
  }

  onMount(async () => {
    monaco = await import('monaco-editor');

    monaco.editor.defineTheme('vaire-diff', buildTheme($activeTheme));

    diffEditor = monaco.editor.createDiffEditor(containerEl, {
      theme: 'vaire-diff',
      fontFamily: $fontSettings.family,
      fontSize: $fontSettings.size,
      lineHeight: $fontSettings.size * $fontSettings.lineHeight,
      fontLigatures: true,
      readOnly: false,
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: false,
      enableSplitViewResizing: true,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      overviewRulerLanes: 0,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false,
      },
      originalEditable: false,
    });

    // Load original (HEAD) and modified content
    try {
      const fullPath = repoPath + '/' + filePath;

      // Get current file content
      let modifiedContent = '';
      try {
        modifiedContent = await invoke<string>('read_file_content', { path: fullPath });
      } catch {
        modifiedContent = '';
      }

      // Get original content from git
      let originalContent = '';
      try {
        originalContent = await invoke<string>('git_command', {
          repoPath,
          args: ['show', `HEAD:${filePath}`],
        });
      } catch {
        originalContent = ''; // New file
      }

      const lang = langFromPath(filePath);
      originalModel = monaco.editor.createModel(originalContent, lang);
      modifiedModel = monaco.editor.createModel(modifiedContent, lang);

      diffEditor.setModel({
        original: originalModel,
        modified: modifiedModel,
      });

      // Count diffs after the editor computes them
      setTimeout(() => {
        diffCount = countDiffs();
      }, 300);

      // Auto-save modified model changes to disk (handles inline "Revert this change", manual edits, etc.)
      let saveTimeout: ReturnType<typeof setTimeout>;
      modifiedModel.onDidChangeContent(() => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          if (!modifiedModel) return;
          try {
            const fullPath = repoPath + '/' + filePath;
            await invoke('write_file_content', { path: fullPath, content: modifiedModel.getValue() });
          } catch (e) {
            console.error('Auto-save diff failed:', e);
          }
          // Recount diffs
          diffCount = countDiffs();
        }, 500);
      });
    } catch (e) {
      console.error('Failed to load diff:', e);
    }
  });

  $effect(() => {
    if (monaco && diffEditor) {
      monaco.editor.defineTheme('vaire-diff', buildTheme($activeTheme));
      monaco.editor.setTheme('vaire-diff');
    }
  });

  $effect(() => {
    if (diffEditor) {
      const f = $fontSettings;
      diffEditor.updateOptions({
        fontFamily: f.family,
        fontSize: f.size,
        lineHeight: f.size * f.lineHeight,
      });
    }
  });

  onDestroy(() => {
    diffEditor?.dispose();
    originalModel?.dispose();
    modifiedModel?.dispose();
  });
</script>

<div class="diff-editor-container">
  <!-- Diff toolbar -->
  <div class="diff-toolbar">
    <div class="diff-pane-labels">
      <span class="diff-pane-label original-label">HEAD (committed)</span>
      <span class="diff-pane-label modified-label">Working Copy</span>
    </div>
  </div>
  <div class="diff-toolbar diff-toolbar-actions">
    <div class="diff-info">
      <span class="diff-file-path">{filePath}</span>
      {#if diffCount > 0}
        <span class="diff-count-badge">{diffCount} difference{diffCount !== 1 ? 's' : ''}</span>
      {:else}
        <span class="diff-no-changes">No differences</span>
      {/if}
    </div>
    <div class="diff-actions">
      <button
        class="diff-action-btn diff-accept"
        onclick={acceptAllChanges}
        title="Accept all changes (copy right to left)"
        disabled={diffCount === 0}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
        </svg>
        Accept All
      </button>
      <button
        class="diff-action-btn diff-reject"
        onclick={rejectAllChanges}
        title="Reject all changes (revert to original)"
        disabled={diffCount === 0}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
        Reject All
      </button>
    </div>
  </div>

  <!-- Monaco diff editor -->
  <div class="diff-editor-wrapper" bind:this={containerEl}></div>
</div>

<style>
  .diff-editor-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .diff-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    gap: 8px;
    height: 26px;
  }

  .diff-toolbar-actions {
    height: 26px;
  }

  .diff-pane-labels {
    display: flex;
    width: 100%;
  }

  .diff-pane-label {
    flex: 1;
    font-size: 11px;
    font-weight: 600;
    text-align: center;
  }

  .original-label {
    color: var(--color-error);
  }

  .modified-label {
    color: var(--color-success);
  }

  .diff-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .diff-file-path {
    font-family: var(--font-editor, monospace);
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .diff-count-badge {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--color-accent-subtle);
    color: var(--color-accent);
  }

  .diff-no-changes {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .diff-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .diff-action-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    font-size: 11px;
    font-family: inherit;
    font-weight: 500;
    background: var(--color-bg-hover);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.1s, color 0.1s, border-color 0.1s;
    white-space: nowrap;
    color: var(--color-text-secondary);
  }

  .diff-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .diff-accept:hover:not(:disabled) {
    background: rgba(74, 222, 128, 0.15);
    border-color: var(--color-success);
    color: var(--color-success);
  }

  .diff-reject:hover:not(:disabled) {
    background: rgba(248, 113, 113, 0.15);
    border-color: var(--color-error);
    color: var(--color-error);
  }

  .diff-editor-wrapper {
    flex: 1;
    min-height: 0;
    width: 100%;
  }
</style>
