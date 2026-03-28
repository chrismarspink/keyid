<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import TrustBadge from './TrustBadge.svelte';
  import type { TrustLevel } from '$lib/storage/contacts';
  import { generateIdenticon } from '$lib/crypto/identicon';

  export let commonName = '';
  export let email = '';
  export let organization = '';
  export let country = '';
  export let fingerprint = '';
  export let notBefore = '';
  export let notAfter = '';
  export let serialNumber = '';
  export let avatar: string | null = null;
  export let trustLevel: TrustLevel = 'self';
  export let showActions = true;

  $: resolvedAvatar = avatar || generateIdenticon(commonName + email);

  const dispatch = createEventDispatcher<{
    share: void;
    download: void;
    qr: void;
  }>();

  $: notBeforeDate = notBefore ? new Date(notBefore).toLocaleDateString('ko-KR') : '';
  $: notAfterDate  = notAfter  ? new Date(notAfter).toLocaleDateString('ko-KR')  : '';
  $: isExpired = notAfter ? new Date(notAfter) < new Date() : false;

  // Responsive: detect card width
  let cardWidth = 0;
  $: narrow = cardWidth > 0 && cardWidth < 460;
</script>

<!-- bind:clientWidth tracks actual rendered width -->
<div class="id-card-wide" style="width:100%;max-width:680px" bind:clientWidth={cardWidth}>

  <!-- Navy band -->
  <div class="id-card-band" style="width:{narrow ? 48 : 64}px">
    <div class="absolute top-3 left-0 right-0 text-center font-bold text-yellow-400"
      style="font-size:{narrow ? '18px' : '24px'}">K</div>
    <div class="absolute inset-x-0 text-center text-white/40"
      style="font-size:7px;top:{narrow ? 34 : 40}px;letter-spacing:1px">KeyID</div>
    <div class="absolute bottom-2 left-0 right-0 text-center text-white/50"
      style="font-size:{narrow ? '8px' : '12px'}">{country || 'XX'}</div>
  </div>

  {#if narrow}
    <!-- ── NARROW / MOBILE LAYOUT ── -->

    <!-- Avatar (smaller) -->
    <div class="absolute rounded-full overflow-hidden bg-blue-100 border-2 border-white shadow"
      style="left:58px;top:18px;width:60px;height:60px">
      <img src={resolvedAvatar} alt={commonName} class="w-full h-full object-cover" />
    </div>

    <!-- Name / org / email -->
    <div class="absolute" style="left:126px;right:8px;top:14px">
      <div class="font-bold text-white leading-tight truncate" style="font-size:15px" title={commonName}>
        {commonName || '이름 없음'}
      </div>
      {#if organization}
        <div class="text-gray-400 truncate" style="font-size:11px;margin-top:1px">{organization}</div>
      {/if}
      {#if email}
        <div class="text-gray-500 truncate" style="font-size:10px">{email}</div>
      {/if}
      <!-- Dates inline -->
      <div class="text-gray-400 mt-1" style="font-size:9px;line-height:1.5">
        {#if notBeforeDate}<span class="text-gray-300">발급:</span> {notBeforeDate}&nbsp;&nbsp;{/if}
        {#if notAfterDate}<span class:text-red-400={isExpired}><span class="text-gray-300">만료:</span> {notAfterDate}</span>{/if}
      </div>
    </div>

    <!-- Fingerprint + trust (bottom strip) -->
    <div class="absolute" style="left:58px;right:8px;bottom:10px">
      <div class="border-t mt-1 mb-1" style="border-color:rgba(255,255,255,0.1)"></div>
      <div class="font-mono text-gray-500 overflow-hidden" style="font-size:8px;line-height:1.4;white-space:nowrap;text-overflow:ellipsis">
        {fingerprint || '—'}
      </div>
      <div class="flex items-center gap-2 mt-1">
        <TrustBadge level={trustLevel} size="sm" />
        {#if isExpired}<span class="text-red-500 font-semibold" style="font-size:10px">만료됨</span>{/if}
      </div>
    </div>

  {:else}
    <!-- ── WIDE / DESKTOP LAYOUT ── -->

    <!-- Avatar -->
    <div class="absolute rounded-full overflow-hidden bg-blue-100 border-2 border-white shadow"
      style="left:78px;top:24px;width:80px;height:80px">
      <img src={resolvedAvatar} alt={commonName} class="w-full h-full object-cover" />
    </div>

    <!-- Main info -->
    <div class="absolute" style="left:174px;right:196px;top:18px;bottom:16px">
      <div class="text-2xl font-bold text-white leading-tight truncate" title={commonName}>
        {commonName || '이름 없음'}
      </div>
      {#if organization}
        <div class="text-gray-400 text-sm mt-0.5 truncate">{organization}</div>
      {/if}
      {#if email}
        <div class="text-gray-500 text-xs truncate">{email}</div>
      {/if}
      <div class="border-t my-2" style="border-color:rgba(255,255,255,0.1)"></div>
      <div class="font-mono text-gray-400" style="font-size:9px;line-height:1.6;word-break:break-all">
        {fingerprint || '—'}
      </div>
      <div class="flex items-center gap-2 mt-2">
        <TrustBadge level={trustLevel} size="sm" />
        {#if isExpired}<span class="text-xs text-red-500 font-semibold">만료됨</span>{/if}
      </div>
    </div>

    <!-- Right metadata column -->
    <div class="absolute text-right" style="top:18px;right:14px;width:180px">
      <div class="text-xs text-gray-400 space-y-1">
        {#if notBeforeDate}
          <div><span class="text-gray-300">발급:</span> {notBeforeDate}</div>
        {/if}
        {#if notAfterDate}
          <div class:text-red-400={isExpired}>
            <span class="text-gray-300">만료:</span> {notAfterDate}
          </div>
        {/if}
        {#if serialNumber}
          <div class="font-mono" style="font-size:8px;word-break:break-all">
            S/N: {serialNumber.slice(0, 16)}…
          </div>
        {/if}
      </div>

      {#if showActions}
        <div class="flex flex-col gap-1.5 mt-3">
          <button on:click={() => dispatch('qr')}
            class="flex items-center justify-end gap-1 text-xs text-blue-400 hover:text-blue-300 transition">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
            </svg>
            QR 공유
          </button>
          <button on:click={() => dispatch('share')}
            class="flex items-center justify-end gap-1 text-xs text-blue-400 hover:text-blue-300 transition">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
            </svg>
            공유하기
          </button>
          <button on:click={() => dispatch('download')}
            class="flex items-center justify-end gap-1 text-xs text-blue-400 hover:text-blue-300 transition">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            .pkis-cert
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Expired overlay -->
  {#if isExpired}
    <div class="absolute inset-0 flex items-center justify-center rounded-2xl bg-red-500/10 pointer-events-none">
      <span class="px-4 py-1 bg-red-500 text-white font-bold rounded-full shadow rotate-[-10deg]">
        만료됨
      </span>
    </div>
  {/if}
</div>
