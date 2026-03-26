<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { loadIdentity, type IdentityRecord } from '$lib/storage/keystore';
  import { unsealKey } from '$lib/crypto/protection';
  import { importPrivateKeyPkcs8 } from '$lib/crypto/keygen';
  import { addCountersignature } from '$lib/crypto/countersign';
  import { downloadFile, retrieveLaunchedFile } from '$lib/fileHandler';

  let identity: IdentityRecord | null = null;
  let requestFile: File | null = null;
  let password = '';
  let signing = false;
  let done = false;
  let error = '';

  let toast = { visible: false, msg: '', type: 'info' as 'success' | 'error' | 'info' };
  function showToast(msg: string, type: typeof toast.type = 'info') {
    toast = { visible: true, msg, type };
    setTimeout(() => (toast = { ...toast, visible: false }), 3200);
  }

  // Request metadata parsed from file
  let reqMeta: { requesterName?: string; purpose?: string; callbackUrl?: string } = {};

  onMount(async () => {
    identity = await loadIdentity();
    if (!identity) { goto(base + '/'); return; }
    const launched = retrieveLaunchedFile();
    if (launched) requestFile = new File([launched.data], launched.name, { type: launched.type });
  });

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }

  async function sign() {
    if (!requestFile || !identity) return;
    error = '';
    signing = true;
    try {
      const pkcs8 = await unsealKey({
        sealed: identity.sealedKey,
        password: identity.sealedKey.method === 'password' ? password : undefined
      });
      const privateKey = await importPrivateKeyPkcs8(pkcs8);
      const certDer = (() => {
        const bin = atob(identity.certDer);
        return Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
      })();

      const reqData = await requestFile.arrayBuffer();
      const csResult = await addCountersignature(reqData, privateKey, certDer);

      const baseName = requestFile.name.replace(/\.pkis-req$/, '');
      downloadFile(csResult.der, `${baseName}.pkis-sig`, 'application/pkis-sig');

      // If callback_url in meta, POST the result
      if (reqMeta.callbackUrl) {
        try {
          await fetch(reqMeta.callbackUrl, {
            method: 'POST',
            body: csResult.der,
            headers: { 'Content-Type': 'application/pkis-sig' }
          });
          showToast('서명이 완료되고 전송되었습니다.', 'success');
        } catch {
          showToast('서명은 완료됐지만 전송에 실패했습니다. 파일을 직접 전달하세요.', 'error');
        }
      } else {
        showToast('서명이 완료되었습니다.', 'success');
      }
      done = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      signing = false;
    }
  }

  function reset() {
    requestFile = null;
    password = '';
    done = false;
    error = '';
    reqMeta = {};
  }
</script>

<svelte:head>
  <title>서명 요청 — KeyID</title>
</svelte:head>

<div class="max-w-xl mx-auto px-4 pt-6 pb-10">
  <!-- Header -->
  <div class="flex items-center gap-3 mb-6">
    <button on:click={() => goto(base + '/')} class="btn-icon">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <div>
      <h1 class="text-xl font-bold text-slate-800">서명 요청</h1>
      <p class="text-sm text-gray-400">외부에서 온 서명 요청 처리</p>
    </div>
  </div>

  {#if done}
    <div class="panel text-center space-y-4">
      <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <div class="font-bold text-lg text-slate-800">서명 완료</div>
      <p class="text-sm text-gray-500">서명 파일이 다운로드되었습니다.</p>
      <div class="flex gap-3">
        <button on:click={reset} class="btn-secondary flex-1">다른 요청 처리</button>
        <button on:click={() => goto(base + '/')} class="btn-primary flex-1">홈으로</button>
      </div>
    </div>

  {:else}
    <!-- Request file -->
    <div class="panel mb-4">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">서명 요청 파일 (.pkis-req)</h2>
      {#if !requestFile}
        <button
          class="w-full border-2 border-dashed rounded-xl py-8 px-6 text-center border-gray-200 hover:border-gray-300 transition"
          on:click={() => {
            const i = document.createElement('input');
            i.type = 'file';
            i.accept = '.pkis-req';
            i.onchange = () => { if (i.files?.[0]) requestFile = i.files[0]; };
            i.click();
          }}
        >
          <svg class="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div class="text-sm text-gray-500">.pkis-req 파일 선택</div>
          <div class="text-xs text-gray-400 mt-1">또는 QR 코드로 스캔하세요</div>
        </button>
      {:else}
        <div class="flex items-center gap-3 p-4 bg-orange-50 rounded-xl">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-slate-800 truncate">{requestFile.name}</div>
            <div class="text-xs text-gray-400">{formatBytes(requestFile.size)}</div>
          </div>
          <button on:click={() => (requestFile = null)} class="btn-icon text-gray-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Warning -->
        <div class="mt-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
          <div class="flex gap-2">
            <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <div class="text-sm font-semibold text-amber-800">서명 전 확인하세요</div>
              <div class="text-xs text-amber-700 mt-0.5">
                신뢰할 수 있는 출처에서 받은 파일인지 확인한 후 서명하세요.
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>

    {#if identity?.sealedKey.method === 'password'}
      <div class="panel mb-4">
        <label class="label" for="rpw">비밀번호</label>
        <input id="rpw" class="input" type="password" placeholder="개인 키 비밀번호" bind:value={password} />
      </div>
    {/if}

    {#if error}
      <div class="p-4 bg-red-50 rounded-xl text-sm text-red-600 mb-4">{error}</div>
    {/if}

    <button
      class="btn-primary w-full"
      disabled={!requestFile || signing}
      on:click={sign}
    >
      {#if signing}
        <div class="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
        {identity?.sealedKey.method === 'webauthn' ? '지문 인증 중…' : '서명 중…'}
      {:else}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        요청 승인 및 서명
      {/if}
    </button>
  {/if}
</div>

{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}
