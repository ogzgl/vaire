<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { gitRepos, workspacePath, openFile, openTabs, activeTabIndex, gitFileStatuses } from '$lib/stores/workspace';
  import { openDiffDialog } from '$lib/stores/diff';
  import UpdateProjectDialog from './UpdateProjectDialog.svelte';
  import { showToast } from '$lib/stores/notifications';

  interface GitRepo {
    path: string;
    name: string;
    branch: string;
    changed_files: GitChangedFile[];
    ahead: number;
    behind: number;
  }

  interface GitChangedFile {
    path: string;
    relative_path: string;
    status: string;
    staged: boolean;
  }

  let repoStatuses = $state<GitRepo[]>([]);
  let isLoading = $state(false);
  // Per-repo branch list and dropdown state
  let repoBranches = $state<Record<string, string[]>>({});
  let branchDropdownOpen = $state<Record<string, boolean>>({});
  let fetchingRepos = $state<Set<string>>(new Set());
  let pullingRepos = $state<Set<string>>(new Set());
  let isFetchingAll = $state(false);
  let isPullingAll = $state(false);
  let operationResult = $state<string | null>(null);

  // Update Project dialog state
  let updateDialogRepo = $state<string | null>(null);
  let updateDialogPullAll = $state(false);

  async function refreshGitStatus() {
    const repos = $gitRepos;
    if (repos.length === 0) return;

    isLoading = true;
    const statuses: GitRepo[] = [];

    for (const repoPath of repos) {
      try {
        const status = await invoke<GitRepo>('get_git_status', { repoPath });
        statuses.push(status);
      } catch (e) {
        console.error('Git status failed for', repoPath, e);
      }
    }

    repoStatuses = statuses;
    isLoading = false;

    // Update global git file status map for file tree coloring
    const statusMap = new Map<string, string>();
    for (const repo of statuses) {
      for (const file of repo.changed_files) {
        statusMap.set(file.path, file.status);
      }
    }
    gitFileStatuses.set(statusMap);
  }

  async function loadBranches(repoPath: string) {
    try {
      const branches = await invoke<string[]>('git_branches', { repoPath });
      repoBranches = { ...repoBranches, [repoPath]: branches };
    } catch (e) {
      console.error('Failed to load branches for', repoPath, e);
    }
  }

  function toggleBranchDropdown(repoPath: string) {
    const isOpen = branchDropdownOpen[repoPath];
    // Close all others first
    branchDropdownOpen = {};
    if (!isOpen) {
      branchDropdownOpen = { [repoPath]: true };
      loadBranches(repoPath);
    }
  }

  async function switchBranch(repoPath: string, branch: string) {
    branchDropdownOpen = {};
    try {
      await invoke<string>('git_checkout', { repoPath, branch });
      await refreshGitStatus();
      showToast(`Switched to ${branch}`, 'success');
    } catch (e: any) {
      showToast(`Checkout error: ${e}`, 'error');
    }
  }

  async function fetchRepo(repoPath: string) {
    fetchingRepos = new Set([...fetchingRepos, repoPath]);
    try {
      await invoke<string>('git_fetch', { repoPath });
      await refreshGitStatus();
      showToast('Fetch complete', 'success');
    } catch (e: any) {
      showToast(`Fetch error: ${e}`, 'error');
    } finally {
      fetchingRepos = new Set([...fetchingRepos].filter(r => r !== repoPath));
    }
  }

  async function pullRepo(repoPath: string, strategy?: string) {
    pullingRepos = new Set([...pullingRepos, repoPath]);
    try {
      await invoke<string>('git_pull', { repoPath, strategy });
      await refreshGitStatus();
      showToast('Pull complete', 'success');
    } catch (e: any) {
      const msg = String(e);
      // If ff-only failed because branches have diverged, offer merge/rebase
      if (!strategy && (msg.includes('Not possible to fast-forward') || msg.includes('diverged') || msg.includes('fatal: Not possible'))) {
        pullingRepos = new Set([...pullingRepos].filter(r => r !== repoPath));
        updateDialogRepo = repoPath;
        updateDialogPullAll = false;
        return;
      }
      showToast(`Pull error: ${msg}`, 'error');
    } finally {
      pullingRepos = new Set([...pullingRepos].filter(r => r !== repoPath));
    }
  }

  async function onUpdateConfirm(strategy: 'merge' | 'rebase') {
    const repoPath = updateDialogRepo;
    updateDialogRepo = null;
    if (!repoPath) return;
    if (updateDialogPullAll) {
      await pullAllWithStrategy(strategy);
    } else {
      await pullRepo(repoPath, strategy);
    }
  }

  function onUpdateCancel() {
    updateDialogRepo = null;
    updateDialogPullAll = false;
  }

  async function fetchAll() {
    isFetchingAll = true;
    const repos = $gitRepos;
    const errors: string[] = [];
    await Promise.all(repos.map(async (repoPath) => {
      try {
        await invoke<string>('git_fetch', { repoPath });
      } catch (e: any) {
        errors.push(e.toString());
      }
    }));
    await refreshGitStatus();
    isFetchingAll = false;
    if (errors.length > 0) {
      showToast(`Fetch errors: ${errors.join(', ')}`, 'error');
    } else {
      showToast(`Fetched ${repos.length} repo(s)`, 'success');
    }
  }

  async function pullAll() {
    isPullingAll = true;
    const repos = $gitRepos;
    const errors: string[] = [];
    let divergedRepo: string | null = null;
    for (const repoPath of repos) {
      try {
        await invoke<string>('git_pull', { repoPath });
      } catch (e: any) {
        const msg = String(e);
        if (!divergedRepo && (msg.includes('Not possible to fast-forward') || msg.includes('diverged') || msg.includes('fatal: Not possible'))) {
          divergedRepo = repoPath;
        } else {
          errors.push(msg);
        }
      }
    }
    await refreshGitStatus();
    isPullingAll = false;
    if (divergedRepo) {
      updateDialogRepo = divergedRepo;
      updateDialogPullAll = true;
      return;
    }
    if (errors.length > 0) {
      showToast(`Pull errors: ${errors.join(', ')}`, 'error');
    } else {
      showToast(`Pulled ${repos.length} repo(s)`, 'success');
    }
  }

  async function pullAllWithStrategy(strategy: 'merge' | 'rebase') {
    isPullingAll = true;
    const repos = $gitRepos;
    const errors: string[] = [];
    for (const repoPath of repos) {
      try {
        await invoke<string>('git_pull', { repoPath, strategy });
      } catch (e: any) {
        errors.push(e.toString());
      }
    }
    await refreshGitStatus();
    isPullingAll = false;
    if (errors.length > 0) {
      showToast(`Pull errors: ${errors.join(', ')}`, 'error');
    } else {
      showToast(`Pulled ${repos.length} repo(s) (${strategy})`, 'success');
    }
  }

  function showResult(msg: string) {
    // Kept for compatibility; toasts are used instead
    operationResult = msg;
    setTimeout(() => { operationResult = null; }, 3000);
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'modified': return 'var(--color-info)';
      case 'added': return 'var(--color-success)';
      case 'deleted': return 'var(--color-error)';
      case 'untracked': return 'var(--color-text-muted)';
      case 'renamed': return 'var(--color-warning)';
      default: return 'var(--color-text-muted)';
    }
  }

  function statusIcon(status: string): string {
    switch (status) {
      case 'modified': return 'M';
      case 'added': return 'A';
      case 'deleted': return 'D';
      case 'untracked': return 'U';
      case 'renamed': return 'R';
      default: return '?';
    }
  }

  function totalChanges(repos: GitRepo[]): number {
    return repos.reduce((sum, r) => sum + r.changed_files.length, 0);
  }

  // Close branch dropdowns when clicking outside
  function handleGlobalClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.branch-dropdown-anchor')) {
      branchDropdownOpen = {};
    }
  }

  // Auto-refresh when repos change
  $effect(() => {
    if ($gitRepos.length > 0) {
      refreshGitStatus();
    }
  });

  // Poll for git changes every 3 seconds
  let pollInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    pollInterval = setInterval(() => {
      if ($gitRepos.length > 0) {
        refreshGitStatus();
      }
    }, 3000);
    document.addEventListener('click', handleGlobalClick);
  });

  onDestroy(() => {
    clearInterval(pollInterval);
    document.removeEventListener('click', handleGlobalClick);
  });
