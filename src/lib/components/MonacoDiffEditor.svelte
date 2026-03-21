<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { activeTheme, fontSettings } from '$lib/stores/theme';
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

  onMount(async () => {
    monaco = await import('monaco-editor');

    monaco.editor.defineTheme('vaire-diff', buildTheme($activeTheme));

    diffEditor = monaco.editor.createDiffEditor(containerEl, {
      theme: 'vaire-diff',
      fontFamily: $fontSettings.family,
      fontSize: $fontSettings.size,
      lineHeight: $fontSettings.size * $fontSettings.lineHeight,
      fontLigatures: true,
      readOnly: true,
      renderSideBySide: true,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      overviewRulerLanes: 0,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false,
      },
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
      const originalModel = monaco.editor.createModel(originalContent, lang);
      const modifiedModel = monaco.editor.createModel(modifiedContent, lang);

      diffEditor.setModel({
        original: originalModel,
        modified: modifiedModel,
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
  });
</script>

<div class="diff-editor-wrapper" bind:this={containerEl}></div>

<style>
  .diff-editor-wrapper {
    width: 100%;
    height: 100%;
  }
</style>
