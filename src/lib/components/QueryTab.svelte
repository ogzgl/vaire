<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { dbConnections, type DbConnectionConfig } from '$lib/stores/dbConnections';
  import { activeTheme, fontSettings } from '$lib/stores/theme';

  let {
    connectionId,
    initialQuery = '',
  }: {
    connectionId: string;
    initialQuery?: string;
  } = $props();

  interface QueryResult {
    columns: string[];
    column_types: string[];
    rows: (string | null)[][];
    affected_rows: number;
    execution_time_ms: number;
  }

  let query = $state(initialQuery);
  let result = $state<QueryResult | null>(null);
  let error = $state('');
  let running = $state(false);
  let editorEl: HTMLTextAreaElement | null = null;

  // Cell editing
  let editingCell = $state<{ row: number; col: number } | null>(null);
  let editValue = $state('');
  let pendingChanges = $state<Map<string, string>>(new Map());

  // Row selection
  let selectedRows = $state<Set<number>>(new Set());

  // Column sorting
  let sortCol = $state<number | null>(null);
  let sortAsc = $state(true);

  // Insert mode
  let insertingRow = $state(false);
  let insertValues = $state<string[]>([]);

  // Split resize
  let splitPercent = $state(40);
  let isDragging = $state(false);
  let wrapperEl: HTMLDivElement | null = null;

  // Prod warning
  let prodWarning = $state<{ query: string; force: boolean } | null>(null);

  let connection = $derived($dbConnections.find(c => c.id === connectionId));
  let isMongoDb = $derived(connection?.dbType === 'mongodb');

  let sortedRows = $derived.by(() => {
    if (!result || sortCol === null) return result?.rows ?? [];
    const col = sortCol;
    const asc = sortAsc;
    return [...result.rows].sort((a, b) => {
      const va = a[col] ?? '';
      const vb = b[col] ?? '';
      const na = Number(va);
      const nb = Number(vb);
      if (!isNaN(na) && !isNaN(nb)) return asc ? na - nb : nb - na;
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  });

  async function executeQuery(forceOnProd = false) {
    if (!query.trim() || running) return;
    running = true;
    error = '';
    result = null;
    prodWarning = null;

    try {
      const res = await invoke<QueryResult>('db_execute_query', {
        connectionId,
        query: query.trim(),
        isProd: connection?.isProd ?? false,
        force: forceOnProd,
      });
      result = res;
      sortCol = null;
      editingCell = null;
      pendingChanges.clear();
      selectedRows.clear();
      insertingRow = false;
    } catch (e) {
      const errStr = String(e);
      // Check for prod warning
      try {
        const parsed = JSON.parse(errStr);
        if (parsed.prod_warning) {
          prodWarning = { query: parsed.query || query.trim(), force: true };
          running = false;
          return;
        }
      } catch {}
      error = errStr;
    }
    running = false;
  }

  function handleEditorKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      executeQuery();
    }
  }

  function toggleSort(colIdx: number) {
    if (sortCol === colIdx) {
      sortAsc = !sortAsc;
    } else {
      sortCol = colIdx;
      sortAsc = true;
    }
  }

  function startEdit(rowIdx: number, colIdx: number) {
    if (!result) return;
    editingCell = { row: rowIdx, col: colIdx };
    const val = sortedRows[rowIdx]?.[colIdx];
    editValue = val ?? '';
  }

  async function saveEdit() {
    if (!editingCell || !result || !connection) return;
    const { row, col } = editingCell;
    const newVal = editValue;
    const pkCol = result.columns[0]; // assume first column is PK
    const pkVal = sortedRows[row]?.[0];
    const column = result.columns[col];

    if (pkVal === null || pkVal === undefined) {
      error = 'Cannot edit: no primary key value';
      editingCell = null;
      return;
    }

    try {
      await invoke('db_update_cell', {
        connectionId,
        schema: 'public',
        table: guessTableFromQuery(),
        pkColumn: pkCol,
        pkValue: pkVal,
        column,
        newValue: newVal === '' ? null : newVal,
        isProd: connection.isProd,
        force: false,
      });
      // Update local data
      const actualRow = sortedRows[row];
      if (actualRow) actualRow[col] = newVal || null;
      pendingChanges.set(`${row}-${col}`, newVal);
    } catch (e) {
      const errStr = String(e);
      try {
        const parsed = JSON.parse(errStr);
        if (parsed.prod_warning) {
          prodWarning = { query: parsed.query || `UPDATE ... SET ${column} = '${newVal}'`, force: true };
          editingCell = null;
          return;
        }
      } catch {}
      error = errStr;
    }
    editingCell = null;
  }

  function cancelEdit() {
    editingCell = null;
  }

  function handleCellKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  }

  function guessTableFromQuery(): string {
    // Best effort: extract table name from the query
    const match = query.match(/FROM\s+(?:(\w+)\.)?(\w+)/i);
    return match ? (match[1] ? `${match[1]}.${match[2]}` : match[2]) : 'unknown';
  }

  function startInsertRow() {
    if (!result) return;
    insertingRow = true;
    insertValues = result.columns.map(() => '');
  }

  async function saveInsertRow() {
    if (!result || !connection) return;
    const table = guessTableFromQuery();
    const rowData: Record<string, string | null> = {};
    result.columns.forEach((col, i) => {
      rowData[col] = insertValues[i]?.trim() || null;
    });

    try {
      await invoke('db_insert_row', {
        connectionId,
        schema: 'public',
        table,
        rowData,
        isProd: connection.isProd,
        force: false,
      });
      insertingRow = false;
      // Re-run query to see new row
      await executeQuery();
    } catch (e) {
      error = String(e);
    }
  }

  async function deleteSelectedRows() {
    if (!result || !connection || selectedRows.size === 0) return;
    const pkCol = result.columns[0];
    const pkValues = [...selectedRows].map(i => sortedRows[i]?.[0]).filter(Boolean) as string[];

    try {
      await invoke('db_delete_rows', {
        connectionId,
        schema: 'public',
        table: guessTableFromQuery(),
        pkColumn: pkCol,
        pkValues,
        isProd: connection.isProd,
        force: false,
      });
      selectedRows.clear();
      await executeQuery();
    } catch (e) {
      error = String(e);
    }
  }

  function toggleRowSelect(idx: number) {
    const newSet = new Set(selectedRows);
    if (newSet.has(idx)) newSet.delete(idx);
    else newSet.add(idx);
    selectedRows = newSet;
  }

  function startDrag(e: MouseEvent) {
    e.preventDefault();
    isDragging = true;
    const startY = e.clientY;
    const startPct = splitPercent;

    function onMove(ev: MouseEvent) {
      if (!wrapperEl) return;
      const h = wrapperEl.getBoundingClientRect().height;
      splitPercent = Math.max(15, Math.min(85, startPct + ((ev.clientY - startY) / h) * 100));
    }
    function onUp() {
      isDragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function confirmProdAction() {
    if (!prodWarning) return;
    prodWarning = null;
    await executeQuery(true);
  }

  onMount(() => {
    editorEl?.focus();
  });
</script>

<div class="query-tab" bind:this={wrapperEl}>
  <!-- Editor area -->
  <div class="editor-section" style="height: {splitPercent}%">
    <div class="editor-toolbar">
      <span class="conn-label">
        {#if connection}
          <span class="conn-dot" class:dot-prod={connection.isProd}></span>
          {connection.label}
        {:else}
          Disconnected
        {/if}
      </span>
      <div class="toolbar-right">
        <span class="shortcut-hint">Cmd+Enter</span>
        <button class="run-btn" onclick={() => executeQuery()} disabled={running}>
          {#if running}
            Running...
          {:else}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Run
          {/if}
        </button>
      </div>
    </div>
    <textarea
      class="query-editor"
      bind:this={editorEl}
      bind:value={query}
      onkeydown={handleEditorKeydown}
      placeholder={isMongoDb ? '{ "collection": "users", "operation": "find", "filter": {} }' : 'SELECT * FROM users LIMIT 100'}
      spellcheck="false"
    ></textarea>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="split-handle" onmousedown={startDrag}></div>

  <!-- Results area -->
  <div class="results-section" style="height: {100 - splitPercent}%">
    {#if error}
      <div class="result-error">{error}</div>
    {:else if result}
      <div class="result-toolbar">
        <span class="result-status">
          {#if result.columns.length > 0}
            {result.rows.length} rows in {result.execution_time_ms}ms
          {:else}
            {result.affected_rows} rows affected in {result.execution_time_ms}ms
          {/if}
        </span>
        <div class="result-actions">
          <button class="small-btn" onclick={startInsertRow} title="Insert row">+</button>
          {#if selectedRows.size > 0}
            <button class="small-btn danger" onclick={deleteSelectedRows} title="Delete selected">
              Del ({selectedRows.size})
            </button>
          {/if}
        </div>
      </div>

      {#if result.columns.length > 0}
        <div class="grid-wrapper">
          <table class="result-grid">
            <thead>
              <tr>
                <th class="row-num-col">#</th>
                <th class="checkbox-col">
                  <input type="checkbox" />
                </th>
                {#each result.columns as col, ci}
                  <th onclick={() => toggleSort(ci)} class="sortable">
                    {col}
                    {#if result.column_types[ci]}
                      <span class="col-type">{result.column_types[ci]}</span>
                    {/if}
                    {#if sortCol === ci}
                      <span class="sort-arrow">{sortAsc ? '\u25B2' : '\u25BC'}</span>
                    {/if}
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each sortedRows as row, ri}
                <tr class:row-selected={selectedRows.has(ri)}>
                  <td class="row-num-col">{ri + 1}</td>
                  <td class="checkbox-col">
                    <input type="checkbox" checked={selectedRows.has(ri)} onchange={() => toggleRowSelect(ri)} />
                  </td>
                  {#each row as cell, ci}
                    <td
                      class:cell-null={cell === null}
                      class:cell-changed={pendingChanges.has(`${ri}-${ci}`)}
                      onclick={() => startEdit(ri, ci)}
                    >
                      {#if editingCell?.row === ri && editingCell?.col === ci}
                        <!-- svelte-ignore a11y_autofocus -->
                        <input
                          class="cell-edit-input"
                          bind:value={editValue}
                          onkeydown={handleCellKeydown}
                          onblur={cancelEdit}
                          autofocus
                        />
                      {:else}
                        {cell === null ? 'NULL' : cell}
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
              {#if insertingRow}
                <tr class="insert-row">
                  <td class="row-num-col">*</td>
                  <td class="checkbox-col"></td>
                  {#each insertValues as _, ci}
                    <td>
                      <input
                        class="cell-edit-input"
                        bind:value={insertValues[ci]}
                        onkeydown={(e) => { if (e.key === 'Enter' && ci === insertValues.length - 1) saveInsertRow(); }}
                        placeholder={result.columns[ci]}
                      />
                    </td>
                  {/each}
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      {/if}
    {:else if !running}
      <div class="result-placeholder">Run a query to see results</div>
    {:else}
      <div class="result-placeholder">Running query...</div>
    {/if}
  </div>
</div>

<!-- Prod warning modal -->
{#if prodWarning}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="prod-backdrop" onclick={() => prodWarning = null} onkeydown={(e) => e.key === 'Escape' && (prodWarning = null)} role="dialog" aria-modal="true">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="prod-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="prod-banner">You are modifying a PRODUCTION database</div>
      <div class="prod-query">{prodWarning.query}</div>
      <div class="prod-actions">
        <button class="btn-secondary" onclick={() => prodWarning = null}>Cancel</button>
        <button class="btn-danger" onclick={confirmProdAction}>Execute Anyway</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .query-tab {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg-base);
  }

  .editor-section {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 12px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    background: var(--color-bg-surface);
  }

  .conn-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .conn-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-success);
  }

  .conn-dot.dot-prod { background: var(--color-error); }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .shortcut-hint {
    font-size: 10px;
    color: var(--color-text-muted);
    padding: 2px 6px;
    background: var(--color-bg-elevated);
    border-radius: 3px;
    border: 1px solid var(--color-border);
  }

  .run-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    background: var(--color-accent);
    color: white;
    border: none;
    border-radius: 5px;
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .run-btn:hover:not(:disabled) { background: var(--color-accent-hover); }
  .run-btn:disabled { opacity: 0.5; cursor: default; }

  .query-editor {
    flex: 1;
    padding: 10px 14px;
    background: var(--color-bg-base);
    color: var(--color-text-primary);
    font-family: var(--font-editor, 'SF Mono', monospace);
    font-size: 13px;
    line-height: 1.5;
    border: none;
    outline: none;
    resize: none;
    overflow: auto;
  }

  .query-editor::placeholder { color: var(--color-text-muted); }

  .split-handle {
    height: 4px;
    background: var(--color-border);
    cursor: row-resize;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .split-handle:hover { background: var(--color-accent); }

  .results-section {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .result-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 12px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    background: var(--color-bg-surface);
  }

  .result-status {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .result-actions {
    display: flex;
    gap: 4px;
  }

  .small-btn {
    padding: 2px 8px;
    font-size: 11px;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
  }

  .small-btn:hover { background: var(--color-bg-hover); }
  .small-btn.danger { color: var(--color-error); border-color: var(--color-error); }

  .result-error {
    padding: 12px;
    font-size: 12px;
    color: var(--color-error);
    font-family: var(--font-editor, monospace);
    white-space: pre-wrap;
    overflow: auto;
  }

  .result-placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .grid-wrapper {
    flex: 1;
    overflow: auto;
  }

  .result-grid {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
    font-family: var(--font-editor, 'SF Mono', monospace);
    font-size: 12px;
  }

  .result-grid thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .result-grid th {
    background: var(--color-bg-surface);
    color: var(--color-text-secondary);
    font-weight: 600;
    font-size: 11px;
    padding: 5px 12px;
    border-bottom: 2px solid var(--color-border);
    text-align: left;
    white-space: nowrap;
    user-select: none;
  }

  .result-grid th.sortable { cursor: pointer; }
  .result-grid th.sortable:hover { color: var(--color-text-primary); }

  .col-type {
    font-weight: 400;
    color: var(--color-text-muted);
    margin-left: 4px;
    font-size: 10px;
  }

  .sort-arrow {
    font-size: 9px;
    margin-left: 2px;
    color: var(--color-accent);
  }

  .row-num-col {
    width: 40px;
    text-align: right;
    color: var(--color-text-muted) !important;
    font-weight: 400 !important;
    padding-right: 8px !important;
  }

  .checkbox-col {
    width: 24px;
    text-align: center;
    padding: 0 4px !important;
  }

  .result-grid td {
    padding: 4px 12px;
    border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.05));
    color: var(--color-text-primary);
    white-space: nowrap;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: text;
  }

  .result-grid tbody tr:nth-child(even) { background: rgba(255,255,255,0.02); }
  .result-grid tbody tr:hover { background: var(--color-bg-hover); }
  .result-grid tbody tr.row-selected { background: var(--color-accent-subtle); }

  .cell-null {
    color: var(--color-text-muted) !important;
    font-style: italic;
  }

  .cell-changed {
    background: rgba(59, 130, 246, 0.1) !important;
  }

  .cell-edit-input {
    width: 100%;
    background: var(--color-bg-base);
    border: 1px solid var(--color-accent);
    border-radius: 2px;
    padding: 1px 4px;
    font-family: inherit;
    font-size: inherit;
    color: var(--color-text-primary);
    outline: none;
    box-sizing: border-box;
  }

  .insert-row td {
    background: rgba(34, 197, 94, 0.05);
  }

  /* Prod warning modal */
  .prod-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    backdrop-filter: blur(2px);
  }

  .prod-modal {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    width: 480px;
    max-width: 96vw;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  }

  .prod-banner {
    background: var(--color-error);
    color: white;
    padding: 12px 20px;
    font-size: 14px;
    font-weight: 600;
    text-align: center;
  }

  .prod-query {
    padding: 16px 20px;
    font-family: var(--font-editor, monospace);
    font-size: 12px;
    color: var(--color-text-secondary);
    white-space: pre-wrap;
    max-height: 200px;
    overflow: auto;
    border-bottom: 1px solid var(--color-border);
  }

  .prod-actions {
    padding: 12px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn-secondary {
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }

  .btn-secondary:hover {
    background: var(--color-bg-hover);
  }

  .btn-danger {
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
    background: var(--color-error);
    color: white;
    border: 1px solid var(--color-error);
  }

  .btn-danger:hover { opacity: 0.9; }

  /* Scrollbar styling for grid */
  .grid-wrapper::-webkit-scrollbar { width: 8px; height: 8px; }
  .grid-wrapper::-webkit-scrollbar-track { background: transparent; }
  .grid-wrapper::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }
</style>