</script>

{#if updateDialogRepo}
  <UpdateProjectDialog
    repoPath={updateDialogRepo}
    onConfirm={onUpdateConfirm}
    onCancel={onUpdateCancel}
  />
{/if}

<div class="git-panel">
  {#if $gitRepos.length === 0}
    <div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
        <circle cx="18" cy="18" r="3"/>
        <circle cx="6" cy="6" r="3"/>
        <path d="M6 9v6a3 3 0 0 0 3 3h3"/>
        <path d="M18 15V9a3 3 0 0 0-3-3h-3"/>
      </svg>
      <span class="empty-text">Open a folder with git repos</span>
    </div>
  {:else}
    <div class="git-header-actions">
      <span class="change-count">{totalChanges(repoStatuses)} changes</span>
      <div class="header-btns">
        <!-- Fetch All -->
        <button
          class="action-btn"
          onclick={fetchAll}
          disabled={isFetchingAll}
          title="Fetch All"
          aria-label="Fetch all repos"
        >
          {#if isFetchingAll}
            <span class="spinning">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
              </svg>
            </span>
          {:else}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
            </svg>
          {/if}
          <span>Fetch</span>
        </button>
        <!-- Pull All -->
        <button
          class="action-btn"
          onclick={pullAll}
          disabled={isPullingAll}
          title="Pull All"
          aria-label="Pull all repos"
        >
          {#if isPullingAll}
            <span class="spinning">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>
              </svg>
            </span>
          {:else}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>
            </svg>
          {/if}
          <span>Pull</span>
        </button>
        <!-- Refresh -->
        <button class="refresh-btn" onclick={refreshGitStatus} title="Refresh" aria-label="Refresh git status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
        </button>
      </div>
    </div>

    {#if operationResult}
      <div class="operation-result">{operationResult}</div>
    {/if}

    {#each repoStatuses as repo}
      <div class="repo-section">
        <div class="repo-header">
          <span class="repo-name">{repo.name}</span>

          <!-- Branch switcher dropdown -->
          <div class="branch-dropdown-anchor" style="position: relative;">
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="repo-branch branch-btn"
              onclick={() => toggleBranchDropdown(repo.path)}
              title="Switch branch"
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && toggleBranchDropdown(repo.path)}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 2.122a2.25 2.25 0 1 0-1 0v1.836A2.25 2.25 0 0 0 5.75 9.5h1.378a2.251 2.251 0 1 0 0-1H5.75a1.25 1.25 0 0 1-1.25-1.25V5.372Z"/>
              </svg>
              {repo.branch}
              <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" style="opacity: 0.6">
                <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
              </svg>
            </span>

            {#if branchDropdownOpen[repo.path]}
              <div class="branch-dropdown">
                {#if repoBranches[repo.path]}
                  {#each repoBranches[repo.path] as branch}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div
                      class="branch-item"
                      class:branch-item-active={branch === repo.branch}
                      onclick={() => switchBranch(repo.path, branch)}
                    >
                      {#if branch === repo.branch}
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style="color: var(--color-accent)">
                          <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
                        </svg>
                      {:else}
                        <span style="width: 10px; display: inline-block;"></span>
                      {/if}
                      <span>{branch}</span>
                    </div>
                  {/each}
                {:else}
                  <div class="branch-loading">Loading...</div>
                {/if}
              </div>
            {/if}
          </div>

          {#if repo.ahead > 0}
            <span class="ahead-behind">↑{repo.ahead}</span>
          {/if}
          {#if repo.behind > 0}
            <span class="ahead-behind">↓{repo.behind}</span>
          {/if}

          <!-- Per-repo fetch/pull buttons -->
          <button
            class="mini-btn"
            onclick={() => fetchRepo(repo.path)}
            disabled={fetchingRepos.has(repo.path)}
            title="Fetch"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
            </svg>
          </button>
          <button
            class="mini-btn"
            onclick={() => pullRepo(repo.path)}
            disabled={pullingRepos.has(repo.path)}
            title="Pull"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>
            </svg>
          </button>
        </div>

        {#if repo.changed_files.length === 0}
          <div class="no-changes">No changes</div>
        {:else}
          <div class="changed-files">
            {#each repo.changed_files as file}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="changed-file"
                class:active-file={$openTabs[$activeTabIndex]?.path === file.path}
                onclick={() => openDiffDialog(repo.path, file.relative_path, file.relative_path.split('/').pop() || '', file.staged)}
              >
                <span class="file-status" style="color: {statusColor(file.status)}">{statusIcon(file.status)}</span>
                <span class="file-path">{file.relative_path}</span>
                {#if file.staged}
                  <span class="staged-badge">staged</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .git-panel {
    padding: 4px 0;
    height: 100%;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: 12px;
  }

  .empty-text {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .git-header-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 6px;
    gap: 4px;
  }

  .change-count {
    font-size: 11px;
    color: var(--color-text-muted);
    flex: 1;
  }

  .header-btns {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 8px;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
    border-color: var(--color-border-focus);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-btn {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .refresh-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .mini-btn {
    width: 20px;
    height: 20px;
    border-radius: 3px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.1s ease;
    flex-shrink: 0;
  }

  .mini-btn:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .mini-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .operation-result {
    padding: 4px 12px 6px;
    font-size: 11px;
    color: var(--color-success);
    border-bottom: 1px solid var(--color-border-subtle);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .spinning {
    display: inline-flex;
    animation: spin 0.8s linear infinite;
  }

  .repo-section {
    margin-bottom: 8px;
  }

  .repo-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 12px;
  }

  .repo-name {
    font-weight: 600;
    color: var(--color-text-primary);
    flex-shrink: 0;
  }

  .repo-branch {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--color-accent);
    font-size: 11px;
  }

  .branch-btn {
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 4px;
    transition: background 0.1s;
    flex-shrink: 0;
  }

  .branch-btn:hover {
    background: var(--color-bg-hover);
  }

  .branch-dropdown {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    min-width: 160px;
    max-height: 200px;
    overflow-y: auto;
    background: var(--color-bg-overlay);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    z-index: 100;
    padding: 4px 0;
  }

  .branch-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .branch-item:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .branch-item-active {
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .branch-loading {
    padding: 8px 10px;
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .ahead-behind {
    font-size: 10px;
    color: var(--color-warning);
    font-weight: 600;
    flex-shrink: 0;
  }

  .no-changes {
    padding: 4px 12px;
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .changed-files {
    padding: 0 4px;
  }

  .changed-file {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.1s ease;
  }

  .changed-file:hover {
    background: var(--color-bg-hover);
  }

  .changed-file.active-file {
    background: var(--color-accent-subtle);
    border-left: 2px solid var(--color-accent);
    padding-left: 6px;
  }

  .file-status {
    font-weight: 700;
    font-size: 11px;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  }

  .file-path {
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .staged-badge {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--color-success);
    color: white;
    font-weight: 600;
    flex-shrink: 0;
  }
</style>
