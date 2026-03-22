<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { gitRepos } from '$lib/stores/workspace';
  import { openDiffDialog } from '$lib/stores/diff';
  import { showToast } from '$lib/stores/notifications';

  interface CommitEntry {
    short_hash: string;
    message: string;
    author: string;
    date: string;
  }

  interface ChangedFile {
    relative_path: string;
    status: string;
  }

  interface RepoForPush {
    repoPath: string;
    name: string;
    branch: string;
    ahead: number;
    selected: boolean;
    expanded: boolean;
    commits: CommitEntry[];
  }

  let isOpen = $state(false);
  let repos = $state<RepoForPush[]>([]);
  let isPushing = $state(false);
  let pushResult = $state<string | null>(null);
  let selectedRepoIndex = $state<number>(-1);
  let selectedCommitIndex = $state<number>(0);
  let commitFiles = $state<ChangedFile[]>([]);
  let loadingFiles = $state(false);
  let selectedFileIndex = $state<number>(-1);
  let runGitHooks = $state(true);
  let pushTags = $state(false);

  // Group files by directory for tree display
  let groupedCommitFiles = $derived.by(() => {
    const groups = new Map<string, { dirPath: string; files: ChangedFile[]; expanded: boolean }>();
    for (const f of commitFiles) {
      const parts = f.relative_path.split('/');
      parts.pop(); // remove filename
      const dir = parts.join('/') || '.';
      if (!groups.has(dir)) groups.set(dir, { dirPath: dir, files: [], expanded: true });
      groups.get(dir)!.files.push(f);
    }
    return [...groups.values()].sort((a, b) => a.dirPath.localeCompare(b.dirPath));
  });

  // Collapsible dir state (separate from derived since we need mutation)
  let collapsedDirs = $state<Set<string>>(new Set());

  function toggleDirCollapse(dir: string) {
    if (collapsedDirs.has(dir)) {
      collapsedDirs = new Set([...collapsedDirs].filter(d => d !== dir));
    } else {
      collapsedDirs = new Set([...collapsedDirs, dir]);
    }
  }

  // Drag-to-move state
  let dialogX = $state<number | null>(null);
  let dialogY = $state<number | null>(null);
  let dialogW = $state(750);
  let dialogH = $state(450);

  function startDrag(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    e.preventDefault();
    const startMX = e.clientX;
    const startMY = e.clientY;
    const startX = dialogX ?? (window.innerWidth / 2 - dialogW / 2);
    const startY = dialogY ?? (window.innerHeight / 2 - dialogH / 2);

    function onMove(ev: MouseEvent) {
      dialogX = startX + (ev.clientX - startMX);
      dialogY = startY + (ev.clientY - startMY);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startResize(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startMX = e.clientX;
    const startMY = e.clientY;
    const startW = dialogW;
    const startH = dialogH;

    function onMove(ev: MouseEvent) {
      dialogW = Math.max(500, startW + (ev.clientX - startMX));
      dialogH = Math.max(350, startH + (ev.clientY - startMY));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function loadRepos() {
    const repoPaths = $gitRepos;
    const items: RepoForPush[] = [];

    for (const repoPath of repoPaths) {
      try {
        const status = await invoke<any>('get_git_status', { repoPath });
        let commits: CommitEntry[] = [];

        if (status.ahead > 0) {
          try {
            const log = await invoke<string>('git_command', {
              repoPath,
              args: ['log', `-${status.ahead}`, '--pretty=format:%h%x00%s%x00%an%x00%ar'],
            });
            commits = log.split('\n').filter((l: string) => l.trim()).map((l: string) => {
              const parts = l.split('\0');
              return {
                short_hash: parts[0] || '',
                message: parts[1] || '',
                author: parts[2] || '',
                date: parts[3] || '',
              };
            });
          } catch {}
        }

        items.push({
          repoPath,
          name: status.name,
          branch: status.branch,
          ahead: status.ahead,
          selected: status.ahead > 0,
          expanded: status.ahead > 0,
          commits,
        });
      } catch (e) {
        console.error('Failed to get status:', e);
      }
    }

    repos = items;

    // Auto-select first repo that has commits
    const firstWithCommits = items.findIndex(r => r.ahead > 0);
    selectedRepoIndex = firstWithCommits >= 0 ? firstWithCommits : (items.length > 0 ? 0 : -1);
    selectedCommitIndex = 0;
    if (selectedRepoIndex >= 0) {
      await loadCommitFiles(selectedRepoIndex, 0);
    }
  }

  async function loadCommitFiles(repoIdx: number, commitIdx: number) {
    const repo = repos[repoIdx];
    if (!repo || repo.commits.length === 0) {
      commitFiles = [];
      return;
    }
    const commit = repo.commits[commitIdx];
    if (!commit) { commitFiles = []; return; }

    loadingFiles = true;
    try {
      const output = await invoke<string>('git_command', {
        repoPath: repo.repoPath,
        args: ['diff-tree', '--no-commit-id', '-r', '--name-status', commit.short_hash],
      });
      commitFiles = output.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split('\t');
        const statusLetter = parts[0]?.trim() || '';
        // Renamed files have format: R100\told_path\tnew_path
        const filePath = statusLetter.startsWith('R') && parts[2]
          ? parts[2].trim()
          : parts[1]?.trim() || line.trim();
        return {
          status: statusFromLetter(statusLetter),
          relative_path: filePath,
        };
      });
    } catch {
      commitFiles = [];
    }
    loadingFiles = false;
  }

  function statusFromLetter(letter: string): string {
    if (letter.startsWith('R')) return 'renamed';
    switch (letter) {
      case 'M': return 'modified';
      case 'A': return 'added';
      case 'D': return 'deleted';
      case 'C': return 'copied';
      default: return 'modified';
    }
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'modified': return 'var(--color-info)';
      case 'added': return 'var(--color-success)';
      case 'deleted': return 'var(--color-error)';
      default: return 'var(--color-text-muted)';
    }
  }

  function statusLetter(status: string): string {
    switch (status) {
      case 'modified': return 'M';
      case 'added': return 'A';
      case 'deleted': return 'D';
      default: return '?';
    }
  }

  async function selectRepo(idx: number) {
    selectedRepoIndex = idx;
    selectedCommitIndex = 0;
    await loadCommitFiles(idx, 0);
  }

  async function selectCommit(repoIdx: number, commitIdx: number) {
    selectedCommitIndex = commitIdx;
    selectedFileIndex = -1;
    await loadCommitFiles(repoIdx, commitIdx);
  }

  function openSelectedFileDiff() {
    if (selectedFileIndex < 0 || selectedFileIndex >= commitFiles.length) return;
    if (selectedRepoIndex < 0) return;
    const repo = repos[selectedRepoIndex];
    if (!repo) return;
    const f = commitFiles[selectedFileIndex];
    const fileName = f.relative_path.split('/').pop() || f.relative_path;
    // Diffs for committed files — use staged=false (it's a historical diff)
    openDiffDialog(repo.repoPath, f.relative_path, fileName, false);
  }

  let dialogEl: HTMLDivElement | undefined;

  function open() {
    isOpen = true;
    pushResult = null;
    commitFiles = [];
    selectedFileIndex = -1;
    loadRepos();
    requestAnimationFrame(() => dialogEl?.focus());
  }

  function close() {
    isOpen = false;
    pushResult = null;
  }

  async function doPush() {
    const selected = repos.filter(r => r.selected);
    if (selected.length === 0) return;

    isPushing = true;
    pushResult = null;
    let successCount = 0;
    let errors: string[] = [];

    for (const repo of selected) {
      try {
        const pushArgs = ['push'];
        if (!runGitHooks) pushArgs.push('--no-verify');
        if (pushTags) pushArgs.push('--tags');

        try {
          await invoke<string>('git_command', {
            repoPath: repo.repoPath,
            args: pushArgs,
          });
        } catch {
          // If push fails (e.g. no upstream), try with --set-upstream
          const branch = await invoke<string>('git_command', {
            repoPath: repo.repoPath,
            args: ['rev-parse', '--abbrev-ref', 'HEAD'],
          });
          const upstreamArgs = ['push', '--set-upstream', 'origin', branch.trim()];
          if (!runGitHooks) upstreamArgs.push('--no-verify');
          if (pushTags) upstreamArgs.push('--tags');
          await invoke<string>('git_command', {
            repoPath: repo.repoPath,
            args: upstreamArgs,
          });
        }
        successCount++;
      } catch (e: any) {
        errors.push(`${repo.name}: ${e}`);
      }
    }

    isPushing = false;
    if (errors.length > 0) {
      const msg = `Pushed ${successCount}. Errors: ${errors.join('; ')}`;
      pushResult = msg;
      showToast(msg, 'error');
    } else {
      const msg = `Pushed ${successCount} repo(s) successfully`;
      pushResult = msg;
      showToast(msg, 'success');
      setTimeout(close, 1500);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { close(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      doPush();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      openSelectedFileDiff();
      return;
    }
  }

  function globalKeyHandler(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k' && !isOpen) {
      e.preventDefault();
      open();
    }
  }

  onMount(() => { window.addEventListener('keydown', globalKeyHandler); });
  onDestroy(() => { window.removeEventListener('keydown', globalKeyHandler); });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog-container" bind:this={dialogEl} style="{dialogX !== null ? `left: ${dialogX}px; top: ${dialogY}px; transform: none;` : ''}" onkeydown={handleKeydown} tabindex="-1">
    <div class="dialog" style="width: {dialogW}px; height: {dialogH}px;">

      <!-- Title bar (drag handle) -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="title-bar" onmousedown={startDrag} style="cursor: move;">
        <span class="title-text">Push Commits</span>
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button class="close-btn" onclick={close}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>

      <!-- Two-pane body -->
      <div class="body">

        <!-- LEFT PANE: repo list -->
        <div class="left-pane">
          <div class="pane-header">Repositories</div>
          <div class="repo-list">
            {#each repos as repo, i}
              <div class="repo-group">
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="repo-row"
                  class:repo-row-selected={selectedRepoIndex === i}
                  class:repo-row-dimmed={repo.ahead === 0}
                  onclick={() => selectRepo(i)}
                >
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <input
                    type="checkbox"
                    class="cb"
                    checked={repo.selected}
                    disabled={repo.ahead === 0}
                    onclick={(e) => { e.stopPropagation(); if (repo.ahead > 0) repos[i].selected = !repos[i].selected; }}
                  />
                  <div class="repo-info">
                    <span class="repo-name" class:repo-name-dimmed={repo.ahead === 0}>{repo.name}</span>
                    <span class="repo-branch-mapping">
                      {repo.branch}
                      <svg class="arrow-icon" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/>
                      </svg>
                      origin : <strong>{repo.branch}</strong>
                    </span>
                  </div>
                  {#if repo.ahead > 0}
                    <span class="ahead-badge">↑{repo.ahead}</span>
                  {:else}
                    <span class="uptodate-badge">up to date</span>
                  {/if}
                </div>

                {#if repo.ahead > 0 && repo.expanded}
                  <div class="commit-list">
                    {#each repo.commits as commit, ci}
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="commit-row"
                        class:commit-row-selected={selectedRepoIndex === i && selectedCommitIndex === ci}
                        onclick={() => { selectRepo(i); selectCommit(i, ci); }}
                      >
                        <span class="commit-dot">●</span>
                        <span class="commit-msg">{commit.message}</span>
                        <span class="commit-hash">{commit.short_hash}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}

            {#if repos.length === 0}
              <div class="empty-state">No git repos found</div>
            {/if}
          </div>
        </div>

        <!-- Vertical divider -->
        <div class="pane-divider"></div>

        <!-- RIGHT PANE: commit details -->
        <div class="right-pane">
          {#if selectedRepoIndex >= 0 && repos[selectedRepoIndex]}
            {@const repo = repos[selectedRepoIndex]}
            {@const commit = repo.commits[selectedCommitIndex]}
            <div class="pane-header">
              {repo.name}
              {#if commitFiles.length > 0}
                <span class="detail-file-count">{commitFiles.length} file{commitFiles.length !== 1 ? 's' : ''}</span>
              {/if}
            </div>

            <div class="detail-files">
              {#if loadingFiles}
                <div class="detail-loading">Loading...</div>
              {:else if commitFiles.length > 0}
                {#each groupedCommitFiles as group}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="dir-group-header" onclick={() => toggleDirCollapse(group.dirPath)}>
                    <span class="dir-chevron" class:dir-expanded={!collapsedDirs.has(group.dirPath)}>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                      </svg>
                    </span>
                    <svg class="dir-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"/>
                    </svg>
                    <span class="dir-path">{group.dirPath}</span>
                    <span class="dir-count">{group.files.length}</span>
                  </div>
                  {#if !collapsedDirs.has(group.dirPath)}
                    {#each group.files as f}
                      {@const globalIdx = commitFiles.indexOf(f)}
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="detail-file-row detail-file-indented"
                        class:detail-file-selected={selectedFileIndex === globalIdx}
                        onclick={() => { selectedFileIndex = globalIdx; }}
                        ondblclick={() => { selectedFileIndex = globalIdx; openSelectedFileDiff(); }}
                        role="button"
                        tabindex="0"
                        onkeydown={(e) => { if (e.key === 'Enter') { selectedFileIndex = globalIdx; openSelectedFileDiff(); } }}
                      >
                        <span class="detail-status" style="color: {statusColor(f.status)}">{statusLetter(f.status)}</span>
                        <span class="detail-filename">{f.relative_path.split('/').pop()}</span>
                      </div>
                    {/each}
                  {/if}
                {/each}
              {:else if commit}
                <div class="empty-state">No file changes found</div>
              {:else if repo.ahead === 0}
                <div class="empty-state">Repository is up to date</div>
              {:else}
                <div class="empty-state">Select a commit to view changes</div>
              {/if}
            </div>

            {#if commit}
              <div class="commit-meta">
                <div class="meta-row">
                  <span class="meta-label">Commit</span>
                  <span class="meta-value meta-hash">{commit.short_hash}</span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">Author</span>
                  <span class="meta-value">{commit.author}</span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">Date</span>
                  <span class="meta-value">{commit.date}</span>
                </div>
                <div class="meta-row meta-message-row">
                  <span class="meta-message">{commit.message}</span>
                </div>
              </div>
            {:else if repo.ahead === 0}
              <div class="uptodate-detail">
                <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" style="color: var(--color-success); opacity: 0.7">
                  <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
                </svg>
                <span>Up to date with origin</span>
              </div>
            {/if}
          {:else}
            <div class="empty-state" style="margin-top: 40px">Select a repository</div>
          {/if}
        </div>
      </div>

      {#if pushResult}
        <div class="push-result" class:result-error={pushResult.includes('Error')}>
          {pushResult}
        </div>
      {/if}

      <!-- Footer -->
      <div class="dialog-footer">
        <div class="footer-options">
          <label class="footer-cb-label">
            <input type="checkbox" class="cb" bind:checked={runGitHooks} />
            <span>Run git hooks</span>
          </label>
          <label class="footer-cb-label">
            <input type="checkbox" class="cb" bind:checked={pushTags} />
            <span>Push tags</span>
          </label>
        </div>
        <div class="footer-actions">
          <button class="btn-secondary" onclick={close}>Cancel</button>
          <button
            class="btn-primary"
            onclick={doPush}
            disabled={repos.filter(r => r.selected).length === 0 || isPushing}
          >
            {isPushing ? 'Pushing...' : 'Push'}
          </button>
        </div>
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resize-handle" onmousedown={startResize}></div>
    </div>
  </div>
{/if}

<style>
  .dialog-container {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 200;
    outline: none;
  }

  .dialog {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.04);
    animation: dialogIn 0.12s ease-out;
  }

  @keyframes dialogIn {
    from { opacity: 0; transform: scale(0.97) translateY(-4px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
  }

  .resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
    z-index: 10;
  }

  .resize-handle::after {
    content: '';
    position: absolute;
    bottom: 3px;
    right: 3px;
    width: 8px;
    height: 8px;
    border-right: 2px solid var(--color-text-muted);
    border-bottom: 2px solid var(--color-text-muted);
    opacity: 0.4;
  }

  /* ── Title bar ── */
  .title-bar {
    display: flex;
    align-items: center;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    height: 32px;
    padding: 0 8px 0 14px;
    flex-shrink: 0;
  }

  .title-text {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .close-btn {
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
  }

  .close-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  /* ── Two-pane body ── */
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  .pane-divider {
    width: 1px;
    background: var(--color-border);
    flex-shrink: 0;
  }

  /* Shared pane header */
  .pane-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .detail-file-count {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-text-muted);
    font-size: 11px;
  }

  /* ── LEFT PANE ── */
  .left-pane {
    width: 55%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .repo-list {
    flex: 1;
    overflow-y: auto;
  }

  .repo-group {
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .repo-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    cursor: pointer;
    font-size: 12px;
    user-select: none;
    transition: background 0.1s;
  }

  .repo-row:hover {
    background: var(--color-bg-hover);
  }

  .repo-row-selected {
    background: var(--color-accent-subtle) !important;
  }

  .repo-row-dimmed {
    opacity: 0.55;
  }

  .repo-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 2px;
    overflow: hidden;
  }

  .repo-name {
    font-weight: 600;
    color: var(--color-text-primary);
    font-size: 12px;
  }

  .repo-name-dimmed {
    color: var(--color-text-muted);
    font-weight: 400;
  }

  .repo-branch-mapping {
    font-size: 11px;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .repo-branch-mapping strong {
    color: var(--color-text-secondary);
  }

  .arrow-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .ahead-badge {
    color: var(--color-warning);
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .uptodate-badge {
    color: var(--color-text-muted);
    font-size: 10px;
    flex-shrink: 0;
  }

  /* Commit list under repo */
  .commit-list {
    padding: 0 0 4px 28px;
  }

  .commit-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
    border-radius: 3px;
    margin: 1px 4px;
    user-select: none;
  }

  .commit-row:hover {
    background: var(--color-bg-hover);
  }

  .commit-row-selected {
    background: var(--color-bg-active) !important;
  }

  .commit-dot {
    color: var(--color-accent);
    font-size: 8px;
    flex-shrink: 0;
  }

  .commit-msg {
    color: var(--color-text-secondary);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .commit-hash {
    color: var(--color-accent);
    font-family: var(--font-editor, monospace);
    font-size: 10px;
    flex-shrink: 0;
  }

  /* ── RIGHT PANE ── */
  .right-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg-base);
  }

  .detail-files {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .detail-loading {
    padding: 20px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .detail-file-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    font-size: 12px;
    user-select: none;
  }

  .detail-file-row:hover {
    background: var(--color-bg-hover);
    cursor: pointer;
  }

  .detail-file-selected {
    background: var(--color-accent-subtle) !important;
  }

  .detail-status {
    font-weight: 700;
    font-size: 11px;
    width: 12px;
    text-align: center;
    flex-shrink: 0;
    font-family: var(--font-editor, monospace);
  }

  .detail-filename {
    color: var(--color-text-secondary);
    flex-shrink: 0;
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail-filepath {
    color: var(--color-text-muted);
    font-size: 10px;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.7;
  }

  /* Commit meta at bottom of right pane */
  .commit-meta {
    padding: 8px 10px;
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-surface);
    flex-shrink: 0;
  }

  .meta-row {
    display: flex;
    gap: 8px;
    font-size: 11px;
    padding: 1px 0;
  }

  .meta-label {
    color: var(--color-text-muted);
    width: 46px;
    flex-shrink: 0;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding-top: 1px;
  }

  .meta-value {
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta-hash {
    color: var(--color-accent);
    font-family: var(--font-editor, monospace);
    font-size: 11px;
  }

  .meta-message-row {
    padding-top: 4px;
    border-top: 1px solid var(--color-border-subtle);
    margin-top: 2px;
  }

  .meta-message {
    color: var(--color-text-primary);
    font-size: 11px;
    font-style: italic;
  }

  /* Up to date detail */
  .uptodate-detail {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .empty-state {
    padding: 20px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  /* ── Checkboxes ── */
  .cb {
    accent-color: var(--color-accent);
    cursor: pointer;
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }

  .cb:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* ── Result message ── */
  .push-result {
    padding: 4px 14px 2px;
    font-size: 12px;
    color: var(--color-success);
    flex-shrink: 0;
  }

  .push-result.result-error {
    color: var(--color-error);
  }

  /* ── Footer ── */
  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--color-bg-surface);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .footer-hint {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .footer-hint kbd {
    font-family: inherit;
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--color-bg-active);
    border: 1px solid var(--color-border);
  }

  .footer-actions {
    display: flex;
    gap: 6px;
  }

  .btn-secondary,
  .btn-primary {
    padding: 5px 16px;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.1s;
    white-space: nowrap;
  }

  .btn-secondary {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .btn-secondary:hover {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }

  .btn-primary {
    background: var(--color-accent);
    color: #fff;
    border-color: transparent;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  .btn-primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ── Directory group tree ── */
  .dir-group-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 11px;
    color: var(--color-text-muted);
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
  }

  .dir-group-header:hover {
    background: var(--color-bg-hover);
  }

  .dir-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    color: var(--color-text-muted);
    flex-shrink: 0;
    transition: transform 0.15s ease;
    transform: rotate(0deg);
  }

  .dir-chevron.dir-expanded {
    transform: rotate(90deg);
  }

  .dir-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .dir-path {
    color: var(--color-text-secondary);
    font-weight: 500;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dir-count {
    font-size: 10px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--color-bg-hover);
    color: var(--color-text-muted);
    font-weight: 600;
    flex-shrink: 0;
  }

  .detail-file-indented {
    padding-left: 32px !important;
  }

  /* ── Footer options ── */
  .footer-options {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }

  .footer-cb-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--color-text-secondary);
    cursor: pointer;
    user-select: none;
  }

  .footer-cb-label:hover {
    color: var(--color-text-primary);
  }
</style>
