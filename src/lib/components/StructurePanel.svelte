<script lang="ts">
  import { activeTab } from '$lib/stores/workspace';
  import type { OpenTab } from '$lib/stores/workspace';

  interface StructureItem {
    label: string;
    kind: string; // 'class' | 'function' | 'method' | 'const' | 'interface' | 'type' | 'export' | 'def'
    line: number; // 1-based
    indent: number;
  }

  // Emit event to scroll Monaco to line
  function navigateToLine(line: number) {
    window.dispatchEvent(new CustomEvent('vaire:goto-line', { detail: { line } }));
  }

  const KIND_ICONS: Record<string, string> = {
    class:     'C',
    interface: 'I',
    type:      'T',
    function:  'f',
    method:    'm',
    const:     '=',
    variable:  'v',
    def:       'f',
    fun:       'f',
    impl:      'i',
    export:    'e',
    struct:    'S',
    enum:      'E',
    trait:     'T',
  };

  const KIND_COLORS: Record<string, string> = {
    class:     '#a97bff',
    interface: '#3178c6',
    type:      '#e5c07b',
    function:  '#61afef',
    method:    '#61afef',
    const:     '#98c379',
    variable:  '#abb2bf',
    def:       '#61afef',
    fun:       '#a97bff',
    impl:      '#c678dd',
    export:    '#4d9cf5',
    struct:    '#e5c07b',
    enum:      '#e06c75',
    trait:     '#56b6c2',
  };

  // Regex patterns per language
  interface Pattern {
    re: RegExp;
    kind: string;
    // nameGroup: which capture group has the symbol name (default 1)
    nameGroup?: number;
  }

  const PATTERNS: Pattern[] = [
    // ── JavaScript / TypeScript / Svelte ──
    // export default class Foo / export class Foo / abstract class Foo / class Foo
    { re: /^[ \t]*(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)/, kind: 'class' },
    // export interface Foo / interface Foo
    { re: /^[ \t]*(?:export\s+)?interface\s+(\w+)/, kind: 'interface' },
    // export type Foo = / type Foo =
    { re: /^[ \t]*(?:export\s+)?type\s+(\w+)\s*[=<]/, kind: 'type' },
    // export default function foo / export async function foo / async function foo / function foo
    { re: /^[ \t]*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)/, kind: 'function' },
    // export const foo = async (...) => / export const foo = (...) => / const foo = async ( / const foo = (
    { re: /^[ \t]*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_$]\w*)\s*=>/, kind: 'function' },
    // export const FOO / const FOO / let FOO / var FOO (only uppercase-starting to reduce noise)
    { re: /^[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Z_$][a-zA-Z0-9_$]*)\s*[=;:]/, kind: 'const' },
    // Class method: foo(...) { or async foo() { (indented 2+ spaces)
    { re: /^[ \t]{2,}(?:(?:public|private|protected|static|async|override|abstract|get|set)\s+)*(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/, kind: 'method' },

    // ── Kotlin ──
    // fun name( / suspend fun name( / override fun name( / override suspend fun name(
    { re: /^[ \t]*(?:(?:public|private|protected|internal|override|open|suspend|inline|infix|operator|tailrec|external|expect|actual|abstract|private)\s+)*fun\s+((?!when\b|if\b|while\b|for\b|return\b)[a-zA-Z_]\w*)\s*[(<]/, kind: 'fun' },
    // class Name / data class Name / object Name / companion object (name may be absent)
    { re: /^[ \t]*(?:(?:public|private|protected|internal|data|sealed|abstract|open|inner|enum|annotation|value|inline)\s+)*(?:class|object)\s+(\w+)(?:[ \t(:{]|$)/, kind: 'class' },
    // companion object (no name)
    { re: /^[ \t]*companion\s+object(?:\s+(\w+))?/, kind: 'class' },
    // interface Name
    { re: /^[ \t]*(?:(?:public|private|protected|internal|sealed|functional|fun)\s+)*interface\s+(\w+)(?:[ \t:{]|$)/, kind: 'interface' },
    // val/var at file or class scope
    { re: /^[ \t]*(?:(?:public|private|protected|internal|override|open|abstract|lateinit|const)\s+)*(?:val|var)\s+([a-zA-Z_]\w*)\s*[=:,]/, kind: 'const' },

    // ── Python ──
    // def foo( / async def foo( (capture group 1 = indent, group 2 = name)
    { re: /^([ \t]*)(?:async\s+)?def\s+(\w+)\s*\(/, kind: 'def', nameGroup: 2 },
    // class Foo( / class Foo:
    { re: /^[ \t]*class\s+(\w+)(?:\(|:)/, kind: 'class' },

    // ── Go ──
    // func Name( — standalone function
    { re: /^func\s+(\w+)\s*\(/, kind: 'function' },
    // func (recv) Name( — method with receiver
    { re: /^func\s+\([^)]+\)\s+(\w+)\s*\(/, kind: 'method' },
    // type Name struct / type Name interface
    { re: /^type\s+(\w+)\s+(?:struct|interface)/, kind: 'class' },

    // ── Rust ──
    // fn foo / pub fn foo / pub(crate) fn foo / async fn foo / pub async fn foo
    { re: /^[ \t]*(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]/, kind: 'function' },
    // struct Name / pub struct Name
    { re: /^[ \t]*(?:pub(?:\([^)]+\))?\s+)?struct\s+(\w+)(?:[ \t<{;]|$)/, kind: 'struct' },
    // enum Name / pub enum Name
    { re: /^[ \t]*(?:pub(?:\([^)]+\))?\s+)?enum\s+(\w+)(?:[ \t<{]|$)/, kind: 'enum' },
    // trait Name / pub trait Name
    { re: /^[ \t]*(?:pub(?:\([^)]+\))?\s+)?trait\s+(\w+)(?:[ \t<{]|$)/, kind: 'trait' },
    // impl Name / impl<T> Name / impl Trait for Name
    { re: /^[ \t]*impl(?:<[^>]*>)?\s+(?:\w+\s+for\s+)?(\w+)(?:[ \t<{]|$)/, kind: 'impl' },

    // ── Ruby ──
    { re: /^([ \t]*)def\s+(\w+)(?:[ \t(]|$)/, kind: 'method', nameGroup: 2 },
  ];

  const SKIP_NAMES = new Set([
    'if','else','for','while','return','switch','case','try','catch',
    'when','with','by','in','is','as','it','to','do','end','new',
    'true','false','null','undefined','self','super','this',
  ]);

  function parseStructure(content: string, lang?: string): StructureItem[] {
    const items: StructureItem[] = [];
    if (!content) return items;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trimStart();
      const indent = rawLine.length - trimmed.length;

      // Skip blank lines and pure comment lines quickly
      if (!trimmed) continue;
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('<!--') ||
        trimmed.startsWith('--')
      ) continue;

      for (const pattern of PATTERNS) {
        const m = pattern.re.exec(rawLine);
        if (m) {
          const ng = pattern.nameGroup ?? 1;
          // For companion object the name may be absent — use 'companion object'
          const name = m[ng] ?? (pattern.re.source.includes('companion') ? 'companion object' : null);
          if (name && name.length >= 2 && !SKIP_NAMES.has(name)) {
            items.push({
              label: name,
              kind: pattern.kind,
              line: i + 1,
              indent: Math.floor(indent / 2),
            });
            break;
          }
        }
      }
    }

    // Deduplicate by line number
    const seen = new Set<number>();
    return items.filter(item => {
      if (seen.has(item.line)) return false;
      seen.add(item.line);
      return true;
    });
  }

  import { bookmarks, toggleBookmark } from '$lib/stores/bookmarks';

  // Svelte 5 runes: use $state + $effect to reactively re-parse when active tab changes
  let currentTab = $state<OpenTab | null>(null);
  let items = $state<StructureItem[]>([]);

  $effect(() => {
    // Subscribe to the activeTab store value by reading it
    const tab = $activeTab;
    currentTab = tab;
    if (!tab || tab.isDiff) {
      items = [];
    } else {
      // Re-parse whenever tab identity or content changes
      items = parseStructure(tab.content || '', tab.lang);
    }
  });

  function navigateToBookmark(b: typeof $bookmarks[number]) {
    if (currentTab?.path === b.filePath) {
      // Same file — just scroll
      window.dispatchEvent(new CustomEvent('vaire:goto-line', { detail: { line: b.line } }));
    } else {
      // Different file — open it
      window.dispatchEvent(new CustomEvent('vaire:open-file', { detail: { path: b.filePath } }));
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('vaire:goto-line', { detail: { line: b.line } }));
      }, 200);
    }
  }

  function removeBookmark(b: typeof $bookmarks[number]) {
    toggleBookmark(b.filePath, b.line);
  }
</script>

<div class="structure-panel">
  {#if !currentTab || currentTab.isDiff}
    <div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v8"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>
        <rect x="2" y="10" width="8" height="4" rx="1"/><rect x="14" y="10" width="8" height="4" rx="1"/>
      </svg>
      <span class="empty-text">Open a file to view its structure</span>
    </div>
  {:else if items.length === 0}
    <div class="empty-state">
      <span class="empty-text">No symbols found</span>
      <span class="empty-hint">({currentTab.lang || 'unknown'} file)</span>
    </div>
  {:else}
    <div class="structure-list">
      {#each items as item}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="structure-item"
          style="padding-left: {12 + item.indent * 14}px"
          onclick={() => navigateToLine(item.line)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && navigateToLine(item.line)}
        >
          <span
            class="kind-badge"
            style="color: {KIND_COLORS[item.kind] || 'var(--color-text-muted)'}"
          >{KIND_ICONS[item.kind] || '?'}</span>
          <span class="item-label">{item.label}</span>
          <span class="item-line">{item.line}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Bookmarks section -->
  {#if $bookmarks.length > 0}
    <div class="section-header">
      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="color: #f0a030">
        <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13.5a.5.5 0 0 1-.777.416L8 13.101l-5.223 2.815A.5.5 0 0 1 2 15.5V2zm2-1a1 1 0 0 0-1 1v12.566l4.723-2.482a.5.5 0 0 1 .554 0L13 14.566V2a1 1 0 0 0-1-1H4z"/>
      </svg>
      Bookmarks
      <span class="section-count">{$bookmarks.length}</span>
    </div>
    <div class="structure-list">
      {#each $bookmarks as bm}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="structure-item bookmark-item"
          onclick={() => navigateToBookmark(bm)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && navigateToBookmark(bm)}
        >
          <span class="kind-badge" style="color: #f0a030">◆</span>
          <span class="item-label bookmark-label">
            {bm.label || bm.filePath.split('/').pop() || bm.filePath}
          </span>
          <span class="item-line">{bm.line}</span>
          <!-- svelte-ignore a11y_consider_explicit_label -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <button
            class="bm-remove"
            onclick={(e) => { e.stopPropagation(); removeBookmark(bm); }}
            title="Remove bookmark"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .structure-panel {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: 8px;
  }

  .empty-text {
    color: var(--color-text-muted);
    font-size: 12px;
    text-align: center;
    padding: 0 16px;
  }

  .empty-hint {
    color: var(--color-text-muted);
    font-size: 11px;
    opacity: 0.7;
  }

  .structure-list {
    padding: 4px 0;
  }

  .structure-item {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 26px;
    padding-right: 12px;
    cursor: pointer;
    transition: background 0.1s ease;
    border-radius: 0;
  }

  .structure-item:hover {
    background: var(--color-bg-hover);
  }

  .kind-badge {
    font-size: 10px;
    font-weight: 700;
    font-family: var(--font-editor);
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  }

  .item-label {
    flex: 1;
    font-size: 13px;
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-line {
    font-size: 10px;
    color: var(--color-text-muted);
    font-family: var(--font-editor);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 8px 12px 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
    border-top: 1px solid var(--color-border-subtle);
    margin-top: 4px;
  }

  .section-count {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-text-muted);
  }

  .bookmark-item {
    padding-right: 4px;
  }

  .bookmark-label {
    color: var(--color-text-muted);
    font-size: 11px;
  }

  .bm-remove {
    background: transparent;
    border: none;
    padding: 2px;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 3px;
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.1s, background 0.1s;
    flex-shrink: 0;
  }

  .bookmark-item:hover .bm-remove {
    opacity: 1;
  }

  .bm-remove:hover {
    background: var(--color-bg-active);
    color: var(--color-error);
  }
</style>
