<script lang="ts">
  import { runConfigs, activeRunConfigId, type RunConfig } from '$lib/stores/runConfigs';

  let {
    onclose,
  }: {
    onclose: () => void;
  } = $props();

  // Form state for adding/editing
  let editingId = $state<string | null>(null);
  let form = $state({
    name: '',
    command: '',
    cwd: '.',
    envText: '', // key=value pairs separated by newlines
  });

  let formError = $state('');

  function startAdd() {
    editingId = null;
    form = { name: '', command: '', cwd: '.', envText: '' };
    formError = '';
    showForm = true;
  }

  function startEdit(config: RunConfig) {
    editingId = config.id;
    const envText = config.env
      ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`).join('\n')
      : '';
    form = {
      name: config.name,
      command: config.command,
      cwd: config.cwd,
      envText,
    };
    formError = '';
    showForm = true;
  }

  function cancelForm() {
    showForm = false;
    formError = '';
  }

  function parseEnv(text: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1);
      }
    }
    return result;
  }

  function saveForm() {
    if (!form.name.trim()) {
      formError = 'Name is required';
      return;
    }
    if (!form.command.trim()) {
      formError = 'Command is required';
      return;
    }

    const env = form.envText.trim() ? parseEnv(form.envText) : undefined;

    if (editingId) {
      runConfigs.updateConfig(editingId, {
        name: form.name.trim(),
        command: form.command.trim(),
        cwd: form.cwd.trim() || '.',
        env,
      });
    } else {
      const newConfig = runConfigs.add({
        name: form.name.trim(),
        command: form.command.trim(),
        cwd: form.cwd.trim() || '.',
        env,
      });
      // Auto-select newly created config
      activeRunConfigId.set(newConfig.id);
    }

    showForm = false;
    formError = '';
  }

  function deleteConfig(id: string) {
    runConfigs.remove(id);
    const current = $activeRunConfigId;
    if (current === id) {
      const remaining = $runConfigs;
      activeRunConfigId.set(remaining.length > 0 ? remaining[0].id : null);
    }
    if (editingId === id) showForm = false;
  }

  function selectConfig(id: string) {
    activeRunConfigId.set(id);
  }

  let showForm = $state(false);

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showForm) cancelForm();
      else onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="dialog-backdrop" onclick={onclose} onkeydown={handleKeydown} role="dialog" aria-modal="true">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <div class="dialog-header">
      <div class="dialog-title">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.25 3v10l8.5-5-8.5-5Z"/>
        </svg>
        Run Configurations
      </div>
      <button class="dialog-close" onclick={onclose} aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>

    <div class="dialog-body">
      <!-- Config list -->
      <div class="config-list">
        <div class="config-list-header">
          <span class="config-list-title">Configurations</span>
          <button class="add-btn" onclick={startAdd} title="Add configuration">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>

        {#if $runConfigs.length === 0}
          <div class="config-empty">
            <p>No configurations yet.</p>
            <button class="btn-link" onclick={startAdd}>Add one</button>
          </div>
        {:else}
          <div class="config-items">
            {#each $runConfigs as config}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="config-item"
                class:selected={$activeRunConfigId === config.id}
                onclick={() => selectConfig(config.id)}
                onkeydown={(e) => e.key === 'Enter' && selectConfig(config.id)}
                role="option"
                aria-selected={$activeRunConfigId === config.id}
                tabindex="0"
              >
                <div class="config-item-info">
                  <div class="config-item-name">{config.name}</div>
                  <div class="config-item-cmd">{config.command}</div>
                </div>
                <div class="config-item-actions">
                  <button
                    class="icon-btn"
                    onclick={(e) => { e.stopPropagation(); startEdit(config); }}
                    title="Edit"
                    aria-label="Edit configuration"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    class="icon-btn danger"
                    onclick={(e) => { e.stopPropagation(); deleteConfig(config.id); }}
                    title="Delete"
                    aria-label="Delete configuration"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Form panel -->
      <div class="form-panel">
        {#if showForm}
          <div class="form-title">{editingId ? 'Edit Configuration' : 'New Configuration'}</div>

          <div class="form-group">
            <label class="form-label" for="rc-name">Name</label>
            <input
              id="rc-name"
              class="form-input"
              bind:value={form.name}
              placeholder="e.g. Dev Server"
              autocomplete="off"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="rc-command">Command</label>
            <input
              id="rc-command"
              class="form-input"
              bind:value={form.command}
              placeholder="e.g. npm run dev"
              autocomplete="off"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="rc-cwd">Working Directory <span class="form-hint">(relative to workspace)</span></label>
            <input
              id="rc-cwd"
              class="form-input"
              bind:value={form.cwd}
              placeholder="e.g. . or frontend"
              autocomplete="off"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="rc-env">Environment Variables <span class="form-hint">(optional, KEY=VALUE per line)</span></label>
            <textarea
              id="rc-env"
              class="form-textarea"
              bind:value={form.envText}
              placeholder="NODE_ENV=development&#10;PORT=3000"
              rows="4"
            ></textarea>
          </div>

          {#if formError}
            <div class="form-error">{formError}</div>
          {/if}

          <div class="form-actions">
            <button class="btn-secondary" onclick={cancelForm}>Cancel</button>
            <button class="btn-primary" onclick={saveForm}>Save</button>
          </div>
        {:else}
          <div class="form-placeholder">
            {#if $runConfigs.length === 0}
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 12px">
                <path d="M4.25 3v10l8.5-5-8.5-5Z"/>
              </svg>
              <p>Add a run configuration to get started</p>
              <button class="btn-primary" onclick={startAdd}>Add Configuration</button>
            {:else}
              <p>Select a configuration to edit, or add a new one</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="dialog-footer">
      <button class="btn-secondary" onclick={onclose}>Close</button>
    </div>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .dialog {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    width: 680px;
    max-width: 96vw;
    height: 480px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }

  .dialog-header {
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .dialog-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
    flex: 1;
  }

  .dialog-close {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .dialog-close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .dialog-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  /* Config list */
  .config-list {
    width: 240px;
    flex-shrink: 0;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .config-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  .config-list-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
  }

  .add-btn {
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
    transition: all 0.1s;
  }

  .add-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-accent);
  }

  .config-items {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .config-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    gap: 8px;
    color: var(--color-text-muted);
    font-size: 12px;
    text-align: center;
  }

  .config-empty p {
    margin: 0;
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--color-accent);
    cursor: pointer;
    font-size: 12px;
    padding: 0;
    font-family: inherit;
  }

  .btn-link:hover {
    text-decoration: underline;
  }

  .config-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.1s;
    border-left: 3px solid transparent;
  }

  .config-item:hover {
    background: var(--color-bg-hover);
  }

  .config-item.selected {
    background: var(--color-bg-active);
    border-left-color: var(--color-accent);
  }

  .config-item-info {
    flex: 1;
    min-width: 0;
  }

  .config-item-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .config-item-cmd {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-editor, monospace);
    margin-top: 1px;
  }

  .config-item-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .config-item:hover .config-item-actions {
    opacity: 1;
  }

  .icon-btn {
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .icon-btn:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .icon-btn.danger:hover {
    color: var(--color-error, #f87171);
  }

  /* Form panel */
  .form-panel {
    flex: 1;
    padding: 16px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--color-text-muted);
    font-size: 13px;
    text-align: center;
  }

  .form-placeholder p {
    margin: 0;
  }

  .form-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 4px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .form-hint {
    font-weight: 400;
    color: var(--color-text-muted);
  }

  .form-input,
  .form-textarea {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 13px;
    font-family: inherit;
    color: var(--color-text-primary);
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }

  .form-textarea {
    font-family: var(--font-editor, monospace);
    font-size: 12px;
    resize: vertical;
    min-height: 72px;
  }

  .form-input:focus,
  .form-textarea:focus {
    border-color: var(--color-accent);
  }

  .form-error {
    font-size: 12px;
    color: var(--color-error, #f87171);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .dialog-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
  }

  .btn-primary,
  .btn-secondary {
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .btn-primary:hover {
    background: var(--color-accent-hover);
  }

  .btn-secondary {
    background: transparent;
    color: var(--color-text-secondary);
    border-color: var(--color-border);
  }

  .btn-secondary:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
</style>
