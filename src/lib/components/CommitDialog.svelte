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

  let isOpen = $state(false);
  let commitMessage = $state('');
  let repoChanges = $state<RepoChanges[]>([]);
  let isCommitting = $state(false);
  let commitResult = $state<string | null>(null);
  let amendMode = $state(false);
  let textareaEl: HTMLTextAreaElement;
  let selectedFile = $state<{ repoPath: string; file: GitChangedFile } | null>(null);
  let wsName = $state('');

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
              selected: true,
            })),
          });
        }
      } catch (e) {
        console.error('Failed to get status for', repoPath, e);
      }
    }

    repoChanges = changes;
  }

  function open() {
    isOpen = true;
    commitMessage = '';
    commitResult = null;
    selectedFile = null;
    amendMode = false;
    loadChanges();
    requestAnimationFrame(() => textareaEl?.focus());
  }

  function close() {
    isOpen = false;
    commitMessage = '';
    commitResult = null;
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
            args: ['add', file.relative_path],
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
          await invoke<string>('git_command', {
            repoPath: repo.repoPath,
            args: ['push'],
          });
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { close(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      doCommit(e.shiftKey);
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
  <div class="dialog-container" onkeydown={handleKeydown} tabindex="-1">
    <div class="dialog">

      <!-- Title bar with tabs -->
      <div class="title-bar">
        <div class="title-tabs">
          <button class="tab tab-active">Commit</button>
          <button class="tab tab-inactive" disabled>Stash</button>
        </div>
        <span class="title-label">Commit — {wsName}</span>
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button class="close-btn" onclick={close}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>

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
        <!-- Master header row -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="changes-header" onclick={toggleAll}>
          <span class="chevron chevron-root">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
            </svg>
          </span>
          <input
            type="checkbox"
            class="cb"
            checked={allFilesSelected()}
            indeterminate={someFilesSelected()}
            onclick={(e) => { e.stopPropagation(); toggleAll(); }}
          />
          <span class="changes-label">Changes</span>
          <span class="changes-count">{totalFileCount()} file{totalFileCount() !== 1 ? 's' : ''}</span>
        </div>

        {#each repoChanges as repo, ri}
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
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <input
                type="checkbox"
                class="cb"
                checked={repo.files.every(f => f.selected)}
                indeterminate={repo.files.some(f => f.selected) && !repo.files.every(f => f.selected)}
                onclick={(e) => { e.stopPropagation(); toggleRepo(ri); }}
              />
              <span class="repo-icon" style="background: var(--color-accent)"></span>
              <span class="repo-name">{repo.repoName}</span>
              <span class="repo-file-count">&nbsp;{repo.files.filter(f => f.selected).length} file{repo.files.filter(f => f.selected).length !== 1 ? 's' : ''}</span>
              <span class="repo-branch">{repo.branch}</span>
            </div>

            {#if repo.expanded}
              {#each repo.files as file, fi}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="file-row"
                  class:file-row-selected={selectedFile?.file.relative_path === file.relative_path && selectedFile?.repoPath === repo.repoPath}
                  onclick={() => selectFile(repo.repoPath, file)}
                  ondblclick={() => { selectFile(repo.repoPath, file); showDiffForSelected(); }}
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
              {/each}
            {/if}
          </div>
        {/each}

        {#if repoChanges.length === 0}
          <div class="no-changes">No changes to commit</div>
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
    width: 650px;
    height: 500px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.04);
    animation: dialogIn 0.12s ease-out;
  }

  @keyframes dialogIn {
    from { opacity: 0; transform: scale(0.97) translateY(-4px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
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
    cursor: default;
    opacity: 0.55;
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
