<script lang="ts">
  import { onMount } from 'svelte';
  import MonacoEditor from './MonacoEditor.svelte';

  let {
    content = '',
    path = '',
    repoPath = '',
  }: {
    content?: string;
    path?: string;
    repoPath?: string;
  } = $props();

  let renderedHtml = $state('');
  let marked: typeof import('marked') | null = null;

  onMount(async () => {
    marked = await import('marked');
    renderMarkdown();
  });

  function renderMarkdown() {
    if (!marked) return;
    try {
      renderedHtml = marked.marked(content) as string;
    } catch {
      renderedHtml = '<p>Failed to render markdown</p>';
    }
  }

  // Re-render when content changes (debounced via Monaco auto-save)
  $effect(() => {
    const _c = content;
    if (marked) {
      renderMarkdown();
    }
  });
</script>

<div class="markdown-split">
  <div class="md-source">
    <MonacoEditor
      {content}
      language="markdown"
      {path}
      {repoPath}
    />
  </div>
  <div class="md-divider"></div>
  <div class="md-preview">
    <div class="md-preview-content">
      {@html renderedHtml}
    </div>
  </div>
</div>

<style>
  .markdown-split {
    width: 100%;
    height: 100%;
    display: flex;
    overflow: hidden;
  }

  .md-source {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .md-divider {
    width: 1px;
    background: var(--color-border);
    flex-shrink: 0;
  }

  .md-preview {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    background: var(--color-bg-base);
  }

  .md-preview-content {
    padding: 20px 28px;
    font-family: var(--font-ui);
    font-size: 14px;
    line-height: 1.7;
    color: var(--color-text-primary);
    max-width: 720px;
  }

  .md-preview-content :global(h1) {
    font-size: 24px;
    font-weight: 700;
    margin: 24px 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
  }

  .md-preview-content :global(h2) {
    font-size: 20px;
    font-weight: 600;
    margin: 20px 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .md-preview-content :global(h3) {
    font-size: 16px;
    font-weight: 600;
    margin: 16px 0 8px;
  }

  .md-preview-content :global(p) {
    margin: 8px 0;
  }

  .md-preview-content :global(code) {
    background: var(--color-bg-elevated);
    padding: 2px 5px;
    border-radius: 3px;
    font-family: var(--font-editor);
    font-size: 0.9em;
  }

  .md-preview-content :global(pre) {
    background: var(--color-bg-elevated);
    padding: 12px 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 12px 0;
    border: 1px solid var(--color-border);
  }

  .md-preview-content :global(pre code) {
    background: none;
    padding: 0;
    font-size: 13px;
    line-height: 1.5;
  }

  .md-preview-content :global(a) {
    color: var(--color-accent);
    text-decoration: none;
  }

  .md-preview-content :global(a:hover) {
    text-decoration: underline;
  }

  .md-preview-content :global(blockquote) {
    border-left: 3px solid var(--color-accent);
    padding-left: 16px;
    margin: 12px 0;
    color: var(--color-text-secondary);
  }

  .md-preview-content :global(ul),
  .md-preview-content :global(ol) {
    padding-left: 24px;
    margin: 8px 0;
  }

  .md-preview-content :global(li) {
    margin: 4px 0;
  }

  .md-preview-content :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
  }

  .md-preview-content :global(th),
  .md-preview-content :global(td) {
    border: 1px solid var(--color-border);
    padding: 6px 12px;
    text-align: left;
  }

  .md-preview-content :global(th) {
    background: var(--color-bg-surface);
    font-weight: 600;
  }

  .md-preview-content :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 20px 0;
  }

  .md-preview-content :global(img) {
    max-width: 100%;
    border-radius: 4px;
  }
</style>
