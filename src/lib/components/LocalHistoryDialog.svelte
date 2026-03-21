<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';

  let {
    filePath = '',
    currentContent = '',
    onclose,
    onrestore,
  }: {
    filePath: string;
    currentContent: string;
    onclose: () => void;
    onrestore: (content: string) => void;
  } = $props();

  interface HistoryEntry {
    timestamp: number;
    size: number;
  }

  interface DiffLine {
    type: 'added' | 'removed' | 'context';
    content: string;
    lineNo: number;
  }

  let entries = $state<HistoryEntry[]>([]);
  let selectedTimestamp = $state<number | null>(null);
  let selectedContent = $state<string>('');
  let isLoading = $state(false);
  let isLoadingContent = $state(false);

  function formatTimestamp(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - ts;
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago — ${timeStr}`;
    if (diffH < 24) return `${diffH}h ago — ${timeStr}`;
    if (diffDays < 7) return `${diffDays}d ago — ${dateStr} ${timeStr}`;
    return `${dateStr} ${timeStr}`;
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  // Compute simple line-level diff between two texts
  function computeDiff(oldText: string, newText: string): DiffLine[] {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    // Simple LCS-based diff (Myers-like, but simplified)
    const result: DiffLine[] = [];

    // Build a map of line -> positions in old
    const oldMap = new Map<string, number[]>();
    oldLines.forEach((line, i) => {
      if (!oldMap.has(line)) oldMap.set(line, []);
      oldMap.get(line)!.push(i);
    });

    // Use patience diff approach (simplified)
    let oi = 0, ni = 0;
    let lineNo = 1;

    while (oi < oldLines.length || ni < newLines.length) {
      if (oi >= oldLines.length) {
        // All remaining new lines are additions
        result.push({ type: 'added', content: newLines[ni], lineNo: ni + 1 });
        ni++;
      } else if (ni >= newLines.length) {
        // All remaining old lines are removals
        result.push({ type: 'removed', content: oldLines[oi], lineNo: oi + 1 });
        oi++;
      } else if (oldLines[oi] === newLines[ni]) {
        result.push({ type: 'context', content: newLines[ni], lineNo: ni + 1 });
        oi++;
        ni++;
      } else {
        // Look ahead to find next match
        let foundInNew = -1;
        let foundInOld = -1;
        for (let look = 1; look <= 6; look++) {
          if (ni + look < newLines.length && newLines[ni + look] === oldLines[oi]) {
            foundInNew = look;
            break;
          }
          if (oi + look < oldLines.length && oldLines[oi + look] === newLines[ni]) {
            foundInOld = look;
            break;
          }
        }
        if (foundInNew !== -1) {
          for (let k = 0; k < foundInNew; k++) {
            result.push({ type: 'added', content: newLines[ni], lineNo: ni + 1 });
            ni++;
          }
        } else if (foundInOld !== -1) {
          for (let k = 0; k < foundInOld; k++) {
            result.push({ type: 'removed', content: oldLines[oi], lineNo: oi + 1 });
            oi++;
          }
        } else {
          result.push({ type: 'removed', content: oldLines[oi], lineNo: oi + 1 });
          result.push({ type: 'added', content: newLines[ni], lineNo: ni + 1 });
          oi++;
          ni++;
        }
      }
    }

    return result;
  }

  let diffLines = $derived(
    selectedContent ? computeDiff(selectedContent, currentContent) : []
  );

  let hasChanges = $derived(
    diffLines.some(l => l.type !== 'context')
  );

  async function loadHistory() {
    if (!filePath) return;
    isLoading = true;
    try {
      entries = await invoke<HistoryEntry[]>('get_local_history', { filePath });
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      isLoading = false;
    }
  }

  async function selectEntry(ts: number) {
    selectedTimestamp = ts;
    isLoadingContent = true;
    try {
      selectedContent = await invoke<string>('get_local_history_content', {
        filePath,
        timestamp: ts,
      });
    } catch (e) {
      console.error('Failed to load snapshot:', e);
      selectedContent = '';
    } finally {
      isLoadingContent = false;
    }
  }

  function handleRestore() {
    if (selectedContent) {
      onrestore(selectedContent);
      onclose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  // Load history when dialog opens
  $effect(() => {
    if (filePath) {
      loadHistory();
    }
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="dialog-backdrop" onclick={onclose} onkeydown={handleKeydown} role="dialog" aria-modal="true">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <div class="dialog-header">
      <div class="dialog-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Local History
      </div>
      <div class="dialog-subtitle">{filePath.split('/').pop()}</div>
      <button class="dialog-close" onclick={onclose} aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>

    <div class="dialog-body">
      <!-- Left: timeline -->
      <div class="history-list">
        {#if isLoading}
          <div class="history-empty">Loading...</div>
        {:else if entries.length === 0}
          <div class="history-empty">No history yet</div>
        {:else}
          {#each entries as entry}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="history-entry"
              class:selected={selectedTimestamp === entry.timestamp}
              onclick={() => selectEntry(entry.timestamp)}
              onkeydown={(e) => e.key === 'Enter' && selectEntry(entry.timestamp)}
              role="option"
              aria-selected={selectedTimestamp === entry.timestamp}
              tabindex="0"
            >
              <div class="entry-time">{formatTimestamp(entry.timestamp)}</div>
              <div class="entry-size">{formatSize(entry.size)}</div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Right: diff view -->
      <div class="diff-panel">
        {#if !selectedTimestamp}
          <div class="diff-placeholder">Select a snapshot to view changes</div>
        {:else if isLoadingContent}
          <div class="diff-placeholder">Loading...</div>
        {:else if !hasChanges}
          <div class="diff-placeholder">No changes between snapshot and current file</div>
        {:else}
          <div class="diff-legend">
            <span class="legend-removed">- Snapshot</span>
            <span class="legend-added">+ Current</span>
          </div>
          <div class="diff-content">
            {#each diffLines as line}
              <div class="diff-line diff-{line.type}">
                <span class="diff-marker">
                  {#if line.type === 'added'}+{:else if line.type === 'removed'}-{:else}&nbsp;{/if}
                </span>
                <pre class="diff-text">{line.content}</pre>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="dialog-footer">
      <button class="btn-secondary" onclick={onclose}>Cancel</button>
      <button
        class="btn-primary"
        onclick={handleRestore}
        disabled={!selectedContent}
      >
        Restore Version
      </button>
    </div>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .dialog {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    width: 860px;
    max-width: 96vw;
    height: 560px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }

  .dialog-header {
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .dialog-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .dialog-subtitle {
    font-size: 12px;
    color: var(--color-text-muted);
    flex: 1;
  }

  .dialog-close {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .dialog-close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .dialog-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  .history-list {
    width: 220px;
    flex-shrink: 0;
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
    padding: 8px 0;
  }

  .history-empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .history-entry {
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.1s;
    border-left: 3px solid transparent;
  }

  .history-entry:hover {
    background: var(--color-bg-hover);
  }

  .history-entry.selected {
    background: var(--color-bg-active);
    border-left-color: var(--color-accent);
  }

  .entry-time {
    font-size: 12px;
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .entry-size {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .diff-panel {
    flex: 1;
    overflow: auto;
    min-width: 0;
  }

  .diff-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .diff-legend {
    display: flex;
    gap: 16px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--color-border-subtle);
    font-size: 11px;
  }

  .legend-removed {
    color: var(--color-error, #f87171);
  }

  .legend-added {
    color: var(--color-success, #4ade80);
  }

  .diff-content {
    font-family: var(--font-editor, monospace);
    font-size: 12px;
    line-height: 1.5;
  }

  .diff-line {
    display: flex;
    min-height: 1.5em;
  }

  .diff-line.diff-added {
    background: rgba(74, 222, 128, 0.08);
  }

  .diff-line.diff-removed {
    background: rgba(248, 113, 113, 0.08);
  }

  .diff-marker {
    width: 24px;
    min-width: 24px;
    text-align: center;
    user-select: none;
    font-weight: 700;
    padding-top: 1px;
  }

  .diff-line.diff-added .diff-marker {
    color: var(--color-success, #4ade80);
  }

  .diff-line.diff-removed .diff-marker {
    color: var(--color-error, #f87171);
  }

  .diff-text {
    flex: 1;
    margin: 0;
    padding: 0 8px 0 4px;
    white-space: pre;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    color: var(--color-text-primary);
  }

  .diff-line.diff-removed .diff-text {
    color: var(--color-text-secondary);
    opacity: 0.8;
  }

  .dialog-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-shrink: 0;
  }

  .btn-primary,
  .btn-secondary {
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .btn-secondary {
    background: transparent;
    color: var(--color-text-secondary);
    border-color: var(--color-border);
  }

  .btn-secondary:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
</style>
