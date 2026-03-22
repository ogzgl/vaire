<script lang="ts">
  import { themes, activeThemeId, fontSettings } from '$lib/stores/theme';
  import { effectiveKeybindings, updateKeybinding, resetKeybinding, buildShortcutString } from '$lib/stores/keybindings';

  type SettingsCategory = 'appearance' | 'editor' | 'keymap' | 'git' | 'terminal';
  let activeCategory = $state<SettingsCategory>('appearance');
  let searchQuery = $state('');

  // Editable keymap state
  let editingAction = $state<string | null>(null);

  function startCapture(action: string) {
    editingAction = action;
  }

  function cancelCapture() {
    editingAction = null;
  }

  function handleKeymapKeydown(e: KeyboardEvent) {
    if (!editingAction) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      cancelCapture();
      return;
    }

    const shortcut = buildShortcutString(e);
    if (!shortcut) return; // modifier-only press

    updateKeybinding(editingAction, shortcut);
    editingAction = null;
  }

  const fontFamilies = [
    'Fira Code',
    'JetBrains Mono',
    'SF Mono',
    'Cascadia Code',
    'Source Code Pro',
    'Consolas',
    'Monaco',
    'Menlo',
  ];

  const uiFontFamilies = [
    'Inter',
    'SF Pro Display',
    'Segoe UI',
    'Helvetica Neue',
    'system-ui',
  ];

  const categories: { id: SettingsCategory; label: string; icon: string }[] = [
    { id: 'appearance', label: 'Appearance', icon: 'palette' },
    { id: 'editor', label: 'Editor', icon: 'code' },
    { id: 'keymap', label: 'Keymap', icon: 'keyboard' },
    { id: 'git', label: 'Git', icon: 'git' },
    { id: 'terminal', label: 'Terminal', icon: 'terminal' },
  ];

  let filteredKeymap = $derived(
    searchQuery
      ? $effectiveKeybindings.filter(k =>
          k.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
          k.shortcut.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : $effectiveKeybindings
  );


</script>

<div class="settings-fullpage">
  <!-- Header -->
  <div class="settings-header">
    <h2>Settings</h2>
    <div class="settings-search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="7"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="text"
        placeholder="Search settings..."
        bind:value={searchQuery}
      />
    </div>
  </div>

    <div class="settings-body">
      <!-- Left sidebar categories -->
      <div class="settings-sidebar">
        {#each categories as cat}
          <button
            class="category-btn"
            class:active={activeCategory === cat.id}
            onclick={() => activeCategory = cat.id}
          >
            {#if cat.icon === 'palette'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9.6-10-9.6ZM6.5 13a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>
            {:else if cat.icon === 'code'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            {:else if cat.icon === 'keyboard'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/></svg>
            {:else if cat.icon === 'git'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16a3 3 0 1 0-2.83 2H9a4 4 0 0 1-4-4V9.83A3 3 0 1 0 7 9.83V14a2 2 0 0 0 2 2h6.17A3 3 0 0 0 18 16Z"/></svg>
            {:else}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="3" width="20" height="18" rx="3"/><path d="M7 9l3 3-3 3" stroke="var(--color-bg-surface)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            {/if}
            {cat.label}
          </button>
        {/each}
      </div>

      <!-- Right content -->
      <div class="settings-content">
        {#if activeCategory === 'appearance'}
          <section class="settings-section">
            <h3>Theme</h3>
            <div class="theme-grid">
              {#each themes as theme}
                <button
                  class="theme-card"
                  class:active={$activeThemeId === theme.id}
                  onclick={() => activeThemeId.set(theme.id)}
                >
                  <div class="theme-preview">
                    <div class="preview-bar" style="background: {theme.colors.bgSurface}; border-color: {theme.colors.border}">
                      <span class="preview-dot" style="background: {theme.colors.error}"></span>
                      <span class="preview-dot" style="background: {theme.colors.warning}"></span>
                      <span class="preview-dot" style="background: {theme.colors.success}"></span>
                    </div>
                    <div class="preview-body" style="background: {theme.colors.bgBase}">
                      <div class="preview-sidebar" style="background: {theme.colors.bgSurface}; border-color: {theme.colors.border}">
                        <div class="preview-line" style="background: {theme.colors.textMuted}; width: 60%"></div>
                        <div class="preview-line" style="background: {theme.colors.textMuted}; width: 80%"></div>
                        <div class="preview-line" style="background: {theme.colors.textMuted}; width: 50%"></div>
                      </div>
                      <div class="preview-editor">
                        <div class="preview-line" style="background: {theme.colors.accent}; width: 40%"></div>
                        <div class="preview-line" style="background: {theme.colors.textSecondary}; width: 70%"></div>
                        <div class="preview-line" style="background: {theme.colors.textSecondary}; width: 55%"></div>
                        <div class="preview-line" style="background: {theme.colors.success}; width: 45%"></div>
                      </div>
                    </div>
                  </div>
                  <span class="theme-name">{theme.name}</span>
                </button>
              {/each}
            </div>
          </section>

          <section class="settings-section">
            <h3>UI Font</h3>
            <div class="setting-row">
              <label for="ui-font">Font Family</label>
              <select id="ui-font" bind:value={$fontSettings.uiFamily}>
                {#each uiFontFamilies as font}
                  <option value={font}>{font}</option>
                {/each}
              </select>
            </div>
            <div class="setting-row">
              <label for="ui-size">Size</label>
              <input id="ui-size" type="number" min="10" max="18" bind:value={$fontSettings.uiSize} />
            </div>
          </section>

        {:else if activeCategory === 'editor'}
          <section class="settings-section">
            <h3>Editor Font</h3>
            <div class="setting-row">
              <label for="font-family">Font Family</label>
              <select id="font-family" bind:value={$fontSettings.family}>
                {#each fontFamilies as font}
                  <option value={font}>{font}</option>
                {/each}
              </select>
            </div>
            <div class="setting-row">
              <label for="font-size">Size</label>
              <input id="font-size" type="number" min="10" max="24" bind:value={$fontSettings.size} />
            </div>
            <div class="setting-row">
              <label for="line-height">Line Height</label>
              <input id="line-height" type="number" min="1" max="2" step="0.1" bind:value={$fontSettings.lineHeight} />
            </div>
          </section>

          <section class="settings-section">
            <h3>Preview</h3>
            <pre class="font-preview" style="font-family: '{$fontSettings.family}', monospace; font-size: {$fontSettings.size}px; line-height: {$fontSettings.lineHeight};"><code>fun main(args: Array&lt;String&gt;) &#123;
    println("Hello, Vaire!")
    val x = 42
    // ligatures: != == >= => ->
&#125;</code></pre>
          </section>

        {:else if activeCategory === 'keymap'}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <section class="settings-section" onkeydown={handleKeymapKeydown}>
            <h3>Keyboard Shortcuts</h3>
            <p class="settings-note" style="margin-bottom: 12px">Click the pencil icon to rebind a shortcut. Press Escape to cancel.</p>
            <div class="keymap-table">
              <div class="keymap-header">
                <span class="km-action">Action</span>
                <span class="km-shortcut">Shortcut</span>
                <span class="km-edit-col"></span>
              </div>
              {#each filteredKeymap as binding}
                <div class="keymap-row" class:capturing={editingAction === binding.action}>
                  <span class="km-action">{binding.action}</span>
                  {#if editingAction === binding.action}
                    <kbd class="km-shortcut km-capturing">Press shortcut...</kbd>
                  {:else}
                    <kbd class="km-shortcut" class:km-custom={binding.isCustom}>{binding.shortcut}</kbd>
                  {/if}
                  <span class="km-edit-col">
                    {#if editingAction === binding.action}
                      <button class="km-btn" title="Cancel" onclick={cancelCapture}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                        </svg>
                      </button>
                    {:else}
                      <button class="km-btn" title="Edit shortcut" onclick={() => startCapture(binding.action)}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                        </svg>
                      </button>
                      {#if binding.isCustom}
                        <button class="km-btn km-reset" title="Reset to default" onclick={() => resetKeybinding(binding.action)}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                            <path d="M3 3v5h5"/>
                          </svg>
                        </button>
                      {/if}
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          </section>

        {:else if activeCategory === 'git'}
          <section class="settings-section">
            <h3>Git</h3>
            <p class="settings-note">Git settings are configured via your system git config.</p>
          </section>

        {:else if activeCategory === 'terminal'}
          <section class="settings-section">
            <h3>Terminal Font</h3>
            <p class="settings-note">Terminal uses the same font settings as the editor.</p>
            <div class="setting-row">
              <label>Font Family</label>
              <span class="setting-value">{$fontSettings.family}</span>
            </div>
            <div class="setting-row">
              <label>Font Size</label>
              <span class="setting-value">{$fontSettings.size}px</span>
            </div>
          </section>
        {/if}
      </div>
    </div>
  </div>

<style>
  .settings-fullpage {
    width: 100%;
    height: 100%;
    background: var(--color-bg-base);
    display: flex;
    flex-direction: column;
  }

  .settings-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 20px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    -webkit-user-select: none;
    user-select: none;
  }

  .settings-header h2 {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .settings-search {
    flex: 1;
    max-width: 300px;
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 4px 10px;
    color: var(--color-text-muted);
    transition: border-color 0.15s;
  }

  .settings-search:focus-within {
    border-color: var(--color-accent);
  }

  .settings-search input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--color-text-primary);
    font-size: 13px;
    font-family: inherit;
  }

  .settings-search input::placeholder {
    color: var(--color-text-muted);
  }

  .settings-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .settings-sidebar {
    width: 180px;
    background: var(--color-bg-surface);
    border-right: 1px solid var(--color-border);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  .category-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 13px;
    font-family: inherit;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.1s;
    text-align: left;
  }

  .category-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .category-btn.active {
    background: var(--color-bg-active);
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
    max-width: 640px;
  }

  .settings-section {
    margin-bottom: 28px;
  }

  .settings-section h3 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    margin-bottom: 12px;
  }

  .settings-note {
    color: var(--color-text-muted);
    font-size: 13px;
    margin: 0;
  }

  .setting-value {
    color: var(--color-text-primary);
    font-size: 13px;
  }

  /* Theme grid */
  .theme-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .theme-card {
    border: 2px solid var(--color-border);
    border-radius: 8px;
    padding: 8px;
    background: transparent;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .theme-card:hover { border-color: var(--color-text-muted); }
  .theme-card.active { border-color: var(--color-accent); }

  .theme-preview {
    border-radius: 4px;
    overflow: hidden;
    height: 56px;
  }

  .preview-bar {
    height: 10px;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 4px;
    border-bottom: 1px solid;
  }

  .preview-dot { width: 4px; height: 4px; border-radius: 50%; }

  .preview-body {
    display: flex;
    height: 46px;
    padding: 3px;
    gap: 3px;
  }

  .preview-sidebar {
    width: 28%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px;
    border-right: 1px solid;
  }

  .preview-editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px;
  }

  .preview-line { height: 3px; border-radius: 1px; opacity: 0.6; }
  .theme-name { font-size: 11px; font-weight: 500; color: var(--color-text-primary); font-family: inherit; text-align: center; }

  /* Setting rows */
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .setting-row label {
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .setting-row select, .setting-row input {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text-primary);
    font-size: 13px;
    font-family: inherit;
    padding: 5px 10px;
    outline: none;
    transition: border-color 0.15s;
  }

  .setting-row select { min-width: 180px; }
  .setting-row input[type="number"] { width: 72px; text-align: center; }
  .setting-row select:focus, .setting-row input:focus { border-color: var(--color-accent); }

  .font-preview {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px 16px;
    color: var(--color-text-primary);
    overflow-x: auto;
    margin: 0;
  }

  .font-preview code { font-family: inherit; }

  /* Keymap table */
  .keymap-table {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .keymap-header {
    display: flex;
    align-items: center;
    padding: 8px 14px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .keymap-row {
    display: flex;
    align-items: center;
    padding: 7px 14px;
    border-bottom: 1px solid var(--color-border-subtle);
    font-size: 13px;
    transition: background 0.1s;
  }

  .keymap-row:last-child { border-bottom: none; }
  .keymap-row:hover { background: var(--color-bg-hover); }

  .km-action {
    flex: 1;
    color: var(--color-text-secondary);
  }

  .km-shortcut {
    color: var(--color-text-primary);
    font-size: 12px;
    min-width: 120px;
    text-align: right;
  }

  kbd.km-shortcut {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 2px 8px;
    font-family: var(--font-ui);
    font-weight: 500;
  }

  kbd.km-custom {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  kbd.km-capturing {
    border-color: var(--color-warning);
    color: var(--color-warning);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .keymap-row.capturing {
    background: var(--color-bg-active);
  }

  .km-edit-col {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 48px;
    justify-content: flex-end;
    flex-shrink: 0;
  }

  .km-btn {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    opacity: 0;
  }

  .keymap-row:hover .km-btn,
  .keymap-row.capturing .km-btn {
    opacity: 1;
  }

  .km-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .km-reset:hover {
    color: var(--color-warning);
  }
</style>
