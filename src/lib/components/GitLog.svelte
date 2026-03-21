<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { gitRepos } from '$lib/stores/workspace';

  interface GitLogEntry {
    hash: string;
    short_hash: string;
    message: string;
    author: string;
    date: string;
    refs: string;
  }

  interface GraphLine {
    entry: GitLogEntry;
    graphCols: GraphCol[];   // parsed columns from graph output
    graphPrefix: string;     // raw graph prefix chars
  }

  interface GraphCol {
    type: 'dot' | 'line' | 'merge' | 'branch' | 'space';
    colorIndex: number;
  }

  let logEntries = $state<GraphLine[]>([]);
  let selectedRepo = $state('');
  let isLoading = $state(false);
  let maxGraphCols = $state(1);

  const graphColors = [
    '#61afef', // blue
    '#98c379', // green
    '#e5c07b', // yellow
    '#e06c75', // red
    '#c678dd', // purple
    '#56b6c2', // cyan
    '#d19a66', // orange
    '#be5046', // dark red
  ];

  function parseGraphLine(graphStr: string, commitCols: Map<number, number>): { cols: GraphCol[]; updatedMap: Map<number, number> } {
    // graphStr example: "* | | |" or "|\ \|/" etc.
    const cols: GraphCol[] = [];
    const chars = graphStr.split('');
    let colIdx = 0;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === '*') {
        // A commit node — assign a color index to this column
        const colorIdx = colIdx % graphColors.length;
        commitCols.set(colIdx, colorIdx);
        cols.push({ type: 'dot', colorIndex: colorIdx });
        colIdx++;
      } else if (ch === '|') {
        const colorIdx = commitCols.get(colIdx) ?? (colIdx % graphColors.length);
        cols.push({ type: 'line', colorIndex: colorIdx });
        colIdx++;
      } else if (ch === '/' || ch === '\\') {
        const colorIdx = (colIdx % graphColors.length);
        cols.push({ type: 'branch', colorIndex: colorIdx });
        colIdx++;
      } else if (ch === '-') {
        const colorIdx = (colIdx % graphColors.length);
        cols.push({ type: 'merge', colorIndex: colorIdx });
        colIdx++;
      } else if (ch === ' ') {
        cols.push({ type: 'space', colorIndex: 0 });
        colIdx++;
      }
      // skip other chars
    }

    return { cols, updatedMap: commitCols };
  }

  function parseRefs(refs: string): { branches: string[]; tags: string[]; head: string | null } {
    if (!refs.trim()) return { branches: [], tags: [], head: null };
    const parts = refs.split(',').map(s => s.trim()).filter(Boolean);
    const branches: string[] = [];
    const tags: string[] = [];
    let head: string | null = null;

    for (const p of parts) {
      if (p === 'HEAD' || p.startsWith('HEAD -> ')) {
        head = p.replace('HEAD -> ', '');
      } else if (p.startsWith('tag: ')) {
        tags.push(p.replace('tag: ', ''));
      } else if (p.startsWith('origin/')) {
        branches.push(p);
      } else {
        branches.push(p);
      }
    }

    return { branches, tags, head };
  }

  async function loadLog() {
    if (!selectedRepo) return;
    isLoading = true;
    try {
      // Use graph format to get graph characters with commit data
      const rawOutput = await invoke<string>('git_command', {
        repoPath: selectedRepo,
        args: [
          'log',
          '--graph',
          '--pretty=format:COMMIT|%H|%h|%s|%an|%ad|%D',
          '--date=format:%d.%m.%Y, %H:%M',
          '-60',
          '--all',
        ],
      });

      const lines = rawOutput.split('\n').filter(l => l.length > 0);
      const commitCols = new Map<number, number>();
      const result: GraphLine[] = [];
      let maxCols = 1;

      for (const line of lines) {
        const commitIdx = line.indexOf('COMMIT|');
        if (commitIdx >= 0) {
          // This line has a commit
          const graphPart = line.substring(0, commitIdx).trimEnd();
          const dataPart = line.substring(commitIdx + 7);
          const parts = dataPart.split('|');
          const entry: GitLogEntry = {
            hash: parts[0] || '',
            short_hash: parts[1] || '',
            message: parts[2] || '',
            author: parts[3] || '',
            date: parts[4] || '',
            refs: parts[5] || '',
          };
          const { cols } = parseGraphLine(graphPart, commitCols);
          maxCols = Math.max(maxCols, cols.length);
          result.push({ entry, graphCols: cols, graphPrefix: graphPart });
        }
        // Skip pure graph continuation lines (no commit data)
      }

      maxGraphCols = maxCols;
      logEntries = result;
    } catch (e) {
      console.error('Failed to load git log:', e);
      // Fallback to simple log
      try {
        const entries = await invoke<GitLogEntry[]>('get_git_log', {
          repoPath: selectedRepo,
          count: 50,
        });
        logEntries = entries.map((entry, i) => ({
          entry,
          graphCols: [{ type: 'dot' as const, colorIndex: 0 }],
          graphPrefix: '*',
        }));
        maxGraphCols = 1;
      } catch {
        logEntries = [];
      }
    }
    isLoading = false;
  }

  $effect(() => {
    if ($gitRepos.length > 0 && !selectedRepo) {
      selectedRepo = $gitRepos[0];
    }
  });

  $effect(() => {
    if (selectedRepo) {
      loadLog();
    }
  });

  // Column pixel width for the graph area
  const COL_W = 14;
  const COL_H = 24;
