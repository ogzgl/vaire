<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';

  let {
    repoPath = '',
    filePath = '',
    staged = false,
  }: {
    repoPath?: string;
    filePath?: string;
    staged?: boolean;
  } = $props();

  interface DiffLine {
    type: 'added' | 'removed' | 'context' | 'header';
    content: string;
    oldLine?: number;
    newLine?: number;
  }

  let diffLines = $state<DiffLine[]>([]);
  let isLoading = $state(true);

  function parseDiff(raw: string): DiffLine[] {
    const lines: DiffLine[] = [];
    let oldLine = 0;
    let newLine = 0;

    for (const line of raw.split('\n')) {
      if (line.startsWith('@@')) {
        // Parse hunk header
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
        if (match) {
          oldLine = parseInt(match[1]) - 1;
          newLine = parseInt(match[2]) - 1;
        }
        lines.push({ type: 'header', content: line });
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        newLine++;
        lines.push({ type: 'added', content: line.substring(1), newLine });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        oldLine++;
        lines.push({ type: 'removed', content: line.substring(1), oldLine });
      } else if (line.startsWith(' ')) {
        oldLine++;
        newLine++;
        lines.push({ type: 'context', content: line.substring(1), oldLine, newLine });
      } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
        // Skip file headers
      }
    }
    return lines;
  }

  $effect(() => {
    if (repoPath && filePath) {
      isLoading = true;
      invoke<string>('get_git_diff', {
        repoPath,
        filePath,
        staged,
      })
        .then((raw) => {
          diffLines = parseDiff(raw);
          isLoading = false;
        })
        .catch((e) => {
          console.error('Diff failed:', e);
          diffLines = [];
          isLoading = false;
        });
    }
  });
</script>

<div class="diff-view">
  {#if isLoading}
    <div class="diff-loading">Loading diff...</div>
  {:else if diffLines.length === 0}
    <div class="diff-empty">No changes to display</div>
  {:else}
    <div class="diff-content">
      {#each diffLines as line}
        <div class="diff-line {line.type}">
          <span class="diff-gutter old">{line.type === 'removed' || line.type === 'context' ? line.oldLine || '' : ''}</span>
          <span class="diff-gutter new">{line.type === 'added' || line.type === 'context' ? line.newLine || '' : ''}</span>
          <span class="diff-marker">
            {#if line.type === 'added'}+{:else if line.type === 'removed'}-{:else if line.type === 'header'}@@{:else}&nbsp;{/if}
          </span>
          <pre class="diff-text">{line.content}</pre>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .diff-view {
    height: 100%;
    overflow: auto;
    font-family: var(--font-editor);
    font-size: var(--font-editor-size);
    line-height: var(--font-editor-line-height);
  }

  .diff-loading, .diff-empty {
    padding: 24px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
    font-family: var(--font-ui);
  }

  .diff-content {
    min-width: fit-content;
  }

  .diff-line {
    display: flex;
    min-height: 1.4em;
  }

  .diff-line.added {
    background: rgba(74, 222, 128, 0.08);
  }

  .diff-line.removed {
    background: rgba(248, 113, 113, 0.08);
  }

  .diff-line.header {
    background: var(--color-bg-elevated);
    color: var(--color-accent);
    font-weight: 500;
    padding: 4px 0;
    margin-top: 8px;
    border-top: 1px solid var(--color-border-subtle);
  }

  .diff-gutter {
    width: 48px;
    min-width: 48px;
    text-align: right;
    padding-right: 8px;
    color: var(--color-text-muted);
    user-select: none;
    font-variant-numeric: tabular-nums;
    opacity: 0.6;
  }

  .diff-marker {
    width: 20px;
    min-width: 20px;
    text-align: center;
    user-select: none;
    font-weight: 700;
  }

  .diff-line.added .diff-marker {
    color: var(--color-success);
  }

  .diff-line.removed .diff-marker {
    color: var(--color-error);
  }

  .diff-text {
    flex: 1;
    margin: 0;
    padding: 0 8px 0 4px;
    white-space: pre;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }

  .diff-line.added .diff-text {
    color: var(--color-text-primary);
  }

  .diff-line.removed .diff-text {
    color: var(--color-text-secondary);
    opacity: 0.8;
  }
</style>
