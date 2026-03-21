<script lang="ts">
  import { activeSidebarPanel, activeBottomPanel, type SidebarPanel, type BottomPanel } from '$lib/stores/app';
  import { showSettings } from '$lib/stores/theme';

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
  ];

  const bottomItems: { id: BottomPanel; label: string; icon: string }[] = [
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/>
            <path d="M3 7l7-4h4l7 4"/>
            <path d="M12 22V11"/>
            <path d="M3 7l9 4 9-4"/>
          </svg>
        {:else if item.icon === 'search'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        {:else if item.icon === 'git'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="18" r="3"/>
            <circle cx="6" cy="6" r="3"/>
            <path d="M6 9v6a3 3 0 0 0 3 3h3"/>
            <path d="M18 15V9a3 3 0 0 0-3-3h-3"/>
          </svg>
        {:else if item.icon === 'structure'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v8"/>
            <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>
            <rect x="2" y="10" width="8" height="4" rx="1"/>
            <rect x="14" y="10" width="8" height="4" rx="1"/>
          </svg>
        {:else if item.icon === 'bookmarks'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20l-7-5-7 5V2z"/>
          </svg>
        {:else if item.icon === 'todo'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="m7 15 3-3-3-3"/>
          <path d="M13 15h4"/>
        </svg>
      </button>
    {/each}

    <button class="activity-btn" title="Settings" data-tooltip="Settings" onclick={() => showSettings.set(true)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
        <circle cx="12" cy="12" r="3"/>
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