</script>

<div class="git-log">
  <div class="log-toolbar">
    {#if $gitRepos.length > 1}
      <select class="repo-select" bind:value={selectedRepo}>
        {#each $gitRepos as repo}
          <option value={repo}>{repo.split('/').pop()}</option>
        {/each}
      </select>
    {:else if $gitRepos.length === 1}
      <span class="repo-name">{$gitRepos[0].split('/').pop()}</span>
    {/if}
    <button class="refresh-btn" onclick={loadLog} title="Refresh">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
      </svg>
    </button>
  </div>

  <div class="log-entries">
    {#each logEntries as gl, i}
      {@const parsed = parseRefs(gl.entry.refs)}
      <div class="log-entry">
        <!-- Graph column: SVG -->
        <div
          class="log-graph-cell"
          style="width: {Math.max(1, gl.graphCols.length) * COL_W}px; min-width: {Math.max(1, gl.graphCols.length) * COL_W}px"
        >
          <svg
            width="{Math.max(1, gl.graphCols.length) * COL_W}"
            height="{COL_H}"
            viewBox="0 0 {Math.max(1, gl.graphCols.length) * COL_W} {COL_H}"
            overflow="visible"
          >
            {#each gl.graphCols as col, ci}
              {@const cx = ci * COL_W + COL_W / 2}
              {@const color = graphColors[col.colorIndex % graphColors.length]}
              {#if col.type === 'dot'}
                <!-- Vertical line through (connect to row above and below) -->
                {#if i > 0}
                  <line x1={cx} y1="0" x2={cx} y2="{COL_H / 2}" stroke={color} stroke-width="1.5" opacity="0.7"/>
                {/if}
                {#if i < logEntries.length - 1}
                  <line x1={cx} y1="{COL_H / 2}" x2={cx} y2="{COL_H}" stroke={color} stroke-width="1.5" opacity="0.7"/>
                {/if}
                <!-- Dot -->
                <circle cx={cx} cy="{COL_H / 2}" r="4" fill={color}/>
                <circle cx={cx} cy="{COL_H / 2}" r="2" fill="var(--color-bg-base)"/>
              {:else if col.type === 'line'}
                <line x1={cx} y1="0" x2={cx} y2="{COL_H}" stroke={color} stroke-width="1.5" opacity="0.7"/>
              {:else if col.type === 'merge'}
                <line x1={cx - COL_W/2} y1="{COL_H / 2}" x2={cx + COL_W/2} y2="{COL_H / 2}" stroke={color} stroke-width="1.5" opacity="0.7"/>
              {:else if col.type === 'branch'}
                <!-- Diagonal line — use actual position -->
                <line x1={cx} y1="0" x2={cx} y2="{COL_H}" stroke={color} stroke-width="1.5" opacity="0.6"/>
              {/if}
            {/each}
          </svg>
        </div>

        <!-- Message + refs -->
        <span class="log-message">
          {gl.entry.message}
          {#if parsed.head}
            <span class="log-ref log-ref-head">HEAD → {parsed.head}</span>
          {/if}
          {#each parsed.branches as branch}
            {#if branch !== parsed.head}
              <span class="log-ref log-ref-branch">{branch}</span>
            {/if}
          {/each}
          {#each parsed.tags as tag}
            <span class="log-ref log-ref-tag">tag: {tag}</span>
          {/each}
        </span>

        <span class="log-author">{gl.entry.author}</span>
        <span class="log-date">{gl.entry.date}</span>
        <span class="log-hash">{gl.entry.short_hash}</span>
      </div>
    {/each}
    {#if logEntries.length === 0 && !isLoading}
      <div class="empty-log">No git history</div>
    {/if}
    {#if isLoading}
      <div class="empty-log">Loading...</div>
    {/if}
  </div>
</div>

<style>
  .git-log {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .log-toolbar {
    padding: 4px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .repo-select {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    font-size: 12px;
    font-family: inherit;
    padding: 2px 6px;
    outline: none;
  }

  .repo-select:focus {
    border-color: var(--color-accent);
  }

  .repo-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .refresh-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .refresh-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .log-entries {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px;
  }

  .log-entry {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 1px 0;
    font-size: 12px;
    min-height: 24px;
  }

  .log-entry:hover {
    background: var(--color-bg-hover);
    border-radius: 4px;
  }

  .log-graph-cell {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .log-message {
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .log-ref {
    flex-shrink: 0;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
    display: inline-block;
    line-height: 1.6;
  }

  .log-ref-head {
    background: var(--color-success);
    color: #000;
    opacity: 0.9;
  }

  .log-ref-branch {
    background: var(--color-accent-subtle);
    color: var(--color-accent);
  }

  .log-ref-tag {
    background: rgba(229, 192, 123, 0.2);
    color: var(--color-warning);
  }

  .log-author {
    color: var(--color-text-muted);
    white-space: nowrap;
    font-size: 11px;
    flex-shrink: 0;
  }

  .log-date {
    color: var(--color-text-muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    flex-shrink: 0;
  }

  .log-hash {
    color: var(--color-text-muted);
    font-family: var(--font-editor);
    font-size: 11px;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .empty-log {
    padding: 20px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }
</style>
