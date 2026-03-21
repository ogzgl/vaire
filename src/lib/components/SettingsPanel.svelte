<script lang="ts">
  import { themes, activeThemeId, fontSettings, showSettings } from '$lib/stores/theme';

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

  function close() {
    showSettings.set(false);
  }
</script>

{#if $showSettings}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="settings-overlay" onclick={close}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="settings-panel" onclick={(e) => e.stopPropagation()}>
      <div class="settings-header">
        <h2>Settings</h2>
        <button class="close-btn" onclick={close} aria-label="Close settings">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>

      <div class="settings-content">
        <!-- Theme -->
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

        <!-- Editor Font -->
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

        <!-- UI Font -->
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

        <!-- Preview -->
        <section class="settings-section">
          <h3>Preview</h3>
          <pre class="font-preview" style="font-family: '{$fontSettings.family}', monospace; font-size: {$fontSettings.size}px; line-height: {$fontSettings.lineHeight};"><code>fun main(args: Array&lt;String&gt;) &#123;
    println("Hello, Vaire!")
    val x = 42
    // ligatures: != == >= => ->
&#125;</code></pre>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    backdrop-filter: blur(4px);
  }

  .settings-panel {
    width: 560px;
    max-height: 80vh;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
  }

  .settings-header h2 {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .close-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .settings-content {
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .settings-section h3 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    margin-bottom: 12px;
  }

  .theme-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
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

  .theme-card:hover {
    border-color: var(--color-text-muted);
  }

  .theme-card.active {
    border-color: var(--color-accent);
  }

  .theme-preview {
    border-radius: 4px;
    overflow: hidden;
    height: 64px;
  }

  .preview-bar {
    height: 12px;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 5px;
    border-bottom: 1px solid;
  }

  .preview-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  .preview-body {
    display: flex;
    height: 52px;
    padding: 4px;
    gap: 4px;
  }

  .preview-sidebar {
    width: 30%;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 3px;
    border-right: 1px solid;
    border-radius: 2px;
  }

  .preview-editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 3px;
  }

  .preview-line {
    height: 3px;
    border-radius: 1px;
    opacity: 0.6;
  }

  .theme-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-primary);
    font-family: inherit;
    text-align: center;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .setting-row label {
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .setting-row select,
  .setting-row input {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text-primary);
    font-size: 13px;
    font-family: inherit;
    padding: 4px 8px;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .setting-row select {
    min-width: 180px;
  }

  .setting-row input[type="number"] {
    width: 72px;
    text-align: center;
  }

  .setting-row select:focus,
  .setting-row input:focus {
    border-color: var(--color-accent);
  }

  .font-preview {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px 16px;
    color: var(--color-text-primary);
    overflow-x: auto;
    margin: 0;
  }

  .font-preview code {
    font-family: inherit;
  }
</style>
