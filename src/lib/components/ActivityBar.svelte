<script lang="ts">
  import { activeSidebarPanel, activeBottomPanel, type SidebarPanel, type BottomPanel } from '$lib/stores/app';
  import { openSettingsTab } from '$lib/stores/workspace';

  function toggleSidebar(panel: SidebarPanel) {
    activeSidebarPanel.update(current => current === panel ? current : panel);
  }

  function toggleBottom(panel: BottomPanel) {
    activeBottomPanel.update(current => current === panel ? null : panel);
  }

  const sidebarItems: { id: SidebarPanel; label: string; icon: string }[] = [
    { id: 'files', label: 'Project Files', icon: 'files' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'git', label: 'Git', icon: 'git' },
    { id: 'structure', label: 'Structure', icon: 'structure' },
    { id: 'bookmarks', label: 'Bookmarks', icon: 'bookmarks' },
    { id: 'todo', label: 'TODO', icon: 'todo' },
    { id: 'docker', label: 'Docker', icon: 'docker' },
    { id: 'database', label: 'Database', icon: 'database' },
  ];

  const bottomItems: { id: BottomPanel; label: string; icon: string }[] = [
    { id: 'git-log', label: 'Git Log', icon: 'git-log' },
    { id: 'run', label: 'Run', icon: 'run' },
    { id: 'debug', label: 'Debug', icon: 'debug' },
    { id: 'terminal', label: 'Terminal', icon: 'terminal' },
  ];
</script>

