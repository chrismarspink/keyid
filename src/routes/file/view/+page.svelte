<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { pendingViewerFiles, type ViewerFile } from '$lib/viewerStore';
  import { loadIdentity } from '$lib/storage/keystore';
  // Vite resolves this to the correct bundled URL (including base path)
  import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';

  let files: ViewerFile[] = [];
  let selected: ViewerFile | null = null;
  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let currentPage = 1;
  let totalPages = 0;
  let loading = false;
  let error = '';
  let pdfDoc: unknown = null;
  let watermarkName = '';
  let scale = 1.5;

  // Subscribe to store
  const unsub = pendingViewerFiles.subscribe(v => { files = v; });

  onMount(async () => {
    const identity = await loadIdentity();
    watermarkName = identity?.commonName ?? '';

    if (files.length === 0) {
      goto(base + '/');
      return;
    }
    if (files.length === 1) {
      await openFile(files[0]);
    }

    // Disable right-click on the whole page
    document.addEventListener('contextmenu', blockCtx);
  });

  onDestroy(() => {
    document.removeEventListener('contextmenu', blockCtx);
    // Clear memory
    pendingViewerFiles.set([]);
    unsub();
  });

  function blockCtx(e: MouseEvent) { e.preventDefault(); }

  async function openFile(file: ViewerFile) {
    selected = file;
    currentPage = 1;
    totalPages = 0;
    pdfDoc = null;
    error = '';
    loading = true;

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

      const loadingTask = pdfjsLib.getDocument({ data: file.data.slice() });
      pdfDoc = await loadingTask.promise;
      totalPages = (pdfDoc as { numPages: number }).numPages;
      await renderPage(currentPage);
    } catch (e) {
      error = 'PDF를 열 수 없습니다: ' + String(e);
    } finally {
      loading = false;
    }
  }

  async function renderPage(pageNum: number) {
    if (!pdfDoc || !canvas) return;
    loading = true;
    try {
      const page = await (pdfDoc as { getPage(n: number): Promise<unknown> }).getPage(pageNum);
      const viewport = (page as { getViewport(o: { scale: number }): { width: number; height: number } })
        .getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      await (page as {
        render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> }
      }).render({ canvasContext: ctx, viewport }).promise;

      // Draw watermark
      drawWatermark(ctx, canvas.width, canvas.height);
    } finally {
      loading = false;
    }
  }

  function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#1d6ef5';
    ctx.font = `bold ${Math.round(w / 12)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = watermarkName ? `KeyID · ${watermarkName}` : 'KeyID';
    const step = Math.round(h / 3);

    for (let y = step / 2; y < h; y += step) {
      ctx.save();
      ctx.translate(w / 2, y);
      ctx.rotate(-Math.PI / 8);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  async function prevPage() {
    if (currentPage > 1) { currentPage--; await renderPage(currentPage); }
  }

  async function nextPage() {
    if (currentPage < totalPages) { currentPage++; await renderPage(currentPage); }
  }

  function zoomIn() { scale = Math.min(scale + 0.25, 3); renderPage(currentPage); }
  function zoomOut() { scale = Math.max(scale - 0.25, 0.5); renderPage(currentPage); }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') nextPage();
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') prevPage();
  }
</script>

<svelte:head>
  <title>문서 뷰어 — KeyID</title>
  <!-- Prevent print -->
  <style>@media print { body { display: none !important; } }</style>
</svelte:head>

<svelte:window on:keydown={handleKeydown} />

<div class="viewer-shell" style="background:#0f1520; min-height:100dvh; display:flex; flex-direction:column">

  <!-- Toolbar -->
  <div class="flex items-center gap-3 px-4 py-3 flex-shrink-0"
    style="background:#1e2433; border-bottom:1px solid rgba(255,255,255,0.08)">
    <button on:click={() => goto(base + '/')} class="btn-icon">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>

    <span class="font-semibold text-sm flex-1 truncate" style="color:var(--text)">
      {selected?.name ?? '문서 선택'}
    </span>

    {#if pdfDoc}
      <span class="text-xs" style="color:var(--text-muted)">{currentPage} / {totalPages}</span>
      <button on:click={zoomOut} class="btn-icon" title="축소">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
        </svg>
      </button>
      <span class="text-xs" style="color:var(--text-muted)">{Math.round(scale * 100)}%</span>
      <button on:click={zoomIn} class="btn-icon" title="확대">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
      </button>
    {/if}
  </div>

  <!-- File selector (multiple files) -->
  {#if files.length > 1 && !selected}
    <div class="flex-1 px-4 pt-8 max-w-lg mx-auto w-full">
      <h2 class="font-bold text-lg mb-4" style="color:var(--text)">열 파일 선택</h2>
      <div class="space-y-2">
        {#each files as f}
          <button
            class="w-full flex items-center gap-3 p-4 rounded-xl text-left transition"
            style="background:var(--bg-panel); border:1px solid var(--border)"
            on:click={() => openFile(f)}
          >
            <svg class="w-8 h-8 flex-shrink-0" style="color:#f87171" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
            <div>
              <div class="font-medium text-sm" style="color:var(--text)">{f.name}</div>
              <div class="text-xs mt-0.5" style="color:var(--text-muted)">{(f.data.byteLength / 1024).toFixed(1)} KB</div>
            </div>
          </button>
        {/each}
      </div>
    </div>

  {:else}
    <!-- PDF canvas area -->
    <div
      bind:this={container}
      class="flex-1 overflow-auto flex flex-col items-center py-4 px-2"
      style="user-select:none; -webkit-user-select:none"
    >
      {#if loading}
        <div class="flex items-center justify-center h-64">
          <div class="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style="border-color:#1d6ef5; border-top-color:transparent"></div>
        </div>
      {:else if error}
        <div class="p-4 rounded-xl text-sm max-w-sm mx-auto text-center" style="background:rgba(239,68,68,0.1); color:#f87171">
          {error}
        </div>
      {:else}
        <!-- Security notice -->
        <div class="text-xs mb-3 flex items-center gap-1.5" style="color:var(--text-dim)">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          메모리 전용 · 워터마크 적용 · 저장 불가
        </div>

        <canvas
          bind:this={canvas}
          style="max-width:100%; box-shadow:0 4px 32px rgba(0,0,0,0.5); border-radius:4px"
        ></canvas>
      {/if}
    </div>

    <!-- Page navigation -->
    {#if pdfDoc && totalPages > 1}
      <div class="flex items-center justify-center gap-4 py-3 flex-shrink-0"
        style="background:#1e2433; border-top:1px solid rgba(255,255,255,0.08)">
        <button
          class="btn-icon"
          on:click={prevPage}
          disabled={currentPage <= 1}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <span class="text-sm font-medium" style="color:var(--text)">{currentPage} / {totalPages}</span>
        <button
          class="btn-icon"
          on:click={nextPage}
          disabled={currentPage >= totalPages}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    {/if}
  {/if}
</div>
