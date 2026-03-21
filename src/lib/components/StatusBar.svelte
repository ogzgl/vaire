<script lang="ts">
  import { activeTab } from '$lib/stores/workspace';
  import { gitRepos } from '$lib/stores/workspace';

  // Blame toggle — we use a custom event to communicate with EditorArea
  let blameActive = $state(false);

  function toggleBlame() {
    blameActive = !blameActive;
    window.dispatchEvent(new CustomEvent('vaire:toggle-blame', { detail: { enabled: blameActive } }));
  }

  function getLangDisplay(lang?: string): string {
    if (!lang) return 'Plain Text';
    const map: Record<string, string> = {
      kotlin: 'Kotlin', java: 'Java', typescript: 'TypeScript', javascript: 'JavaScript',
      python: 'Python', rust: 'Rust', go: 'Go', yaml: 'YAML', json: 'JSON',
      terraform: 'Terraform', html: 'HTML', css: 'CSS', sql: 'SQL', shell: 'Shell',
      markdown: 'Markdown', svelte: 'Svelte', toml: 'TOML', gradle: 'Gradle', xml: 'XML',
    };
    return map[lang] || lang;
  }

  function getLineCount(content?: string): number {
    if (!content) return 0;
    return content.split('\n').length;
  }
</script>

<div class="status-bar">
  <div class="status-left">
    <span class="status-item branch">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 2.122a2.25 2.25 0 1 0-1 0v1.836A2.25 2.25 0 0 0 5.75 9.5h1.378a2.251 2.251 0 1 0 0-1H5.75a1.25 1.25 0 0 1-1.25-1.25V5.372Zm6.75 2.428a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"/>
      </svg>
      main
    </span>
    {#if $gitRepos.length > 0}
      <span class="status-item">{$gitRepos.length} repos</span>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <span
        class="status-item blame-toggle"
        class:blame-active={blameActive}
        onclick={toggleBlame}
        title="Toggle Git Blame"
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && toggleBlame()}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm-.5 4.5h1v1h-1v-1zm0 2h1v4h-1v-4z"/>
        </svg>
        Blame
      </span>
    {/if}
  </div>
  <div class="status-right">
    {#if $activeTab}
      <span class="status-item">Ln 1, Col 1</span>
      <span class="status-item">4 Spaces</span>
      <span class="status-item">UTF-8</span>
      <span class="status-item">LF</span>
      <span class="status-item">{getLineCount($activeTab.content)} lines</span>
      <span class="status-item lang">{getLangDisplay($activeTab.lang)}</span>
    {/if}
  </div>
</div>

<style>
  .status-bar {
    height: 24px;
    background: var(--color-bg-elevated);
    border-top: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    flex-shrink: 0;
  }

  .status-left, .status-right {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    height: 100%;
    font-size: 11px;
    color: var(--color-text-muted);
    cursor: default;
    border-radius: 3px;
    transition: all 0.1s ease;
  }

  .status-item:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
  }

  .branch {
    color: var(--color-text-secondary);
  }

  .lang {
    color: var(--color-text-secondary);
  }

  .blame-toggle {
    cursor: pointer;
  }

  .blame-toggle.blame-active {
    color: var(--color-accent);
    background: var(--color-accent-subtle);
  }
</style>
