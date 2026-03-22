<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { gitRepos } from '$lib/stores/workspace';
  import { openDiffDialog } from '$lib/stores/diff';

  interface GitLogEntry {
    hash: string;
    short_hash: string;
    message: string;
    author: string;
    date: string;
    refs: string;
  }

  interface GraphLine {
    entry: GitLogEntry | null;
    graphCols: GraphCol[];
    graphPrefix: string;
  }

  interface GraphCol {
    type: 'dot' | 'line' | 'merge' | 'branch-up' | 'branch-down' | 'space';
    colorIndex: number;
  }

  interface ChangedFile {
    status: string;
    path: string;
  }

  let logEntries = $state<GraphLine[]>([]);
  let selectedRepo = $state('');
  let isLoading = $state(false);
  let maxGraphCols = $state(1);

  // Filters
  let filterBranch = $state('--all');
  let filterAuthor = $state('');
  let filterText = $state('');
  let filterDateAfter = $state('');
  let filterDateBefore = $state('');
  let filterPaths = $state('');
  let branches = $state<string[]>([]);
  let authors = $state<string[]>([]);

  // Detail panel
  let selectedEntry = $state<GitLogEntry | null>(null);
  let changedFiles = $state<ChangedFile[]>([]);
  let isLoadingDetail = $state(false);

  // Branch tree
  let localBranches = $state<string[]>([]);
  let remoteBranches = $state<string[]>([]);
  let currentBranch = $state('');
  let showBranchTree = $state(true);

  const graphColors = [
    '#61afef', '#98c379', '#e5c07b', '#e06c75',
    '#c678dd', '#56b6c2', '#d19a66', '#be5046',
  ];

  function parseGraphLine(graphStr: string, commitCols: Map<number, number>): { cols: GraphCol[]; updatedMap: Map<number, number> } {
    const cols: GraphCol[] = [];
    const chars = graphStr.split('');
    let colIdx = 0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === '*') {
        const colorIdx = colIdx % graphColors.length;
        commitCols.set(colIdx, colorIdx);
        cols.push({ type: 'dot', colorIndex: colorIdx });
        colIdx++;
      } else if (ch === '|') {
        const colorIdx = commitCols.get(colIdx) ?? (colIdx % graphColors.length);
        cols.push({ type: 'line', colorIndex: colorIdx });
        colIdx++;
      } else if (ch === '/') {
        cols.push({ type: 'branch-up', colorIndex: colIdx % graphColors.length });
        colIdx++;
      } else if (ch === '\\') {
        cols.push({ type: 'branch-down', colorIndex: colIdx % graphColors.length });
        colIdx++;
      } else if (ch === '-') {
        cols.push({ type: 'merge', colorIndex: colIdx % graphColors.length });
        colIdx++;
      } else if (ch === ' ') {
        cols.push({ type: 'space', colorIndex: 0 });
        colIdx++;
      }
    }
    return { cols, updatedMap: commitCols };
  }

  function parseRefs(refs: string): { branches: string[]; tags: string[]; head: string | null } {
    if (!refs.trim()) return { branches: [], tags: [], head: null };
    const parts = refs.split(',').map(s => s.trim()).filter(Boolean);
    const branchList: string[] = [];
    const tags: string[] = [];
    let head: string | null = null;
    for (const p of parts) {
      if (p === 'HEAD' || p.startsWith('HEAD -> ')) {
        head = p.replace('HEAD -> ', '');
      } else if (p.startsWith('tag: ')) {
        tags.push(p.replace('tag: ', ''));
      } else {
        branchList.push(p);
      }
    }
    return { branches: branchList, tags, head };
  }

  async function loadBranches() {
    if (!selectedRepo) return;
    try {
      const result = await invoke<string[]>('git_branches', { repoPath: selectedRepo });
      localBranches = result;
      // Get current branch
      const status = await invoke<{ branch: string }>('get_git_status', { repoPath: selectedRepo });
      currentBranch = status.branch || '';
    } catch { localBranches = []; }
    try {
      const raw = await invoke<string>('git_command', {
        repoPath: selectedRepo,
        args: ['branch', '-r', '--format=%(refname:short)'],
      });
      remoteBranches = raw.split('\n').filter(b => b.trim() && !b.includes('HEAD'));
    } catch { remoteBranches = []; }
  }

  async function loadLog() {
    if (!selectedRepo) return;
    isLoading = true;
    try {
      const args = ['log', '--graph', '--pretty=format:COMMIT|%H%x00%h%x00%s%x00%an%x00%ad%x00%D',
        '--date=format:%d.%m.%Y, %H:%M', '-100'];
      if (filterBranch !== '--all') {
        args.push(filterBranch);
      } else {
        args.push('--all');
      }
      if (filterAuthor) args.push(`--author=${filterAuthor}`);
      if (filterText) args.push(`--grep=${filterText}`);
      if (filterDateAfter) args.push(`--after=${filterDateAfter}`);
      if (filterDateBefore) args.push(`--before=${filterDateBefore}`);

      const pathsList = filterPaths.split(/[,\s]+/).map(p => p.trim()).filter(Boolean);
      if (pathsList.length > 0) {
        args.push('--');
        args.push(...pathsList);
      }

      const rawOutput = await invoke<string>('git_command', {
        repoPath: selectedRepo, args,
      });

      const lines = rawOutput.split('\n').filter(l => l.length > 0);
      const commitCols = new Map<number, number>();
      const result: GraphLine[] = [];
      let maxCols = 1;
      const authorSet = new Set<string>();

      for (const line of lines) {
        const commitIdx = line.indexOf('COMMIT|');
        if (commitIdx >= 0) {
          const graphPart = line.substring(0, commitIdx).trimEnd();
          const dataPart = line.substring(commitIdx + 7);
          const parts = dataPart.split('\0');
          const entry: GitLogEntry = {
            hash: parts[0] || '', short_hash: parts[1] || '',
            message: parts[2] || '', author: parts[3] || '',
            date: parts[4] || '', refs: parts[5] || '',
          };
          authorSet.add(entry.author);
          const { cols } = parseGraphLine(graphPart, commitCols);
          maxCols = Math.max(maxCols, cols.length);
          result.push({ entry, graphCols: cols, graphPrefix: graphPart });
        } else {
          const trimmed = line.trimEnd();
          if (trimmed.length > 0) {
            const { cols } = parseGraphLine(trimmed, commitCols);
            maxCols = Math.max(maxCols, cols.length);
            result.push({ entry: null, graphCols: cols, graphPrefix: trimmed });
          }
        }
      }

      maxGraphCols = maxCols;
      logEntries = result;
      authors = [...authorSet].sort();
      // Populate branch list for filter
      const allBranches = [...localBranches, ...remoteBranches];
      branches = ['--all', ...allBranches];
    } catch (e) {
      console.error('Failed to load git log:', e);
      try {
        const entries = await invoke<GitLogEntry[]>('get_git_log', { repoPath: selectedRepo, count: 50 });
        logEntries = entries.map(entry => ({
          entry, graphCols: [{ type: 'dot' as const, colorIndex: 0 }], graphPrefix: '*',
        }));
        maxGraphCols = 1;
      } catch { logEntries = []; }
    }
    isLoading = false;
  }

  async function selectCommit(entry: GitLogEntry) {
    selectedEntry = entry;
    isLoadingDetail = true;
    changedFiles = [];
    try {
      const raw = await invoke<string>('git_command', {
        repoPath: selectedRepo,
        args: ['diff-tree', '--no-commit-id', '-r', '--name-status', entry.hash],
      });
      changedFiles = raw.split('\n').filter(l => l.trim()).map(line => {
        const [status, ...pathParts] = line.split('\t');
        return { status: status || '?', path: pathParts.join('\t') };
      });
    } catch { changedFiles = []; }
    isLoadingDetail = false;
  }

  function getStatusLabel(s: string): string {
    if (s === 'M') return 'Modified';
    if (s === 'A') return 'Added';
    if (s === 'D') return 'Deleted';
    if (s === 'R') return 'Renamed';
    return s;
  }

  function getStatusColor(s: string): string {
    if (s === 'M') return 'var(--color-info)';
    if (s === 'A') return 'var(--color-success)';
    if (s === 'D') return 'var(--color-error)';
    return 'var(--color-text-muted)';
  }

  function openFileDiff(file: ChangedFile) {
    if (!selectedEntry || !selectedRepo) return;
    openDiffDialog(selectedRepo, file.path, file.path.split('/').pop() || file.path, false);
  }

  $effect(() => {
    if ($gitRepos.length > 0 && !selectedRepo) {
      selectedRepo = $gitRepos[0];
    }
  });

  $effect(() => {
    if (selectedRepo) {
      loadBranches();
      loadLog();
    }
  });

  const COL_W = 14;
  const COL_H = 24;
