<script lang="ts">
  import type { TrustLevel } from '$lib/storage/contacts';

  export let level: TrustLevel = 'known';
  export let size: 'sm' | 'md' = 'md';

  const labels: Record<TrustLevel, string> = {
    self: '본인 발급',
    known: '알려진',
    verified: '검증됨'
  };

  const classes: Record<TrustLevel, string> = {
    self: 'trust-self',
    known: 'trust-known',
    verified: 'trust-verified'
  };

  const icons: Record<TrustLevel, string> = {
    self: '🪪',
    known: '👤',
    verified: '✅'
  };
</script>

<span
  class="trust-badge {classes[level]}"
  class:text-xs={size === 'sm'}
  class:text-sm={size === 'md'}
  title={labels[level]}
>
  <span aria-hidden="true">{icons[level]}</span>
  {labels[level]}
</span>
