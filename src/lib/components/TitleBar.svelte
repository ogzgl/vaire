<script lang="ts">
  import { workspaceName, gitRepos } from '$lib/stores/workspace';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { invoke } from '@tauri-apps/api/core';

  let isFetchingAll = $state(false);
  let isPullingAll = $state(false);
  let opResult = $state<string | null>(null);
  let resultTimer: ReturnType<typeof setTimeout>;

  function showResult(msg: string) {
    clearTimeout(resultTimer);
    opResult = msg;
    resultTimer = setTimeout(() => { opResult = null; }, 3000);
  }

  async function fetchAll() {
    if (isFetchingAll) return;
    const repos = $gitRepos;
    if (repos.length === 0) { showResult('No git repos found'); return; }
    isFetchingAll = true;
    const errors: string[] = [];
    await Promise.all(repos.map(async (repoPath) => {
      try {
        await invoke<string>('git_fetch', { repoPath });
      } catch (e: any) {
        errors.push(String(e));
      }
    }));
    isFetchingAll = false;
    showResult(errors.length > 0 ? `Fetch error: ${errors[0]}` : `Fetched ${repos.length} repo(s)`);
  }

  async function pullAll() {
    if (isPullingAll) return;
    const repos = $gitRepos;
    if (repos.length === 0) { showResult('No git repos found'); return; }
    isPullingAll = true;
    const errors: string[] = [];
    for (const repoPath of repos) {
      try {
        await invoke<string>('git_pull', { repoPath });
      } catch (e: any) {
        errors.push(String(e));
      }
    }
    isPullingAll = false;
    showResult(errors.length > 0 ? `Pull error: ${errors[0]}` : `Pulled ${repos.length} repo(s)`);
  }

  async function handleMouseDown(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) {
      return;
    }
    if (e.buttons === 1) {
      e.preventDefault();
      try {
        await getCurrentWindow().startDragging();
      } catch (err) {
        console.error('startDragging failed:', err);
      }
    }
  }

  async function handleDoubleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    try {
      const win = getCurrentWindow();
      const maximized = await win.isMaximized();
      if (maximized) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    } catch (err) {
      console.error('maximize failed:', err);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="title-bar" onmousedown={handleMouseDown} ondblclick={handleDoubleClick}>
  <div class="traffic-light-space"></div>

  <div class="project-info">
    <span class="project-icon">V</span>
    <span class="project-name">{$workspaceName || 'Vaire'}</span>
    <span class="branch-name">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 2.122a2.25 2.25 0 1 0-1 0v1.836A2.25 2.25 0 0 0 5.75 9.5h1.378a2.251 2.251 0 1 0 0-1H5.75a1.25 1.25 0 0 1-1.25-1.25V5.372Zm6.75 2.428a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3.5-6.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
      </svg>
      main
    </span>
  </div>

  <div class="spacer"></div>

  <div class="title-actions">
    {#if opResult}
      <span class="op-result">{opResult}</span>
    {/if}
    <button
      class="title-action-btn"
      class:spinning={isFetchingAll}
      title="Fetch All Repos"
      onclick={fetchAll}
      disabled={isFetchingAll || isPullingAll}
    >
      {#if isFetchingAll}
        <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      {/if}
    </button>
    <button
      class="title-action-btn"
      title="Pull All Repos (ff-only)"
      onclick={pullAll}
      disabled={isFetchingAll || isPullingAll}
    >
      {#if isPullingAll}
        <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="17 1 21 5 17 9"/>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <polyline points="7 23 3 19 7 15"/>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
      {/if}
    </button>
    <button class="title-action-btn run-btn" title="Run">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4.25 3v10l8.5-5-8.5-5Z"/>
      </svg>
    </button>
    <button class="title-action-btn" title="Search Everywhere (Double Shift)">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="7" cy="7" r="4.5"/>
        <path d="M10.5 10.5 14 14"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .title-bar {
    height: var(--spacing-title-bar);
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 8px;
    -webkit-user-select: none;
    user-select: none;
    cursor: default;
  }

  .traffic-light-space {
    width: 68px;
    flex-shrink: 0;
  }

  .project-info {
    display: flex;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }

  .project-icon {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: white;
  }

  .project-name {
    font-weight: 600;
    font-size: 12px;
    color: var(--color-text-primary);
  }

  .branch-name {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--color-text-tertiary);
    font-size: 11px;
  }

  .spacer {
    flex: 1;
  }

  .title-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .title-action-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .title-action-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .run-btn:hover {
    color: var(--color-success);
  }

  .title-action-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .op-result {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  .spin {
    animation: titlebar-spin 0.8s linear infinite;
  }

  @keyframes titlebar-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
</style>