</script>

<div class="git-log">
  <!-- Filter toolbar -->
  <div class="log-toolbar">
    {#if $gitRepos.length > 1}
      <select class="toolbar-select" bind:value={selectedRepo} title="Repository">
        {#each $gitRepos as repo}
          <option value={repo}>{repo.split('/').pop()}</option>
        {/each}
      </select>
    {:else if $gitRepos.length === 1}
      <span class="repo-name">{$gitRepos[0].split('/').pop()}</span>
    {/if}

    <select class="toolbar-select" bind:value={filterBranch} onchange={() => loadLog()} title="Branch">
      {#each branches as b}
        <option value={b}>{b === '--all' ? 'All branches' : b}</option>
      {/each}
    </select>

    {#if authors.length > 1}
      <select class="toolbar-select" bind:value={filterAuthor} onchange={() => loadLog()} title="Author">
        <option value="">All authors</option>
        {#each authors as a}
          <option value={a}>{a}</option>
        {/each}
      </select>
    {/if}

    <input
      class="toolbar-input"
      type="text"
      placeholder="Filter messages..."
      bind:value={filterText}
      onkeydown={(e) => { if (e.key === 'Enter') loadLog(); }}
    />

    <input
      class="toolbar-input toolbar-date"
      type="date"
      title="After date"
      bind:value={filterDateAfter}
      onchange={() => loadLog()}
    />
    <input
      class="toolbar-input toolbar-date"
      type="date"
      title="Before date"
      bind:value={filterDateBefore}
      onchange={() => loadLog()}
    />
    <input
      class="toolbar-input"
      type="text"
      placeholder="Paths..."
      title="Filter by file paths (comma separated)"
      bind:value={filterPaths}
      onkeydown={(e) => { if (e.key === 'Enter') loadLog(); }}
    />

    <button class="toolbar-btn" onclick={loadLog} title="Refresh">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
      </svg>
    </button>

    <button class="toolbar-btn" class:active={showBranchTree} onclick={() => showBranchTree = !showBranchTree} title="Toggle branch tree">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="6" y1="3" x2="6" y2="15"/>
        <circle cx="18" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
    </button>
  </div>

  <!-- Three-column layout -->
  <div class="log-body">
    <!-- Left: Branch tree -->
    {#if showBranchTree}
      <div class="branch-tree">
        <div class="branch-section">
          <div class="branch-section-header">HEAD</div>
          {#if currentBranch}
            <button class="branch-item current" onclick={() => { filterBranch = currentBranch; loadLog(); }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="4"/></svg>
              {currentBranch}
            </button>
          {/if}
        </div>
        <div class="branch-section">
          <div class="branch-section-header">Local</div>
          {#each localBranches as b}
            <button
              class="branch-item"
              class:active={filterBranch === b}
              onclick={() => { filterBranch = b; loadLog(); }}
            >{b}</button>
          {/each}
        </div>
        {#if remoteBranches.length > 0}
          <div class="branch-section">
            <div class="branch-section-header">Remote</div>
            {#each remoteBranches as b}
              <button
                class="branch-item"
                class:active={filterBranch === b}
                onclick={() => { filterBranch = b; loadLog(); }}
              >{b}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Center: Commit log table -->
    <div class="log-entries">
      {#each logEntries as gl, i}
        {#if gl.entry}
          {@const parsed = parseRefs(gl.entry.refs)}
          {@const rowH = COL_H}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="log-entry"
            class:selected={selectedEntry?.hash === gl.entry.hash}
            onclick={() => gl.entry && selectCommit(gl.entry)}
          >
            <div
              class="log-graph-cell"
              style="width: {Math.max(1, gl.graphCols.length) * COL_W}px; min-width: {Math.max(1, gl.graphCols.length) * COL_W}px"
            >
              <svg
                width="{Math.max(1, gl.graphCols.length) * COL_W}"
                height="{rowH}"
                viewBox="0 0 {Math.max(1, gl.graphCols.length) * COL_W} {rowH}"
                overflow="visible"
              >
                {#each gl.graphCols as col, ci}
                  {@const cx = ci * COL_W + COL_W / 2}
                  {@const color = graphColors[col.colorIndex % graphColors.length]}
                  {#if col.type === 'dot'}
                    {#if i > 0}<line x1={cx} y1="0" x2={cx} y2="{rowH / 2}" stroke={color} stroke-width="1.5" opacity="0.7"/>{/if}
                    {#if i < logEntries.length - 1}<line x1={cx} y1="{rowH / 2}" x2={cx} y2="{rowH}" stroke={color} stroke-width="1.5" opacity="0.7"/>{/if}
                    <circle cx={cx} cy="{rowH / 2}" r="4" fill={color}/>
                    <circle cx={cx} cy="{rowH / 2}" r="2" fill="var(--color-bg-base)"/>
                  {:else if col.type === 'line'}
                    <line x1={cx} y1="0" x2={cx} y2="{rowH}" stroke={color} stroke-width="1.5" opacity="0.7"/>
                  {:else if col.type === 'merge'}
                    <line x1={cx - COL_W/2} y1="{rowH / 2}" x2={cx + COL_W/2} y2="{rowH / 2}" stroke={color} stroke-width="1.5" opacity="0.7"/>
                  {:else if col.type === 'branch-up'}
                    <line x1={cx + COL_W/2} y1="0" x2={cx - COL_W/2} y2="{rowH}" stroke={color} stroke-width="1.5" opacity="0.6"/>
                  {:else if col.type === 'branch-down'}
                    <line x1={cx - COL_W/2} y1="0" x2={cx + COL_W/2} y2="{rowH}" stroke={color} stroke-width="1.5" opacity="0.6"/>
                  {/if}
                {/each}
              </svg>
            </div>

            {#if parsed.head || parsed.branches.length > 0 || parsed.tags.length > 0}
              <span class="log-refs">
                {#if parsed.head}<span class="log-ref log-ref-head">HEAD → {parsed.head}</span>{/if}
                {#each parsed.branches as branch}
                  {#if branch !== parsed.head}<span class="log-ref log-ref-branch">{branch}</span>{/if}
                {/each}
                {#each parsed.tags as tag}<span class="log-ref log-ref-tag">tag: {tag}</span>{/each}
              </span>
            {/if}

            <span class="log-message">{gl.entry.message}</span>
            <span class="log-author">{gl.entry.author}</span>
            <span class="log-date">{gl.entry.date}</span>
            <span class="log-hash">{gl.entry.short_hash}</span>
          </div>
        {:else}
          {@const contH = 10}
          <div class="log-entry-continuation">
            <div
              class="log-graph-cell"
              style="width: {Math.max(1, gl.graphCols.length) * COL_W}px; min-width: {Math.max(1, gl.graphCols.length) * COL_W}px"
            >
              <svg
                width="{Math.max(1, gl.graphCols.length) * COL_W}"
                height="{contH}"
                viewBox="0 0 {Math.max(1, gl.graphCols.length) * COL_W} {contH}"
                overflow="visible"
              >
                {#each gl.graphCols as col, ci}
                  {@const cx = ci * COL_W + COL_W / 2}
                  {@const color = graphColors[col.colorIndex % graphColors.length]}
                  {#if col.type === 'line'}
                    <line x1={cx} y1="0" x2={cx} y2="{contH}" stroke={color} stroke-width="1.5" opacity="0.7"/>
                  {:else if col.type === 'merge'}
                    <line x1={cx - COL_W/2} y1="{contH / 2}" x2={cx + COL_W/2} y2="{contH / 2}" stroke={color} stroke-width="1.5" opacity="0.7"/>
                  {:else if col.type === 'branch-up'}
                    <line x1={cx + COL_W/2} y1="0" x2={cx - COL_W/2} y2="{contH}" stroke={color} stroke-width="1.5" opacity="0.6"/>
                  {:else if col.type === 'branch-down'}
                    <line x1={cx - COL_W/2} y1="0" x2={cx + COL_W/2} y2="{contH}" stroke={color} stroke-width="1.5" opacity="0.6"/>
                  {/if}
                {/each}
              </svg>
            </div>
          </div>
        {/if}
      {/each}
      {#if logEntries.length === 0 && !isLoading}
        <div class="empty-log">No git history</div>
      {/if}
      {#if isLoading}
        <div class="empty-log">Loading...</div>
      {/if}
    </div>

    <!-- Right: Commit detail panel -->
    {#if selectedEntry}
      <div class="commit-detail">
        <div class="detail-header">
          <span class="detail-hash">{selectedEntry.short_hash}</span>
          <button class="detail-close" onclick={() => selectedEntry = null}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
        <div class="detail-body">
          <div class="detail-message">{selectedEntry.message}</div>
          <div class="detail-meta">
            <div class="detail-row">
              <span class="detail-label">Author</span>
              <span class="detail-value">{selectedEntry.author}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date</span>
              <span class="detail-value">{selectedEntry.date}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Hash</span>
              <span class="detail-value mono">{selectedEntry.hash}</span>
            </div>
          </div>

          <div class="detail-files-header">
            Changed Files ({changedFiles.length})
          </div>
          {#if isLoadingDetail}
            <div class="detail-loading">Loading...</div>
          {:else}
            <div class="detail-files">
              {#each changedFiles as file}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="detail-file" onclick={() => openFileDiff(file)}>
                  <span class="file-status" style="color: {getStatusColor(file.status)}" title={getStatusLabel(file.status)}>
                    {file.status}
                  </span>
                  <span class="file-path">{file.path}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
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
    padding: 4px 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .toolbar-select {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    font-size: 11px;
    font-family: inherit;
    padding: 2px 6px;
    outline: none;
    max-width: 140px;
  }

  .toolbar-select:focus { border-color: var(--color-accent); }

  .toolbar-input {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    font-size: 11px;
    font-family: inherit;
    padding: 2px 6px;
    outline: none;
    flex: 1;
    min-width: 80px;
    max-width: 180px;
  }

  .toolbar-input:focus { border-color: var(--color-accent); }
  .toolbar-input::placeholder { color: var(--color-text-muted); }
  .toolbar-date { max-width: 120px; }

  .repo-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .toolbar-btn {
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
    flex-shrink: 0;
  }

  .toolbar-btn:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
  .toolbar-btn.active { color: var(--color-accent); }

  /* Three-column layout */
  .log-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* Branch tree */
  .branch-tree {
    width: 160px;
    flex-shrink: 0;
    border-right: 1px solid var(--color-border-subtle);
    overflow-y: auto;
    padding: 4px 0;
  }

  .branch-section { margin-bottom: 4px; }

  .branch-section-header {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-muted);
    padding: 4px 10px 2px;
  }

  .branch-item {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 2px 10px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background 0.1s;
  }

  .branch-item:hover { background: var(--color-bg-hover); }
  .branch-item.active { color: var(--color-accent); background: var(--color-bg-active); }
  .branch-item.current { font-weight: 600; color: var(--color-success); }

  /* Commit log */
  .log-entries {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px;
    min-width: 0;
  }

  .log-entry {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 1px 4px;
    font-size: 12px;
    min-height: 24px;
    cursor: pointer;
    border-radius: 4px;
  }

  .log-entry:hover { background: var(--color-bg-hover); }
  .log-entry.selected { background: var(--color-bg-active); }

  .log-entry-continuation {
    display: flex;
    align-items: center;
    min-height: 10px;
    padding: 0 4px;
    cursor: default;
  }

  .log-graph-cell { flex-shrink: 0; display: flex; align-items: center; }
  .log-refs { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .log-message { color: var(--color-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }

  .log-ref { flex-shrink: 0; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 600; display: inline-block; line-height: 1.6; }
  .log-ref-head { background: var(--color-success); color: #000; opacity: 0.9; }
  .log-ref-branch { background: var(--color-accent-subtle); color: var(--color-accent); }
  .log-ref-tag { background: rgba(229, 192, 123, 0.2); color: var(--color-warning); }

  .log-author { color: var(--color-text-muted); white-space: nowrap; font-size: 11px; flex-shrink: 0; }
  .log-date { color: var(--color-text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 11px; flex-shrink: 0; }
  .log-hash { color: var(--color-text-muted); font-family: var(--font-editor); font-size: 11px; opacity: 0.7; flex-shrink: 0; }
  .empty-log { padding: 20px; text-align: center; color: var(--color-text-muted); font-size: 12px; }

  /* Commit detail panel */
  .commit-detail {
    width: 280px;
    flex-shrink: 0;
    border-left: 1px solid var(--color-border-subtle);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  .detail-hash {
    font-family: var(--font-editor);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-accent);
  }

  .detail-close {
    width: 20px; height: 20px; border-radius: 4px; border: none;
    background: transparent; color: var(--color-text-muted); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.1s;
  }
  .detail-close:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }

  .detail-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 10px;
  }

  .detail-message {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary);
    margin-bottom: 12px;
    line-height: 1.4;
    word-break: break-word;
  }

  .detail-meta { margin-bottom: 12px; }

  .detail-row {
    display: flex;
    gap: 8px;
    font-size: 11px;
    margin-bottom: 4px;
  }

  .detail-label {
    color: var(--color-text-muted);
    min-width: 44px;
    flex-shrink: 0;
  }

  .detail-value {
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail-value.mono {
    font-family: var(--font-editor);
    font-size: 10px;
  }

  .detail-files-header {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-muted);
    margin-bottom: 4px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .detail-loading {
    font-size: 11px;
    color: var(--color-text-muted);
    padding: 8px 0;
  }

  .detail-files { display: flex; flex-direction: column; gap: 1px; }

  .detail-file {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 4px;
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.1s;
  }

  .detail-file:hover { background: var(--color-bg-hover); }

  .file-status {
    font-size: 10px;
    font-weight: 700;
    font-family: var(--font-editor);
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  }

  .file-path {
    font-size: 11px;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
