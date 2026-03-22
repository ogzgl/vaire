<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { gitRepos, workspaceName } from '$lib/stores/workspace';
  import { openDiffDialog } from '$lib/stores/diff';
  import { showToast } from '$lib/stores/notifications';

  interface GitChangedFile {
    path: string;
    relative_path: string;
    status: string;
    staged: boolean;
  }

  interface RepoChanges {
    repoPath: string;
    repoName: string;
    branch: string;
    files: (GitChangedFile & { selected: boolean })[];
    expanded: boolean;
  }

  interface StashEntry {
    index: number;
    message: string;
    date: string;
  }

  type ActiveTab = 'commit' | 'stash';

  let isOpen = $state(false);
  let activeTab = $state<ActiveTab>('commit');
  let commitMessage = $state('');
  let repoChanges = $state<RepoChanges[]>([]);
  let isCommitting = $state(false);
  let commitResult = $state<string | null>(null);
  let amendMode = $state(false);
  let textareaEl: HTMLTextAreaElement;
  let selectedFile = $state<{ repoPath: string; file: GitChangedFile } | null>(null);
  let wsName = $state('');

  // Section collapse state
  let changesExpanded = $state(true);
  let unversionedExpanded = $state(true);

  // Context menu for file rows (tracked + untracked)
  let fileContextMenu = $state<{ x: number; y: number; repoPath: string; file: GitChangedFile & { selected: boolean }; repoIdx: number; fileIdx: number; isUntracked: boolean } | null>(null);
  let showRollbackConfirm = $state(false);

  // Derived tracked/untracked grouping
  let trackedCount = $derived(repoChanges.reduce((sum, r) => sum + r.files.filter(f => f.status !== 'untracked').length, 0));
  let untrackedCount = $derived(repoChanges.reduce((sum, r) => sum + r.files.filter(f => f.status === 'untracked').length, 0));
  let trackedSelectedCount = $derived(repoChanges.reduce((sum, r) => sum + r.files.filter(f => f.status !== 'untracked' && f.selected).length, 0));
  let untrackedSelectedCount = $derived(repoChanges.reduce((sum, r) => sum + r.files.filter(f => f.status === 'untracked' && f.selected).length, 0));

  // Stash tab state
  let stashRepo = $state('');
  let stashMessage = $state('');
  let stashIncludeUntracked = $state(false);
  let stashEntries = $state<StashEntry[]>([]);
  let isStashing = $state(false);
  let stashResult = $state<string | null>(null);

  // Drag-to-move state
  let dialogX = $state<number | null>(null);
  let dialogY = $state<number | null>(null);
  let dialogW = $state(650);
  let dialogH = $state(500);

  function startDrag(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    e.preventDefault();
    const startMX = e.clientX;
    const startMY = e.clientY;
    // If first drag, compute current position from center
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

  workspaceName.subscribe(v => wsName = v);

  async function loadChanges() {
    const repos = $gitRepos;
    const changes: RepoChanges[] = [];

    for (const repoPath of repos) {
      try {
        const status = await invoke<any>('get_git_status', { repoPath });
        if (status.changed_files.length > 0) {
          changes.push({
            repoPath,
            repoName: status.name,
            branch: status.branch,
            expanded: true,
            files: status.changed_files.map((f: GitChangedFile) => ({
              ...f,
              selected: f.status !== 'untracked',
            })),
          });
        }
      } catch (e) {
        console.error('Failed to get status for', repoPath, e);
      }
    }

    repoChanges = changes;
  }

  async function loadStashes() {
    if (!stashRepo) return;
    try {
      stashEntries = await invoke<StashEntry[]>('git_stash_list', { repoPath: stashRepo });
    } catch (e) {
      console.error('Failed to load stashes:', e);
      stashEntries = [];
    }
  }

  function open() {
    isOpen = true;
    commitMessage = '';
    commitResult = null;
    stashResult = null;
    selectedFile = null;
    amendMode = false;
    activeTab = 'commit';
    loadChanges();

    // Set default stash repo
    const repos = $gitRepos;
    if (repos.length > 0 && !stashRepo) {
      stashRepo = repos[0];
    }

    requestAnimationFrame(() => textareaEl?.focus());
  }

  function close() {
    isOpen = false;
    commitMessage = '';
    commitResult = null;
    stashResult = null;
  }

  function switchTab(tab: ActiveTab) {
    activeTab = tab;
    if (tab === 'stash') {
      const repos = $gitRepos;
      if (repos.length > 0 && !stashRepo) {
        stashRepo = repos[0];
      }
      loadStashes();
    }
  }

  function toggleFile(repoIdx: number, fileIdx: number) {
    repoChanges[repoIdx].files[fileIdx].selected = !repoChanges[repoIdx].files[fileIdx].selected;
  }

  function toggleRepo(repoIdx: number) {
    const allSelected = repoChanges[repoIdx].files.every(f => f.selected);
    repoChanges[repoIdx].files.forEach(f => f.selected = !allSelected);
  }

  function toggleRepoExpand(repoIdx: number) {
    repoChanges[repoIdx].expanded = !repoChanges[repoIdx].expanded;
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'modified': return 'var(--color-info)';
      case 'added': return 'var(--color-success)';
      case 'deleted': return 'var(--color-error)';
      case 'untracked': return 'var(--color-text-muted)';
      default: return 'var(--color-text-muted)';
    }
  }

  function statusLetter(status: string): string {
    switch (status) {
      case 'modified': return 'M';
      case 'added': return 'A';
      case 'deleted': return 'D';
      case 'untracked': return 'U';
      default: return '?';
    }
  }

  function selectedFileCount(): number {
    return repoChanges.reduce((sum, r) => sum + r.files.filter(f => f.selected).length, 0);
  }

  function totalFileCount(): number {
    return repoChanges.reduce((sum, r) => sum + r.files.length, 0);
  }

  function allFilesSelected(): boolean {
    if (repoChanges.length === 0) return false;
    return repoChanges.every(r => r.files.every(f => f.selected));
  }

  function someFilesSelected(): boolean {
    const sel = selectedFileCount();
    const tot = totalFileCount();
    return sel > 0 && sel < tot;
  }

  function toggleAll() {
    const allSelected = allFilesSelected();
    repoChanges.forEach(r => r.files.forEach(f => f.selected = !allSelected));
  }

  function toggleAllTracked() {
    const allSelected = trackedCount > 0 && trackedSelectedCount === trackedCount;
    repoChanges.forEach(r => r.files.filter(f => f.status !== 'untracked').forEach(f => f.selected = !allSelected));
  }

  function toggleAllUntracked() {
    const allSelected = untrackedCount > 0 && untrackedSelectedCount === untrackedCount;
    repoChanges.forEach(r => r.files.filter(f => f.status === 'untracked').forEach(f => f.selected = !allSelected));
  }

  async function addFilesToVCS(filesToAdd: { repoPath: string; relativePath: string }[]) {
    let addedCount = 0;
    for (const f of filesToAdd) {
      try {
        await invoke<string>('git_command', {
          repoPath: f.repoPath,
          args: ['add', '--', f.relativePath],
        });
        addedCount++;
      } catch (e) {
        console.error('Failed to add file:', f.relativePath, e);
      }
    }
    if (addedCount > 0) {
      showToast(`Added ${addedCount} file${addedCount !== 1 ? 's' : ''} to VCS`, 'success');
      await loadChanges();
    }
  }

  async function addSelectedToVCS() {
    const files: { repoPath: string; relativePath: string }[] = [];
    for (const repo of repoChanges) {
      for (const file of repo.files) {
        if (file.status === 'untracked' && file.selected) {
          files.push({ repoPath: repo.repoPath, relativePath: file.relative_path });
        }
      }
    }
    await addFilesToVCS(files);
  }

  function handleFileContextMenu(e: MouseEvent, repoPath: string, file: GitChangedFile & { selected: boolean }, ri: number, fi: number, isUntracked: boolean) {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 220;
    const menuHeight = isUntracked ? 120 : 160;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);
    fileContextMenu = { x, y, repoPath, file, repoIdx: ri, fileIdx: fi, isUntracked };
  }

  async function contextMenuAddToVCS() {
    if (!fileContextMenu) return;
    const files: { repoPath: string; relativePath: string }[] = [];

    // If the right-clicked file is selected and there are other selected untracked files,
    // add all selected untracked files. Otherwise just add the right-clicked file.
    if (fileContextMenu.file.selected && untrackedSelectedCount > 1) {
      for (const repo of repoChanges) {
        for (const file of repo.files) {
          if (file.status === 'untracked' && file.selected) {
            files.push({ repoPath: repo.repoPath, relativePath: file.relative_path });
          }
        }
      }
    } else {
      files.push({ repoPath: fileContextMenu.repoPath, relativePath: fileContextMenu.file.relative_path });
    }

    fileContextMenu = null;
    await addFilesToVCS(files);
  }

  function contextMenuShowDiff() {
    if (!fileContextMenu) return;
    const f = fileContextMenu.file;
    const fileName = f.relative_path.split('/').pop() || '';
    openDiffDialog(fileContextMenu.repoPath, f.relative_path, fileName, f.staged);
    fileContextMenu = null;
  }

  function contextMenuJumpToSource() {
    if (!fileContextMenu) return;
    // Open the file in the editor
    import('$lib/stores/workspace').then(({ openFile }) => {
      openFile({
        name: fileContextMenu!.file.relative_path.split('/').pop() || '',
        path: fileContextMenu!.repoPath + '/' + fileContextMenu!.file.relative_path,
        type: 'file',
        is_git_repo: false,
      });
    });
    fileContextMenu = null;
  }

  async function contextMenuRollback() {
    if (!fileContextMenu) return;
    showRollbackConfirm = true;
  }

  async function doRollback() {
    if (!fileContextMenu) return;
    const ctx = fileContextMenu;
    showRollbackConfirm = false;

    // Collect files to rollback: if the right-clicked file is selected and multiple tracked files are selected, rollback all selected tracked files
    const filesToRollback: { repoPath: string; relativePath: string; status: string }[] = [];
    if (ctx.file.selected && trackedSelectedCount > 1) {
      for (const repo of repoChanges) {
        for (const file of repo.files) {
          if (file.status !== 'untracked' && file.selected) {
            filesToRollback.push({ repoPath: repo.repoPath, relativePath: file.relative_path, status: file.status });
          }
        }
      }
    } else {
      filesToRollback.push({ repoPath: ctx.repoPath, relativePath: ctx.file.relative_path, status: ctx.file.status });
    }

    let rolledBack = 0;
    for (const f of filesToRollback) {
      try {
        if (f.status === 'added') {
          // For newly added files, unstage them
          await invoke<string>('git_command', {
            repoPath: f.repoPath,
            args: ['reset', 'HEAD', '--', f.relativePath],
          });
        } else {
          // For modified/deleted files, restore to HEAD
          await invoke<string>('git_command', {
            repoPath: f.repoPath,
            args: ['checkout', 'HEAD', '--', f.relativePath],
          });
        }
        rolledBack++;
      } catch (e) {
        console.error('Rollback failed:', f.relativePath, e);
      }
    }

    fileContextMenu = null;
    if (rolledBack > 0) {
      showToast(`Rolled back ${rolledBack} file${rolledBack !== 1 ? 's' : ''}`, 'success');
      await loadChanges();
    }
  }

  async function contextMenuDelete() {
    if (!fileContextMenu) return;
    const fullPath = fileContextMenu.repoPath + '/' + fileContextMenu.file.relative_path;
    try {
      await invoke('delete_path', { path: fullPath });
      showToast('File deleted', 'info');
      fileContextMenu = null;
      await loadChanges();
    } catch (e: any) {
      showToast(`Delete failed: ${e}`, 'error');
      fileContextMenu = null;
    }
  }

  function selectFile(repoPath: string, file: GitChangedFile) {
    selectedFile = { repoPath, file };
  }

  function showDiffForSelected() {
    if (!selectedFile) return;
    const fileName = selectedFile.file.relative_path.split('/').pop() || '';
    openDiffDialog(selectedFile.repoPath, selectedFile.file.relative_path, fileName, selectedFile.file.staged);
  }

  async function doCommit(andPush: boolean = false) {
    if (!commitMessage.trim()) return;
    isCommitting = true;
    commitResult = null;

    let successCount = 0;
    let errorMessages: string[] = [];

    for (const repo of repoChanges) {
      const selectedFiles = repo.files.filter(f => f.selected);
      if (selectedFiles.length === 0) continue;

      try {
        for (const file of selectedFiles) {
          await invoke<string>('git_command', {
            repoPath: repo.repoPath,
            args: ['add', '--', file.relative_path],
          });
        }

        const commitArgs = amendMode
          ? ['commit', '--amend', '-m', commitMessage.trim()]
          : ['commit', '-m', commitMessage.trim()];

        await invoke<string>('git_command', {
          repoPath: repo.repoPath,
          args: commitArgs,
        });

        if (andPush) {
          try {
            await invoke<string>('git_command', {
              repoPath: repo.repoPath,
              args: ['push'],
            });
          } catch {
            // If push fails (e.g. no upstream), try with --set-upstream
            const branch = await invoke<string>('git_command', {
              repoPath: repo.repoPath,
              args: ['rev-parse', '--abbrev-ref', 'HEAD'],
            });
            await invoke<string>('git_command', {
              repoPath: repo.repoPath,
              args: ['push', '--set-upstream', 'origin', branch.trim()],
            });
          }
        }

        successCount++;
      } catch (e: any) {
        errorMessages.push(`${repo.repoName}: ${e}`);
      }
    }

    isCommitting = false;

    if (errorMessages.length > 0) {
      const msg = `${andPush ? 'Committed & pushed' : 'Committed'} ${successCount} repo(s). Errors: ${errorMessages.join('; ')}`;
      commitResult = msg;
      showToast(msg, 'error');
    } else if (successCount > 0) {
      const msg = `${andPush ? 'Committed & pushed' : 'Committed'} to ${successCount} repo(s)`;
      commitResult = msg;
      showToast(msg, 'success');
      setTimeout(close, 1500);
    } else {
      commitResult = 'No files to commit';
      showToast('No files to commit', 'info');
    }
  }

  async function doStash() {
    if (!stashRepo) return;
    isStashing = true;
    stashResult = null;
    try {
      await invoke<string>('git_stash_save', {
        repoPath: stashRepo,
        message: stashMessage.trim() || 'WIP',
        includeUntracked: stashIncludeUntracked,
      });
      stashMessage = '';
      stashResult = 'Stash saved';
      showToast('Stash saved', 'success');
      await loadStashes();
    } catch (e: any) {
      stashResult = `Error: ${e}`;
      showToast(`Stash failed: ${e}`, 'error');
    }
    isStashing = false;
  }

  async function applyStash(index: number) {
    if (!stashRepo) return;
    try {
      await invoke<string>('git_stash_apply', { repoPath: stashRepo, index });
      showToast('Stash applied', 'success');
      await loadStashes();
    } catch (e: any) {
      showToast(`Apply failed: ${e}`, 'error');
    }
  }

  async function popStash(index: number) {
    if (!stashRepo) return;
    try {
      await invoke<string>('git_stash_pop', { repoPath: stashRepo, index });
      showToast('Stash popped', 'success');
      await loadStashes();
    } catch (e: any) {
      showToast(`Pop failed: ${e}`, 'error');
    }
  }

  async function dropStash(index: number) {
    if (!stashRepo) return;
    try {
      await invoke<string>('git_stash_drop', { repoPath: stashRepo, index });
      showToast('Stash dropped', 'info');
      await loadStashes();
    } catch (e: any) {
      showToast(`Drop failed: ${e}`, 'error');
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { close(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (activeTab === 'commit') doCommit(e.shiftKey);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      showDiffForSelected();
      return;
    }
  }

  function globalKeyHandler(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.shiftKey && !isOpen) {
      e.preventDefault();
      open();
    }
  }

  onMount(() => { window.addEventListener('keydown', globalKeyHandler); });
  onDestroy(() => { window.removeEventListener('keydown', globalKeyHandler); });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog-container" style="{dialogX !== null ? `left: ${dialogX}px; top: ${dialogY}px; transform: none;` : ''}" onkeydown={handleKeydown} tabindex="-1">
    <div class="dialog" style="width: {dialogW}px; height: {dialogH}px;">

      <!-- Title bar with tabs (drag handle) -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="title-bar" onmousedown={startDrag} style="cursor: move;">
        <div class="title-tabs">
          <button
            class="tab"
            class:tab-active={activeTab === 'commit'}
            class:tab-inactive={activeTab !== 'commit'}
            onclick={() => switchTab('commit')}
          >Commit</button>
          <button
            class="tab"
            class:tab-active={activeTab === 'stash'}
            class:tab-inactive={activeTab !== 'stash'}
            onclick={() => switchTab('stash')}
          >Stash</button>
        </div>
        <span class="title-label">{activeTab === 'commit' ? 'Commit' : 'Stash'} — {wsName}</span>
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button class="close-btn" onclick={close}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>

      {#if activeTab === 'commit'}

        <!-- Toolbar row -->
        <div class="toolbar">
          <!-- Refresh -->
          <button class="tool-btn" onclick={loadChanges} title="Refresh">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
            </svg>
          </button>
          <!-- Diff -->
          <button class="tool-btn" onclick={showDiffForSelected} title="Show Diff (Cmd+D)">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
          </button>
          <div class="toolbar-sep"></div>
          <!-- Expand all -->
          <button class="tool-btn" title="Expand All" onclick={() => repoChanges.forEach((_, i) => repoChanges[i].expanded = true)}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
          <!-- Collapse all -->
          <button class="tool-btn" title="Collapse All" onclick={() => repoChanges.forEach((_, i) => repoChanges[i].expanded = false)}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708l6-6z"/>
            </svg>
          </button>
        </div>

        <!-- Changes tree — takes up top half -->
        <div class="changes-tree">
          {#if repoChanges.length === 0}
            <div class="no-changes">No changes to commit</div>
          {:else}
            <!-- Changes section (tracked files) -->
            {#if trackedCount > 0}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="changes-header" onclick={() => changesExpanded = !changesExpanded}>
                <span class="chevron" class:expanded={changesExpanded}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                  </svg>
                </span>
                <input
                  type="checkbox"
                  class="cb"
                  checked={trackedCount > 0 && trackedSelectedCount === trackedCount}
                  indeterminate={trackedSelectedCount > 0 && trackedSelectedCount < trackedCount}
                  onclick={(e) => { e.stopPropagation(); toggleAllTracked(); }}
                />
                <span class="changes-label">Changes</span>
                <span class="changes-count">{trackedCount} file{trackedCount !== 1 ? 's' : ''}</span>
              </div>

              {#if changesExpanded}
                {#each repoChanges as repo, ri}
                  {@const trackedFiles = repo.files.filter(f => f.status !== 'untracked')}
                  {#if trackedFiles.length > 0}
                    <div class="repo-group">
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div class="repo-row">
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <span
                          class="chevron"
                          class:expanded={repo.expanded}
                          onclick={() => toggleRepoExpand(ri)}
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                          </svg>
                        </span>
                        <span class="repo-icon" style="background: var(--color-accent)"></span>
                        <span class="repo-name">{repo.repoName}</span>
                        <span class="repo-file-count">&nbsp;{trackedFiles.filter(f => f.selected).length} file{trackedFiles.filter(f => f.selected).length !== 1 ? 's' : ''}</span>
                        <span class="repo-branch">{repo.branch}</span>
                      </div>

                      {#if repo.expanded}
                        {#each repo.files as file, fi}
                          {#if file.status !== 'untracked'}
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                              class="file-row"
                              class:file-row-selected={selectedFile?.file.relative_path === file.relative_path && selectedFile?.repoPath === repo.repoPath}
                              onclick={() => selectFile(repo.repoPath, file)}
                              ondblclick={() => { selectFile(repo.repoPath, file); showDiffForSelected(); }}
                              oncontextmenu={(e) => handleFileContextMenu(e, repo.repoPath, file, ri, fi, false)}
                            >
                              <!-- svelte-ignore a11y_no_static_element_interactions -->
                              <input
                                type="checkbox"
                                class="cb"
                                checked={file.selected}
                                onclick={(e) => { e.stopPropagation(); toggleFile(ri, fi); }}
                              />
                              <span class="file-status-letter" style="color: {statusColor(file.status)}">{statusLetter(file.status)}</span>
                              <span class="file-name">{file.relative_path.split('/').pop()}</span>
                              <span class="file-path-hint">{file.relative_path.includes('/') ? file.relative_path.substring(0, file.relative_path.lastIndexOf('/')) : ''}</span>
                            </div>
                          {/if}
                        {/each}
                      {/if}
                    </div>
                  {/if}
                {/each}
              {/if}
            {/if}

            <!-- Unversioned Files section (untracked files) -->
            {#if untrackedCount > 0}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="changes-header unversioned-header" onclick={() => unversionedExpanded = !unversionedExpanded}>
                <span class="chevron" class:expanded={unversionedExpanded}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                  </svg>
                </span>
                <input
                  type="checkbox"
                  class="cb"
                  checked={untrackedCount > 0 && untrackedSelectedCount === untrackedCount}
                  indeterminate={untrackedSelectedCount > 0 && untrackedSelectedCount < untrackedCount}
                  onclick={(e) => { e.stopPropagation(); toggleAllUntracked(); }}
                />
                <span class="changes-label">Unversioned Files</span>
                <span class="changes-count">{untrackedCount} file{untrackedCount !== 1 ? 's' : ''}</span>
                {#if untrackedSelectedCount > 0}
                  <button class="add-vcs-btn" onclick={(e) => { e.stopPropagation(); addSelectedToVCS(); }} title="Stage selected untracked files (git add)">
                    Add to VCS
                  </button>
                {/if}
              </div>

              {#if unversionedExpanded}
                {#each repoChanges as repo, ri}
                  {@const untrackedFiles = repo.files.filter(f => f.status === 'untracked')}
                  {#if untrackedFiles.length > 0}
                    <div class="repo-group">
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div class="repo-row">
                        <span class="repo-icon" style="background: var(--color-text-muted)"></span>
                        <span class="repo-name">{repo.repoName}</span>
                        <span class="repo-file-count">&nbsp;{untrackedFiles.length} file{untrackedFiles.length !== 1 ? 's' : ''}</span>
                      </div>

                      {#each repo.files as file, fi}
                        {#if file.status === 'untracked'}
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <div
                            class="file-row"
                            class:file-row-selected={selectedFile?.file.relative_path === file.relative_path && selectedFile?.repoPath === repo.repoPath}
                            onclick={() => selectFile(repo.repoPath, file)}
                            oncontextmenu={(e) => handleFileContextMenu(e, repo.repoPath, file, ri, fi, true)}
                          >
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <input
                              type="checkbox"
                              class="cb"
                              checked={file.selected}
                              onclick={(e) => { e.stopPropagation(); toggleFile(ri, fi); }}
                            />
                            <span class="file-status-letter" style="color: {statusColor(file.status)}">{statusLetter(file.status)}</span>
                            <span class="file-name">{file.relative_path.split('/').pop()}</span>
                            <span class="file-path-hint">{file.relative_path.includes('/') ? file.relative_path.substring(0, file.relative_path.lastIndexOf('/')) : ''}</span>
                          </div>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                {/each}
              {/if}
            {/if}
          {/if}
        </div>

        <!-- Amend divider row -->
        <div class="amend-row">
          <label class="amend-label">
            <input type="checkbox" class="cb" bind:checked={amendMode} />
            <span>Amend</span>
          </label>
          <span class="modified-count">{selectedFileCount()} modified</span>
        </div>

        <!-- Commit message textarea — BOTTOM -->
        <div class="commit-message-area">
          <textarea
            bind:this={textareaEl}
            bind:value={commitMessage}
            class="commit-input"
            placeholder="Commit message..."
          ></textarea>
        </div>

        {#if commitResult}
          <div class="commit-result" class:result-error={commitResult.includes('Error')}>
            {commitResult}
          </div>
        {/if}

        <!-- Footer -->
        <div class="dialog-footer">
          <div class="footer-left">
            <span class="footer-hint"><kbd>⌘Enter</kbd> commit &nbsp; <kbd>⌘⇧Enter</kbd> commit & push &nbsp; <kbd>⌘D</kbd> diff</span>
          </div>
          <div class="footer-actions">
            <button class="btn-secondary" onclick={close}>Cancel</button>
            <button
              class="btn-secondary"
              onclick={() => doCommit(true)}
              disabled={!commitMessage.trim() || selectedFileCount() === 0 || isCommitting}
            >
              Commit and Push...
            </button>
            <button
              class="btn-primary"
              onclick={() => doCommit(false)}
              disabled={!commitMessage.trim() || selectedFileCount() === 0 || isCommitting}
            >
              {isCommitting ? 'Committing...' : 'Commit'}
            </button>
          </div>
        </div>

      {:else}
        <!-- ── STASH TAB ── -->
        <div class="stash-tab-content">

          <!-- Repo selector (if multiple repos) -->
          {#if $gitRepos.length > 1}
            <div class="stash-section">
              <label class="stash-label">Repository</label>
              <select class="stash-select" bind:value={stashRepo} onchange={loadStashes}>
                {#each $gitRepos as repo}
                  <option value={repo}>{repo.split('/').pop()}</option>
                {/each}
              </select>
            </div>
          {/if}

          <!-- Stash message input -->
          <div class="stash-section">
            <label class="stash-label">Stash message (optional)</label>
            <input
              type="text"
              class="stash-input"
              bind:value={stashMessage}
              placeholder="WIP on feature..."
            />
          </div>

          <!-- Include untracked -->
          <div class="stash-section">
            <label class="stash-checkbox-label">
              <input type="checkbox" class="cb" bind:checked={stashIncludeUntracked} />
              <span>Include untracked files</span>
            </label>
          </div>

          {#if stashResult}
            <div class="stash-result" class:result-error={stashResult.startsWith('Error')}>
              {stashResult}
            </div>
          {/if}

          <!-- Existing stashes -->
          <div class="stash-list-header">
            <span>Saved Stashes ({stashEntries.length})</span>
            <button class="tool-btn" onclick={loadStashes} title="Refresh">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
              </svg>
            </button>
          </div>

          <div class="stash-list">
            {#each stashEntries as entry}
              <div class="stash-entry">
                <div class="stash-entry-info">
                  <span class="stash-entry-index">stash@{'{' + entry.index + '}'}</span>
                  <span class="stash-entry-msg">{entry.message}</span>
                  <span class="stash-entry-date">{entry.date}</span>
                </div>
                <div class="stash-entry-actions">
                  <button class="stash-action-btn" onclick={() => applyStash(entry.index)} title="Apply (keep stash)">Apply</button>
                  <button class="stash-action-btn" onclick={() => popStash(entry.index)} title="Pop (apply and remove)">Pop</button>
                  <button class="stash-action-btn stash-action-drop" onclick={() => dropStash(entry.index)} title="Drop stash">Drop</button>
                </div>
              </div>
            {/each}
            {#if stashEntries.length === 0}
              <div class="no-stashes">No stashes</div>
            {/if}
          </div>
        </div>

        <!-- Stash footer -->
        <div class="dialog-footer">
          <div class="footer-left"></div>
          <div class="footer-actions">
            <button class="btn-secondary" onclick={close}>Cancel</button>
            <button
              class="btn-primary"
              onclick={doStash}
              disabled={isStashing || !stashRepo}
            >
              {isStashing ? 'Stashing...' : 'Stash Changes'}
            </button>
          </div>
        </div>
      {/if}

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resize-handle" onmousedown={startResize}></div>
    </div>
  </div>
{/if}

{#if fileContextMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="file-ctx-backdrop" onclick={() => { fileContextMenu = null; showRollbackConfirm = false; }}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="file-ctx-menu" style="left: {fileContextMenu.x}px; top: {fileContextMenu.y}px;" onclick={(e) => e.stopPropagation()}>
      {#if fileContextMenu.isUntracked}
        <!-- Untracked file menu -->
        <button class="file-ctx-item" onclick={contextMenuAddToVCS}>
          {fileContextMenu.file.selected && untrackedSelectedCount > 1
            ? `Add ${untrackedSelectedCount} Files to VCS`
            : 'Add to VCS'}
        </button>
        <div class="file-ctx-sep"></div>
        <button class="file-ctx-item" onclick={contextMenuJumpToSource}>
          Jump to Source
        </button>
        <div class="file-ctx-sep"></div>
        <button class="file-ctx-item file-ctx-danger" onclick={contextMenuDelete}>
          Delete
        </button>
      {:else}
        <!-- Tracked file menu -->
        {#if !showRollbackConfirm}
          <button class="file-ctx-item" onclick={contextMenuRollback}>
            {fileContextMenu.file.selected && trackedSelectedCount > 1
              ? `Rollback ${trackedSelectedCount} Files...`
              : 'Rollback...'}
          </button>
          <div class="file-ctx-sep"></div>
          <button class="file-ctx-item" onclick={contextMenuShowDiff}>
            Show Diff
          </button>
          <button class="file-ctx-item" onclick={contextMenuJumpToSource}>
            Jump to Source
          </button>
          <div class="file-ctx-sep"></div>
          <button class="file-ctx-item file-ctx-danger" onclick={contextMenuDelete}>
            Delete
          </button>
        {:else}
          <div class="file-ctx-confirm">
            <span class="file-ctx-confirm-text">
              Rollback {fileContextMenu.file.selected && trackedSelectedCount > 1
                ? `${trackedSelectedCount} files`
                : fileContextMenu.file.relative_path.split('/').pop()}? Changes will be lost.
            </span>
            <div class="file-ctx-confirm-actions">
              <button class="file-ctx-confirm-btn cancel" onclick={() => { showRollbackConfirm = false; fileContextMenu = null; }}>Cancel</button>
              <button class="file-ctx-confirm-btn danger" onclick={doRollback}>Rollback</button>
            </div>
          </div>
        {/if}
      {/if}
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
    padding: 0 8px 0 0;
    flex-shrink: 0;
    gap: 0;
  }

  .title-tabs {
    display: flex;
    height: 100%;
  }

  .tab {
    height: 100%;
    padding: 0 16px;
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    background: transparent;
    border: none;
    border-right: 1px solid var(--color-border);
    cursor: pointer;
    transition: background 0.1s;
    white-space: nowrap;
  }

  .tab-active {
    color: var(--color-text-primary);
    background: var(--color-bg-elevated);
    border-bottom: 2px solid var(--color-accent);
  }

  .tab-inactive {
    color: var(--color-text-muted);
    background: transparent;
  }

  .tab-inactive:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .title-label {
    flex: 1;
    font-size: 11px;
    color: var(--color-text-muted);
    padding-left: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  /* ── Toolbar ── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 3px 6px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .tool-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .tool-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .toolbar-sep {
    width: 1px;
    height: 16px;
    background: var(--color-border);
    margin: 0 3px;
  }

  /* ── Changes tree ── */
  .changes-tree {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    background: var(--color-bg-base);
  }

  .changes-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-bg-surface);
    user-select: none;
  }

  .changes-header:hover {
    background: var(--color-bg-hover);
  }

  .unversioned-header {
    border-top: 1px solid var(--color-border-subtle);
  }

  .add-vcs-btn {
    padding: 1px 8px;
    font-size: 10px;
    font-family: inherit;
    font-weight: 500;
    background: var(--color-bg-hover);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    white-space: nowrap;
    margin-left: auto;
  }

  .add-vcs-btn:hover {
    background: var(--color-accent);
    color: #fff;
    border-color: transparent;
  }

  .file-ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
  }

  .file-ctx-menu {
    position: fixed;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 4px 0;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    min-width: 180px;
    z-index: 301;
  }

  .file-ctx-item {
    display: block;
    width: 100%;
    padding: 6px 14px;
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }

  .file-ctx-item:hover {
    background: var(--color-accent);
    color: #fff;
  }

  .file-ctx-danger:hover {
    background: var(--color-error);
    color: #fff;
  }

  .file-ctx-sep {
    height: 1px;
    background: var(--color-border);
    margin: 3px 0;
  }

  .file-ctx-confirm {
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-ctx-confirm-text {
    font-size: 12px;
    color: var(--color-text-primary);
    line-height: 1.4;
  }

  .file-ctx-confirm-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  .file-ctx-confirm-btn {
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    font-size: 11px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.1s;
  }

  .file-ctx-confirm-btn.cancel {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .file-ctx-confirm-btn.cancel:hover {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }

  .file-ctx-confirm-btn.danger {
    background: var(--color-error);
    color: #fff;
    border-color: transparent;
  }

  .file-ctx-confirm-btn.danger:hover {
    opacity: 0.9;
  }

  .chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: var(--color-text-muted);
    flex-shrink: 0;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .chevron-root {
    transform: rotate(0deg);
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .changes-label {
    flex: 1;
  }

  .changes-count {
    color: var(--color-text-muted);
    font-weight: 400;
    font-size: 11px;
    margin-right: 4px;
  }

  /* Repo rows */
  .repo-group {
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .repo-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px 4px 6px;
    font-size: 12px;
    user-select: none;
    cursor: default;
  }

  .repo-row:hover {
    background: var(--color-bg-hover);
  }

  .repo-icon {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
    margin-left: 2px;
  }

  .repo-name {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .repo-file-count {
    color: var(--color-text-muted);
    font-size: 11px;
  }

  .repo-branch {
    color: var(--color-accent);
    font-size: 11px;
    margin-left: auto;
    font-weight: 600;
  }

  /* File rows */
  .file-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 38px;
    font-size: 12px;
    cursor: pointer;
    user-select: none;
  }

  .file-row:hover {
    background: var(--color-bg-hover);
  }

  .file-row-selected {
    background: var(--color-accent-subtle) !important;
  }

  .file-status-letter {
    font-weight: 700;
    font-size: 11px;
    width: 12px;
    text-align: center;
    flex-shrink: 0;
    font-family: var(--font-editor, monospace);
  }

  .file-name {
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
    max-width: 280px;
  }

  .file-row-selected .file-name {
    color: var(--color-text-primary);
  }

  .file-path-hint {
    color: var(--color-text-muted);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    opacity: 0.7;
  }

  .no-changes {
    padding: 32px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  /* ── Amend row (divider) ── */
  .amend-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 12px;
    background: var(--color-bg-surface);
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .amend-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--color-text-secondary);
    cursor: pointer;
    user-select: none;
  }

  .amend-label:hover {
    color: var(--color-text-primary);
  }

  .modified-count {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  /* ── Commit message ── */
  .commit-message-area {
    padding: 8px 10px;
    background: var(--color-bg-elevated);
    flex-shrink: 0;
  }

  .commit-input {
    width: 100%;
    height: 72px;
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    font-size: 13px;
    font-family: inherit;
    padding: 8px 10px;
    outline: none;
    resize: none;
    transition: border-color 0.12s;
    line-height: 1.5;
  }

  .commit-input:focus {
    border-color: var(--color-accent);
  }

  .commit-input::placeholder {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .commit-result {
    padding: 4px 12px 2px;
    font-size: 12px;
    color: var(--color-success);
    flex-shrink: 0;
  }

  .commit-result.result-error {
    color: var(--color-error);
  }

  /* ── Stash tab ── */
  .stash-tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    background: var(--color-bg-base);
  }

  .stash-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stash-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .stash-input,
  .stash-select {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    font-size: 12px;
    font-family: inherit;
    padding: 6px 10px;
    outline: none;
    transition: border-color 0.12s;
  }

  .stash-input:focus,
  .stash-select:focus {
    border-color: var(--color-accent);
  }

  .stash-input::placeholder {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .stash-checkbox-label {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--color-text-secondary);
    cursor: pointer;
    user-select: none;
  }

  .stash-checkbox-label:hover {
    color: var(--color-text-primary);
  }

  .stash-result {
    font-size: 12px;
    color: var(--color-success);
    padding: 4px 0;
  }

  .stash-result.result-error {
    color: var(--color-error);
  }

  .stash-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding-top: 4px;
    border-top: 1px solid var(--color-border-subtle);
    margin-top: 2px;
  }

  .stash-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .stash-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: 5px;
    transition: background 0.1s;
  }

  .stash-entry:hover {
    background: var(--color-bg-hover);
  }

  .stash-entry-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
  }

  .stash-entry-index {
    font-family: var(--font-editor, monospace);
    font-size: 10px;
    color: var(--color-accent);
  }

  .stash-entry-msg {
    font-size: 12px;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stash-entry-date {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .stash-entry-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .stash-action-btn {
    padding: 3px 8px;
    font-size: 11px;
    font-family: inherit;
    font-weight: 500;
    background: var(--color-bg-hover);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    white-space: nowrap;
  }

  .stash-action-btn:hover {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
  }

  .stash-action-drop:hover {
    background: rgba(248, 113, 113, 0.15);
    border-color: var(--color-error);
    color: var(--color-error);
  }

  .no-stashes {
    padding: 20px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 12px;
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
    gap: 8px;
  }

  .footer-left {
    flex: 1;
  }

  .footer-hint {
    font-size: 10px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .footer-hint kbd {
    font-family: inherit;
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--color-bg-active);
    border: 1px solid var(--color-border);
  }

  .footer-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  /* Checkboxes */
  .cb {
    accent-color: var(--color-accent);
    cursor: pointer;
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }

  /* Buttons */
  .btn-secondary,
  .btn-primary {
    padding: 5px 14px;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
    white-space: nowrap;
  }

  .btn-secondary {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .btn-secondary:hover:not(:disabled) {
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

  .btn-secondary:disabled,
  .btn-primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
