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

  let logEntries = $state<GitLogEntry[]>([]);
  let selectedRepo = $state('');
  let isLoading = $state(false);

  const graphColors = [
    'var(--color-accent)',
    'var(--color-success)',
    'var(--color-warning)',
    'var(--color-error)',
    'var(--color-info)',
    '#c678dd',
  ];

  async function loadLog() {
    if (!selectedRepo) return;
    isLoading = true;
    try {
      logEntries = await invoke<GitLogEntry[]>('get_git_log', {
        repoPath: selectedRepo,
        count: 50,
      });
    } catch (e) {
      console.error('Failed to load git log:', e);
      logEntries = [];
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
  </div>

  <div class="log-entries">
    {#each logEntries as entry, i}
      <div class="log-entry">
        <span class="log-graph">
          <span class="log-dot" style="background: {graphColors[i % graphColors.length]}"></span>
          {#if i < logEntries.length - 1}
            <span class="log-line" style="background: {graphColors[i % graphColors.length]}"></span>
          {/if}
        </span>
        <span class="log-message">
          {entry.message}
          {#if entry.refs}
            <span class="log-refs">{entry.refs}</span>
          {/if}
        </span>
        <span class="log-author">{entry.author}</span>
        <span class="log-date">{entry.date}</span>
        <span class="log-hash">{entry.short_hash}</span>
      </div>
    {/each}
    {#if logEntries.length === 0 && !isLoading}
      <div class="empty-log">No git history</div>
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

  .log-entries {
    flex: 1;
    overflow-y: auto;
    padding: 0 12px;
  }

  .log-entry {
    display: grid;
    grid-template-columns: 24px 1fr auto auto auto;
    gap: 12px;
    align-items: center;
    padding: 3px 0;
    font-size: 12px;
    min-height: 24px;
  }

  .log-graph {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    height: 100%;
    justify-content: center;
  }

  .log-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    z-index: 1;
  }

  .log-line {
    position: absolute;
    top: 50%;
    width: 2px;
    height: 100%;
    opacity: 0.3;
  }

  .log-message {
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .log-refs {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--color-accent-subtle);
    color: var(--color-accent);
    margin-left: 6px;
    font-weight: 500;
  }

  .log-author {
    color: var(--color-text-muted);
    white-space: nowrap;
    font-size: 11px;
  }

  .log-date {
    color: var(--color-text-muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
  }

  .log-hash {
    color: var(--color-text-muted);
    font-family: var(--font-editor);
    font-size: 11px;
    opacity: 0.7;
  }

  .empty-log {
    padding: 20px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }
</style>
