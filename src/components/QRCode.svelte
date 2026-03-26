<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import QRCodeLib from 'qrcode';

  export let data = '';
  export let size = 256;

  let canvas: HTMLCanvasElement;
  let error = '';

  async function render() {
    if (!canvas || !data) return;
    error = '';
    try {
      await QRCodeLib.toCanvas(canvas, data, {
        width: size,
        margin: 2,
        color: { dark: '#0a0a1a', light: '#ffffff' },
        errorCorrectionLevel: 'M'
      });
    } catch (e) {
      error = 'QR 생성 실패';
      console.error(e);
    }
  }

  onMount(render);
  afterUpdate(render);
</script>

{#if error}
  <div class="flex items-center justify-center bg-gray-100 rounded-xl text-sm text-red-500"
    style="width:{size}px;height:{size}px">{error}</div>
{:else}
  <canvas bind:this={canvas} width={size} height={size} class="rounded-xl"></canvas>
{/if}