<div class="activity-bar">
  <div class="activity-top">
    {#each sidebarItems as item}
      <button
        class="activity-btn"
        class:active={$activeSidebarPanel === item.id}
        title={item.label}
        data-tooltip={item.label}
        onclick={() => toggleSidebar(item.id)}
      >
        {#if item.icon === 'files'}
          <!-- Filled folder/project icon -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 5a2 2 0 0 1 2-2h4.586a1 1 0 0 1 .707.293L12 5h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Z"/>
            <path d="M3 8h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" fill="currentColor" opacity="0.7"/>
          </svg>
        {:else if item.icon === 'search'}
          <!-- Heavier search icon -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="10.5" cy="10.5" r="6.5"/>
            <path d="m21 21-4.8-4.8"/>
          </svg>
        {:else if item.icon === 'git'}
          <!-- Standard git branch icon -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="6" y1="3" x2="6" y2="15"/>
            <circle cx="18" cy="6" r="3"/>
            <circle cx="6" cy="18" r="3"/>
            <path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
        {:else if item.icon === 'structure'}
          <!-- Filled structure/tree icon -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="2" width="7" height="4" rx="1.5"/>
            <rect x="1" y="10" width="7" height="4" rx="1.5"/>
            <rect x="13" y="10" width="7" height="4" rx="1.5"/>
            <rect x="4" y="18" width="7" height="4" rx="1.5"/>
            <path d="M7.5 6v4M4.5 14v1a1 1 0 0 0 1 1h2V18M7.5 6v1.5a1 1 0 0 0 1 1h5a1 1 0 0 1 1 1V10" fill="none" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        {:else if item.icon === 'bookmarks'}
          <!-- Filled bookmark icon -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5.5L4 22V4a2 2 0 0 1 2-2Z"/>
          </svg>
        {:else if item.icon === 'todo'}
          <!-- Filled checkbox icon -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <path d="M9.5 12.5l2 2 4-4" stroke="var(--color-bg-surface)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
        {:else if item.icon === 'docker'}
          <!-- Docker whale -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.98 11.08h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19h-2.12a.19.19 0 0 0-.19.19v1.88c0 .1.09.19.19.19m-2.95-5.43h2.12a.19.19 0 0 0 .19-.19V3.58a.19.19 0 0 0-.19-.19h-2.12a.19.19 0 0 0-.19.19v1.88c0 .11.09.19.19.19m0 2.71h2.12a.19.19 0 0 0 .19-.19V6.29a.19.19 0 0 0-.19-.19h-2.12a.19.19 0 0 0-.19.19v1.88c0 .11.09.19.19.19m-2.93 0h2.12a.19.19 0 0 0 .19-.19V6.29a.19.19 0 0 0-.19-.19H8.1a.19.19 0 0 0-.19.19v1.88c0 .11.08.19.19.19m-2.96 0h2.12a.19.19 0 0 0 .19-.19V6.29a.19.19 0 0 0-.19-.19H5.14a.19.19 0 0 0-.19.19v1.88c0 .11.09.19.19.19m5.89 2.72h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19h-2.12a.19.19 0 0 0-.19.19v1.88c0 .1.09.19.19.19m-2.93 0h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19H8.1a.19.19 0 0 0-.19.19v1.88c0 .1.08.19.19.19m-2.96 0h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19H5.14a.19.19 0 0 0-.19.19v1.88c0 .1.09.19.19.19m-2.92 0h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19H2.22a.19.19 0 0 0-.19.19v1.88c0 .1.08.19.19.19M23.7 11.59c-.57-.39-1.88-.53-2.89-.34-.13-.93-.7-1.74-1.37-2.27l-.27-.21-.21.27a2.98 2.98 0 0 0-.56 1.63c-.07.79.16 1.54.63 2.12-.29.17-.62.31-.93.42a5.7 5.7 0 0 1-1.7.26H.59l-.04.27a6.6 6.6 0 0 0 .56 3.33l.21.39v.02c1.48 2.48 4.14 3.53 7.15 3.53 5.67 0 10.39-2.6 12.55-8.22 1.43.07 2.85-.36 3.52-1.64l.17-.33-.21-.15z"/>
          </svg>
        {:else if item.icon === 'database'}
          <!-- Database cylinder (stacked discs) -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <ellipse cx="12" cy="5" rx="8" ry="3"/>
            <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/>
            <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/>
          </svg>
        {/if}
      </button>
    {/each}
  </div>

  <div class="activity-bottom">
    {#each bottomItems as item}
      <button
        class="activity-btn"
        class:active={$activeBottomPanel === item.id}
        title={item.label}
        data-tooltip={item.label}
        onclick={() => toggleBottom(item.id as BottomPanel)}
      >
        {#if item.icon === 'git-log'}
          <!-- Clock/history icon -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
          </svg>
        {:else if item.icon === 'run'}
          <!-- Play triangle -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        {:else if item.icon === 'debug'}
          <!-- Bug icon -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 8h-2.81a5.985 5.985 0 0 0-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5s-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"/>
          </svg>
        {:else}
          <!-- Filled terminal icon -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <rect x="2" y="3" width="20" height="18" rx="3"/>
            <path d="M7 9l3 3-3 3" stroke="var(--color-bg-surface)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <path d="M13 15h4" stroke="var(--color-bg-surface)" stroke-width="2" stroke-linecap="round" fill="none"/>
          </svg>
        {/if}
      </button>
    {/each}

    <button class="activity-btn" title="Settings" data-tooltip="Settings" onclick={() => openSettingsTab()}>
      <!-- Filled gear icon -->
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.49.49 0 0 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .activity-bar {
    width: 44px;
    background: var(--color-bg-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 6px 0;
    flex-shrink: 0;
  }

  .activity-top, .activity-bottom {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .activity-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
  }

  .activity-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .activity-btn.active {
    color: var(--color-text-primary);
  }

  .activity-btn.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 18px;
    background: var(--color-accent);
    border-radius: 0 3px 3px 0;
  }

  /* Tooltip */
  .activity-btn[data-tooltip] {
    position: relative;
  }

  .activity-btn[data-tooltip]::after {
    content: attr(data-tooltip);
    position: absolute;
    left: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    font-size: 12px;
    font-family: var(--font-ui);
    padding: 4px 8px;
    border-radius: 5px;
    border: 1px solid var(--color-border);
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease 0.5s;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .activity-btn[data-tooltip]:hover::after {
    opacity: 1;
  }
</style>
