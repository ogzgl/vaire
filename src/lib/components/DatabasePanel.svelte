<script lang="ts">
  import { untrack } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { dbConnections, removeConnection, type DbConnectionConfig } from '$lib/stores/dbConnections';
  import { openQueryTab } from '$lib/stores/workspace';

  interface SchemaNode {
    name: string;
    expanded: boolean;
    tables: TableNode[];
    loading: boolean;
  }

  interface TableNode {
    name: string;
    tableType: string;
    columnCount?: number;
  }

  interface ConnectionNode {
    config: DbConnectionConfig;
    connected: boolean;
    connecting: boolean;
    schemas: SchemaNode[];
    schemasLoaded: boolean;
    error: string;
  }

  let nodes = $state<ConnectionNode[]>([]);
  let contextMenu = $state<{ x: number; y: number; node: ConnectionNode } | null>(null);

  // Sync connection nodes with store when configs change
  $effect(() => {
    const configs = $dbConnections;
    // Use untrack to read `nodes` without creating a circular dependency
    const currentNodes = untrack(() => nodes);
    const existing = new Map(currentNodes.map(n => [n.config.id, n]));
    nodes = configs.map(c => existing.get(c.id) ?? {
      config: c,
      connected: false,
      connecting: false,
      schemas: [],
      schemasLoaded: false,
      error: '',
    });
  });

  async function toggleConnect(node: ConnectionNode) {
    if (node.connected) {
      // Disconnect
      try {
        await invoke('db_disconnect', { connectionId: node.config.id });
      } catch {}
      node.connected = false;
      node.schemas = [];
      node.schemasLoaded = false;
      node.error = '';
      nodes = [...nodes];
      return;
    }

    node.connecting = true;
    node.error = '';
    nodes = [...nodes];

    try {
      await invoke('db_connect', { config: node.config });
      node.connected = true;
      node.connecting = false;

      // Load schemas
      const schemas = await invoke<string[]>('db_list_schemas', { connectionId: node.config.id });
      node.schemas = schemas.map(s => ({ name: s, expanded: false, tables: [], loading: false }));
      node.schemasLoaded = true;
    } catch (e) {
      node.connecting = false;
      node.error = String(e);
    }
    nodes = [...nodes];
  }

  async function toggleSchema(connNode: ConnectionNode, schema: SchemaNode) {
    schema.expanded = !schema.expanded;
    if (schema.expanded && schema.tables.length === 0) {
      schema.loading = true;
      nodes = [...nodes];
      try {
        const tables = await invoke<{ name: string; table_type: string }[]>('db_list_tables', {
          connectionId: connNode.config.id,
          schema: schema.name,
        });
        schema.tables = tables.map(t => ({ name: t.name, tableType: t.table_type }));
      } catch (e) {
        connNode.error = String(e);
      }
      schema.loading = false;
    }
    nodes = [...nodes];
  }

  function handleTableClick(connNode: ConnectionNode, schema: SchemaNode, table: TableNode) {
    const schemaPrefix = connNode.config.dbType === 'mongodb' ? '' : `${schema.name}.`;
    const query = connNode.config.dbType === 'mongodb'
      ? `{ "collection": "${table.name}", "operation": "find", "filter": {} }`
      : `SELECT * FROM ${schemaPrefix}${table.name} LIMIT 100`;
    openQueryTab(connNode.config.id, `${connNode.config.label} - ${table.name}`, query);
  }

  function openAddDialog() {
    window.dispatchEvent(new CustomEvent('vaire:db-dialog', { detail: { config: null } }));
  }

  function openEditDialog(config: DbConnectionConfig) {
    window.dispatchEvent(new CustomEvent('vaire:db-dialog', { detail: { config } }));
    contextMenu = null;
  }

  async function handleRemove(node: ConnectionNode) {
    if (node.connected) {
      try { await invoke('db_disconnect', { connectionId: node.config.id }); } catch {}
    }
    removeConnection(node.config.id);
    contextMenu = null;
  }

  function handleContextMenu(e: MouseEvent, node: ConnectionNode) {
    e.preventDefault();
    e.stopPropagation();
    contextMenu = { x: e.clientX, y: e.clientY, node };
  }

  // Dialog is now rendered at root level via +page.svelte
</script>

