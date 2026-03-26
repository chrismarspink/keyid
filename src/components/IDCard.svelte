<script lang="ts">
  import TrustBadge from './TrustBadge.svelte';
  import type { TrustLevel } from '$lib/storage/contacts';
  import { generateIdenticon } from '$lib/crypto/identicon';

  export let commonName = '';
  export let email = '';
  export let organization = '';
  export let country = '';
  export let fingerprint = '';
  export let notAfter = '';
  export let avatar: string | null = null;
  export let trustLevel: TrustLevel = 'self';
  export let compact = false;

  $: resolvedAvatar = avatar || generateIdenticon(commonName + email);

  $: initials = commonName
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  $: expDate = notAfter
    ? new Date(notAfter).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    : '';

  $: isExpired = notAfter ? new Date(notAfter) < new Date() : false;

  $: fpShort = fingerprint
    ? fingerprint.split(':').slice(0, 8).join(':') + '…'
    : '';
</script>

<!-- Passport-style card: navy left band + content -->
<div
  class="id-card relative"
  class:opacity-75={isExpired}
  style="width:{compact ? '280px' : '340px'}; height:{compact ? '176px' : '214px'}"
>
  <!-- Navy band -->
  <div class="id-card-band" style="width:{compact ? '44px' : '56px'}">
    <!-- Logo letter -->
    <div
      class="absolute top-3 left-0 right-0 text-center font-bold text-yellow-400"
      style="font-size:{compact ? '16px' : '20px'}"
    >K</div>
    <!-- Country code -->
    <div
      class="absolute bottom-2 left-0 right-0 text-center text-white/50"
      style="font-size:8px"
    >{country || 'XX'}</div>
    <!-- Vertical text -->
    <div
      class="absolute top-1/2 left-0 right-0 text-center text-white/30"
      style="font-size:7px; transform:translateY(-50%) rotate(-90deg); letter-spacing:2px; white-space:nowrap"
    >KEYID</div>
  </div>

  <!-- Avatar -->
  <div
    class="absolute rounded-full overflow-hidden bg-blue-100 border-2 border-white shadow-sm"
    style="
      left:{compact ? 52 : 66}px;
      top:{compact ? 14 : 18}px;
      width:{compact ? 52 : 64}px;
      height:{compact ? 52 : 64}px;
    "
  >
    <img src={resolvedAvatar} alt={commonName} class="w-full h-full object-cover" />
  </div>

  <!-- Content -->
  <div
    class="absolute"
    style="
      left:{compact ? 116 : 142}px;
      right:12px;
      top:{compact ? 10 : 14}px;
      bottom:{compact ? 10 : 12}px;
    "
  >
    <!-- Name -->
    <div
      class="font-bold text-slate-800 leading-tight truncate"
      style="font-size:{compact ? '14px' : '17px'}"
      title={commonName}
    >{commonName || '이름 없음'}</div>

    <!-- Organization -->
    {#if organization}
      <div
        class="text-gray-500 truncate mt-0.5"
        style="font-size:{compact ? '10px' : '12px'}"
        title={organization}
      >{organization}</div>
    {/if}

    <!-- Email -->
    {#if email}
      <div
        class="text-gray-400 truncate"
        style="font-size:{compact ? '10px' : '11px'}"
        title={email}
      >{email}</div>
    {/if}

    <!-- Divider -->
    <div class="border-t border-blue-100 my-1.5"></div>

    <!-- Fingerprint -->
    <div
      class="font-mono text-gray-400 truncate"
      style="font-size:{compact ? '8px' : '9px'}"
      title={fingerprint}
    >{fpShort || '—'}</div>

    <!-- Bottom row: trust badge + expiry -->
    <div class="flex items-center justify-between mt-1.5">
      <TrustBadge level={trustLevel} size="sm" />
      {#if expDate}
        <span
          class="text-gray-400"
          style="font-size:8px"
          class:text-red-500={isExpired}
        >
          {isExpired ? '만료됨' : expDate + ' 까지'}
        </span>
      {/if}
    </div>
  </div>

  <!-- Expired overlay -->
  {#if isExpired}
    <div class="absolute inset-0 flex items-center justify-center rounded-2xl bg-red-500/10">
      <span class="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full rotate-[-15deg] shadow">
        만료됨
      </span>
    </div>
  {/if}
</div>
