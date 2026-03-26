<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { SealedKey } from '$lib/crypto/protection';
  import { unsealKey } from '$lib/crypto/protection';

  export let sealedKey: SealedKey;
  export let passwordBackup: SealedKey | null | undefined = undefined;
  export let loading = false;

  const dispatch = createEventDispatcher<{ unlock: ArrayBuffer; error: string }>();

  let method: 'biometric' | 'password' =
    sealedKey.method === 'webauthn' ? 'biometric' : 'password';
  let password = '';

  // If primary is password and no WebAuthn, only password available
  $: hasBiometric = sealedKey.method === 'webauthn';
  $: hasPasswordOption = sealedKey.method === 'password' || !!passwordBackup;
  $: showMethodToggle = hasBiometric && hasPasswordOption;

  export async function unlock(): Promise<ArrayBuffer | null> {
    loading = true;
    try {
      const pkcs8 = await unsealKey({
        sealed: sealedKey,
        passwordBackup: passwordBackup ?? undefined,
        password: method === 'password' ? password : undefined,
        preferPassword: method === 'password'
      });
      dispatch('unlock', pkcs8);
      return pkcs8;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dispatch('error', msg);
      return null;
    } finally {
      loading = false;
    }
  }
</script>

<div class="space-y-3">
  {#if showMethodToggle}
    <div class="flex gap-2 p-1 bg-gray-100 rounded-xl">
      <button
        class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition"
        class:bg-white={method === 'biometric'}
        class:shadow-sm={method === 'biometric'}
        class:text-navy-600={method === 'biometric'}
        class:text-gray-500={method !== 'biometric'}
        on:click={() => (method = 'biometric')}
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/>
        </svg>
        지문 인증
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition"
        class:bg-white={method === 'password'}
        class:shadow-sm={method === 'password'}
        class:text-navy-600={method === 'password'}
        class:text-gray-500={method !== 'password'}
        on:click={() => (method = 'password')}
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
        </svg>
        비밀번호
      </button>
    </div>
  {/if}

  {#if method === 'password' || sealedKey.method === 'password'}
    <div>
      <label class="label" for="unlock-pw">비밀번호</label>
      <input
        id="unlock-pw"
        class="input"
        type="password"
        placeholder="개인 키 비밀번호"
        bind:value={password}
        on:keydown={(e) => e.key === 'Enter' && unlock()}
      />
    </div>
  {:else}
    <div class="flex items-center gap-3 p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
      <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/>
      </svg>
      버튼을 누르면 지문 인증을 요청합니다
    </div>
  {/if}
</div>
