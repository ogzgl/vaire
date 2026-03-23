<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { addConnection, updateConnection, type DbConnectionConfig } from '$lib/stores/dbConnections';


  let {
    editConfig = null,
    onclose,
  }: {
    editConfig?: DbConnectionConfig | null;
    onclose: () => void;
  } = $props();

  let form = $state({
    label: editConfig?.label ?? '',
    dbType: (editConfig?.dbType ?? 'postgres') as 'postgres' | 'mongodb',
    host: editConfig?.host ?? 'localhost',
    port: editConfig?.port ?? 5432,
    database: editConfig?.database ?? '',
    username: editConfig?.username ?? '',
    password: editConfig?.password ?? '',
    isProd: editConfig?.isProd ?? false,
    ssl: editConfig?.ssl ?? false,
  });

  let testing = $state(false);
  let testResult = $state<{ ok: boolean; msg: string } | null>(null);
  let formError = $state('');

  function onDbTypeChange() {
    if (form.dbType === 'mongodb') {
      form.port = 27017;
    } else {
      form.port = 5432;
    }
  }

  async function testConnection() {
    testing = true;
    testResult = null;
    try {
      await invoke('db_test_connection', {
        config: {
          id: 'test',
          label: form.label,
          dbType: form.dbType,
          host: form.host,
          port: form.port,
          database: form.database,
          username: form.username,
          password: form.password,
          isProd: form.isProd,
          ssl: form.ssl,
        },
      });
      testResult = { ok: true, msg: 'Connection successful' };
    } catch (e) {
      testResult = { ok: false, msg: String(e) };
    }
    testing = false;
  }

  function save() {
    if (!form.label.trim()) { formError = 'Label is required'; return; }
    if (!form.host.trim()) { formError = 'Host is required'; return; }
    if (!form.database.trim()) { formError = 'Database is required'; return; }

    const data = {
      label: form.label.trim(),
      dbType: form.dbType,
      host: form.host.trim(),
      port: form.port,
      database: form.database.trim(),
      username: form.username.trim(),
      password: form.password,
      isProd: form.isProd,
      ssl: form.ssl,
    };

    if (editConfig) {
      updateConnection(editConfig.id, data);
    } else {
      addConnection(data);
    }
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="dialog-backdrop" onclick={onclose} onkeydown={handleKeydown} role="dialog" aria-modal="true">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <div class="dialog-header">
      <span class="dialog-title">{editConfig ? 'Edit Connection' : 'New Connection'}</span>
      <button class="dialog-close" onclick={onclose} aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>

    <div class="dialog-body">
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label class="form-label" for="db-label">Label</label>
          <input id="db-label" class="form-input" bind:value={form.label} placeholder="e.g. local-postgres" autocomplete="off" />
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label" for="db-type">Type</label>
          <select id="db-type" class="form-input" bind:value={form.dbType} onchange={onDbTypeChange}>
            <option value="postgres">PostgreSQL</option>
            <option value="mongodb">MongoDB</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:3">
          <label class="form-label" for="db-host">Host</label>
          <input id="db-host" class="form-input" bind:value={form.host} placeholder="localhost" autocomplete="off" />
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label" for="db-port">Port</label>
          <input id="db-port" class="form-input" type="number" bind:value={form.port} />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="db-database">Database</label>
        <input id="db-database" class="form-input" bind:value={form.database} placeholder="mydb" autocomplete="off" />
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label class="form-label" for="db-user">Username</label>
          <input id="db-user" class="form-input" bind:value={form.username} placeholder="postgres" autocomplete="off" />
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label" for="db-pass">Password</label>
          <input id="db-pass" class="form-input" type="password" bind:value={form.password} autocomplete="off" />
        </div>
      </div>

      <div class="form-checks">
        <label class="check-label">
          <input type="checkbox" bind:checked={form.ssl} />
          <span>SSL</span>
        </label>
        <label class="check-label prod-check">
          <input type="checkbox" bind:checked={form.isProd} />
          <span>Production</span>
          {#if form.isProd}
            <span class="prod-warning">DML queries will require confirmation</span>
          {/if}
        </label>
      </div>

      {#if formError}
        <div class="form-error">{formError}</div>
      {/if}

      {#if testResult}
        <div class="test-result" class:test-ok={testResult.ok} class:test-fail={!testResult.ok}>
          {testResult.msg}
        </div>
      {/if}
    </div>

    <div class="dialog-footer">
      <button class="btn-secondary" onclick={testConnection} disabled={testing}>
        {testing ? 'Testing...' : 'Test Connection'}
      </button>
      <div class="footer-spacer"></div>
      <button class="btn-secondary" onclick={onclose}>Cancel</button>
      <button class="btn-primary" onclick={save}>Save</button>
    </div>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
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
    width: 500px;
    max-width: 96vw;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  }

  .dialog-header {
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dialog-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
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
  }

  .dialog-close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .dialog-body {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-row {
    display: flex;
    gap: 12px;
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

  .form-input {
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

  .form-input:focus { border-color: var(--color-accent); }

  select.form-input { cursor: pointer; }

  .form-checks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .check-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .check-label input { margin: 0; }

  .prod-warning {
    font-size: 10px;
    color: var(--color-error);
    margin-left: 8px;
  }

  .form-error {
    font-size: 12px;
    color: var(--color-error);
  }

  .test-result {
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 6px;
  }

  .test-ok {
    background: rgba(34, 197, 94, 0.1);
    color: var(--color-success);
  }

  .test-fail {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-error);
  }

  .dialog-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .footer-spacer { flex: 1; }

  .btn-primary, .btn-secondary {
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

  .btn-primary:hover { background: var(--color-accent-hover); }

  .btn-secondary {
    background: transparent;
    color: var(--color-text-secondary);
    border-color: var(--color-border);
  }

  .btn-secondary:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
