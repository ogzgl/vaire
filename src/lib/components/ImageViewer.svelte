<script lang="ts">
  import { convertFileSrc } from '@tauri-apps/api/core';

  let { path = '' }: { path?: string } = $props();

  let zoom = $state(1);
  let isSvg = $derived(path.toLowerCase().endsWith('.svg'));
  let imgSrc = $derived(convertFileSrc(path));

  function zoomIn() { zoom = Math.min(5, zoom + 0.25); }
  function zoomOut() { zoom = Math.max(0.1, zoom - 0.25); }
  function zoomReset() { zoom = 1; }

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="image-viewer" onwheel={handleWheel}>
  <div class="image-toolbar">
    <button class="img-btn" onclick={zoomOut} title="Zoom Out">-</button>
    <span class="zoom-label">{Math.round(zoom * 100)}%</span>
    <button class="img-btn" onclick={zoomIn} title="Zoom In">+</button>
    <button class="img-btn" onclick={zoomReset} title="Reset Zoom">1:1</button>
  </div>
  <div class="image-container">
    {#if isSvg}
      <img src={imgSrc} alt={path.split('/').pop()} style="transform: scale({zoom}); transform-origin: center;" class="preview-img checkerboard" />
    {:else}
      <img src={imgSrc} alt={path.split('/').pop()} style="transform: scale({zoom}); transform-origin: center;" class="preview-img checkerboard" />
    {/if}
  </div>
</div>

<style>
  .image-viewer {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg-base);
  }

  .image-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .img-btn {
    padding: 3px 10px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-base);
    color: var(--color-text-secondary);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.1s;
  }

  .img-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .zoom-label {
    font-size: 11px;
    color: var(--color-text-muted);
    min-width: 40px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .image-container {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .preview-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transition: transform 0.1s ease;
    image-rendering: auto;
  }

  .checkerboard {
    background-image: repeating-conic-gradient(#2a2a2a 0% 25%, #222 0% 50%);
    background-size: 16px 16px;
    border-radius: 4px;
  }
</style>