<div class="db-panel">
  <div class="panel-toolbar">
    <button class="add-btn" onclick={openAddDialog} title="Add Connection">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M12 5v14M5 12h14"/>
      </svg>
    </button>
  </div>

  <div class="tree-view">
    {#if nodes.length === 0}
      <div class="empty-msg">
        <p>No connections.</p>
        <button class="link-btn" onclick={openAddDialog}>Add one</button>
      </div>
    {:else}
      {#each nodes as node}
        <!-- Connection -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="tree-item connection"
          onclick={() => toggleConnect(node)}
          oncontextmenu={(e) => handleContextMenu(e, node)}
          role="treeitem"
          tabindex="0"
        >
          <svg class="chevron" class:expanded={node.connected && node.schemasLoaded} width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4"/>
          </svg>
          <span class="conn-dot" class:dot-connected={node.connected} class:dot-disconnected={!node.connected && !node.connecting} class:dot-connecting={node.connecting}></span>
          <span class="tree-label" class:prod-label={node.config.isProd}>
            {node.config.label}
            {#if node.config.isProd}
              <span class="prod-badge">PROD</span>
            {/if}
          </span>
          {#if node.connecting}
            <span class="connecting-text">connecting...</span>
          {/if}
        </div>

        {#if node.error}
          <div class="tree-error" style="padding-left: 36px">{node.error}</div>
        {/if}

        {#if node.connected && node.schemasLoaded}
          {#each node.schemas as schema}
            <!-- Schema -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="tree-item schema"
              style="padding-left: 28px"
              onclick={() => toggleSchema(node, schema)}
              role="treeitem"
              tabindex="0"
            >
              <svg class="chevron" class:expanded={schema.expanded} width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 4l4 4-4 4"/>
              </svg>
              <span class="tree-label">{schema.name}</span>
              {#if schema.loading}
                <span class="connecting-text">loading...</span>
              {/if}
            </div>

            {#if schema.expanded}
              {#each schema.tables as table}
                <!-- Table -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="tree-item table"
                  style="padding-left: 48px"
                  onclick={() => handleTableClick(node, schema, table)}
                  role="treeitem"
                  tabindex="0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 9h18M3 15h18M9 3v18"/>
                  </svg>
                  <span class="tree-label">{table.name}</span>
                </div>
              {/each}
              {#if schema.tables.length === 0 && !schema.loading}
                <div class="tree-empty" style="padding-left: 48px">No tables</div>
              {/if}
            {/if}
          {/each}
        {/if}
      {/each}
    {/if}
  </div>
</div>

<!-- Context menu -->
{#if contextMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="ctx-backdrop" onclick={() => contextMenu = null}>
    <div class="ctx-menu" style="left: {contextMenu.x}px; top: {contextMenu.y}px" onclick={(e) => e.stopPropagation()}>
      <button class="ctx-item" onclick={() => openEditDialog(contextMenu!.node.config)}>Edit</button>
      <button class="ctx-item danger" onclick={() => handleRemove(contextMenu!.node)}>Remove</button>
    </div>
  </div>
{/if}

<!-- Dialog rendered at root level in +page.svelte -->

<style>
  .db-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 6px 10px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
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
  }

  .add-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-accent);
  }

  .tree-view {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .empty-msg {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 16px;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .empty-msg p { margin: 0; }

  .link-btn {
    background: none;
    border: none;
    color: var(--color-accent);
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
  }

  .link-btn:hover { text-decoration: underline; }

  .tree-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.1s;
  }

  .tree-item:hover { background: var(--color-bg-hover); }

  .chevron {
    flex-shrink: 0;
    color: var(--color-text-muted);
    transition: transform 0.15s;
  }

  .chevron.expanded { transform: rotate(90deg); }

  .conn-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-connected { background: var(--color-success); }
  .dot-disconnected { background: var(--color-text-muted); }
  .dot-connecting { background: var(--color-warning, #f59e0b); animation: pulse 1s infinite; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .tree-label {
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .prod-label { font-weight: 600; }

  .prod-badge {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--color-error);
    color: #fff;
    font-weight: 700;
    margin-left: 4px;
    vertical-align: middle;
  }

  .connecting-text {
    font-size: 10px;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .tree-error {
    font-size: 11px;
    color: var(--color-error);
    padding: 2px 10px;
  }

  .tree-empty {
    font-size: 11px;
    color: var(--color-text-muted);
    padding: 4px 10px;
    font-style: italic;
  }

  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
  }

  .ctx-menu {
    position: fixed;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 4px;
    min-width: 120px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 101;
  }

  .ctx-item {
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
  }

  .ctx-item:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .ctx-item.danger:hover { color: var(--color-error); }
</style>
