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

  $: initials = commonName
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  $: notBeforeDate = notBefore
    ? new Date(notBefore).toLocaleDateString('ko-KR')
    : '';
  $: notAfterDate = notAfter
    ? new Date(notAfter).toLocaleDateString('ko-KR')
    : '';
  $: isExpired = notAfter ? new Date(notAfter) < new Date() : false;
</script>

<div class="id-card-wide" style="width:100%;max-width:680px">
  <!-- Navy band -->
  <div class="id-card-band" style="width:64px">
    <div class="absolute top-4 left-0 right-0 text-center font-bold text-yellow-400 text-2xl">K</div>
    <div class="absolute inset-x-0 text-center text-white/40" style="font-size:8px;top:40px;letter-spacing:1px">KeyID</div>
    <div class="absolute bottom-2 left-0 right-0 text-center text-white/50 text-xs">
      {country || 'XX'}
    </div>
  </div>

  <!-- Avatar -->
  <div
    class="absolute rounded-full overflow-hidden bg-blue-100 border-2 border-white shadow"
    style="left:78px;top:24px;width:80px;height:80px"
  >
    <img src={resolvedAvatar} alt={commonName} class="w-full h-full object-cover" />
  </div>

  <!-- Main info -->
  <div class="absolute" style="left:174px;right:200px;top:18px;bottom:16px">
    <div class="text-2xl font-bold text-slate-800 leading-tight truncate" title={commonName}>
      {commonName || '이름 없음'}
    </div>
    {#if organization}
      <div class="text-gray-500 text-sm mt-0.5 truncate">{organization}</div>
    {/if}
    {#if email}
      <div class="text-gray-400 text-xs truncate">{email}</div>
    {/if}

    <div class="border-t border-blue-100 my-2"></div>

    <div class="font-mono text-gray-400" style="font-size:9px;line-height:1.6;word-break:break-all">
      {fingerprint || '—'}
    </div>

    <div class="flex items-center gap-2 mt-2">
      <TrustBadge level={trustLevel} size="sm" />
      {#if isExpired}
        <span class="text-xs text-red-500 font-semibold">만료됨</span>
      {/if}
    </div>
  </div>

  <!-- Right metadata column -->
  <div class="absolute right-14 top-18 text-right" style="top:18px;right:14px;width:176px">
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
        <button
          on:click={() => dispatch('qr')}
          class="flex items-center justify-end gap-1 text-xs text-navy-600 hover:text-blue-700 transition"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
          QR 공유
        </button>
        <button
          on:click={() => dispatch('share')}
          class="flex items-center justify-end gap-1 text-xs text-navy-600 hover:text-blue-700 transition"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          공유하기
        </button>
        <button
          on:click={() => dispatch('download')}
          class="flex items-center justify-end gap-1 text-xs text-navy-600 hover:text-blue-700 transition"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          .pkis-cert
        </button>
      </div>
    {/if}
  </div>

  <!-- Expired overlay -->
  {#if isExpired}
    <div class="absolute inset-0 flex items-center justify-center rounded-2xl bg-red-500/10 pointer-events-none">
      <span class="px-4 py-1 bg-red-500 text-white font-bold rounded-full shadow rotate-[-10deg]">
        만료됨
      </span>
    </div>
  {/if}
</div>
