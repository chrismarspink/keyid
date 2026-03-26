<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { verifySignature } from '$lib/crypto/cms';
  import { retrieveLaunchedFile } from '$lib/fileHandler';
  import { isExpiredIdentityFingerprint } from '$lib/storage/keystore';

  let sigFile: File | null = null;
  let originalFile: File | null = null;
  let sigDropActive = false;
  let origDropActive = false;
  let sigInput: HTMLInputElement;
  let origInput: HTMLInputElement;

  type VerifyState = 'idle' | 'verifying' | 'valid' | 'invalid' | 'error';
  let state: VerifyState = 'idle';
  let verifyResult: { signerName: string; signingTime?: string; digest: string } | null = null;
  let errorMsg = '';
  let isArchivedSigner = false;

  let toast = { visible: false, msg: '', type: 'info' as 'success' | 'error' | 'info' };
  function showToast(msg: string, type: typeof toast.type = 'info') {
    toast = { visible: true, msg, type };
    setTimeout(() => (toast = { ...toast, visible: false }), 3200);
  }

  onMount(() => {
    // Check if launched from file list (sig pre-loaded)
    const name = sessionStorage.getItem('verify_sig_name');
    const b64 = sessionStorage.getItem('verify_sig_data');
    if (name && b64) {
      sessionStorage.removeItem('verify_sig_name');
      sessionStorage.removeItem('verify_sig_data');
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      sigFile = new File([bytes], name, { type: 'application/pkis-sig' });
    }
    // Check for launched file via PWA file_handlers
    const launched = retrieveLaunchedFile();
    if (launched) {
      sigFile = new File([launched.data], launched.name, { type: launched.type });
    }
  });

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }

  async function verify() {
    if (!sigFile || !originalFile) return;
    state = 'verifying';
    errorMsg = '';
    verifyResult = null;
    try {
      const sigDer = await sigFile.arrayBuffer();
      const fileData = await originalFile.arrayBuffer();
      const result = await verifySignature(sigDer, fileData);
      verifyResult = {
        signerName: result.signerCommonName,
        signingTime: result.signingTime,
        digest: result.contentDigest
      };
      state = result.valid ? 'valid' : 'invalid';
      if (!result.valid && result.error) errorMsg = result.error;
      // Check if signer cert matches an archived (expired/revoked) identity
      if (result.signerFingerprint) {
        isArchivedSigner = await isExpiredIdentityFingerprint(result.signerFingerprint);
      }
    } catch (e) {
      state = 'error';
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  function reset() {
    state = 'idle';
    sigFile = null;
    originalFile = null;
    verifyResult = null;
    errorMsg = '';
    isArchivedSigner = false;
  }
</script>

<svelte:head>
  <title>서명 검증 — KeyID</title>
</svelte:head>

<div class="max-w-xl mx-auto px-4 pt-6 pb-10">
  <!-- Header -->
  <div class="flex items-center gap-3 mb-6">
    <button on:click={() => goto('/files')} class="btn-icon">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <div>
      <h1 class="text-xl font-bold text-slate-800">서명 검증</h1>
      <p class="text-sm text-gray-400">디지털 서명 유효성 확인</p>
    </div>
  </div>

  {#if state === 'valid' && verifyResult}
    <!-- ── Valid ── -->
    <div class="panel text-center space-y-4">
      <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <div>
        <div class="font-bold text-lg text-green-700">서명 유효</div>
        <p class="text-sm text-gray-500 mt-1">이 파일의 서명이 유효합니다.</p>
      </div>
      {#if isArchivedSigner}
        <div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-left"
          style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.3); color:#fbbf24">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <span>이 서명은 <strong>만료/폐지된 신원</strong>으로 서명된 파일입니다. 서명 자체는 유효하지만 신원이 갱신되었습니다.</span>
        </div>
      {/if}
      <dl class="text-left space-y-2 text-sm bg-gray-50 rounded-xl p-4">
        <div class="flex gap-3">
          <dt class="w-20 text-gray-400 flex-shrink-0">서명자</dt>
          <dd class="font-semibold text-slate-700">{verifyResult.signerName}</dd>
        </div>
        {#if verifyResult.signingTime}
          <div class="flex gap-3">
            <dt class="w-20 text-gray-400 flex-shrink-0">서명 시각</dt>
            <dd class="text-slate-700">{new Date(verifyResult.signingTime).toLocaleString('ko-KR')}</dd>
          </div>
        {/if}
        <div class="flex gap-3">
          <dt class="w-20 text-gray-400 flex-shrink-0">SHA-256</dt>
          <dd class="font-mono text-xs text-gray-500 break-all">{verifyResult.digest}</dd>
        </div>
      </dl>
      <button on:click={reset} class="btn-secondary w-full">다른 파일 검증</button>
    </div>

  {:else if state === 'invalid' || state === 'error'}
    <!-- ── Invalid / Error ── -->
    <div class="panel text-center space-y-4">
      <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
        <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </div>
      <div>
        <div class="font-bold text-lg text-red-700">
          {state === 'invalid' ? '서명 무효' : '검증 오류'}
        </div>
        <p class="text-sm text-gray-500 mt-1">
          {state === 'invalid'
            ? '서명이 유효하지 않습니다. 파일이 변조되었거나 잘못된 원본 파일일 수 있습니다.'
            : errorMsg}
        </p>
        {#if state === 'invalid' && verifyResult}
          <p class="text-sm text-gray-500 mt-1">서명자: {verifyResult.signerName}</p>
        {/if}
      </div>
      <button on:click={reset} class="btn-secondary w-full">다시 시도</button>
    </div>

  {:else}
    <!-- ── Input ── -->

    <!-- Signature file -->
    <div class="panel mb-4">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">서명 파일 (.pkis-sig)</h2>
      {#if !sigFile}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="border-2 border-dashed rounded-xl py-8 px-6 text-center cursor-pointer transition
            {sigDropActive ? 'border-navy-600 bg-navy-50' : 'border-gray-200 hover:border-gray-300'}"
          on:dragover|preventDefault={() => (sigDropActive = true)}
          on:dragleave={() => (sigDropActive = false)}
          on:drop={(e) => { e.preventDefault(); sigDropActive = false; const f = e.dataTransfer?.files[0]; if (f) sigFile = f; }}
          on:click={() => sigInput.click()}
        >
          <svg class="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="text-sm text-gray-500">서명 파일을 끌어다 놓거나 클릭</div>
          <div class="text-xs text-gray-400 mt-1">.pkis-sig</div>
        </div>
        <input bind:this={sigInput} type="file" accept=".pkis-sig" class="hidden"
          on:change={(e) => { const f = e.currentTarget.files?.[0]; if (f) sigFile = f; }} />
      {:else}
        <div class="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
          <svg class="w-6 h-6 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-slate-800 truncate">{sigFile.name}</div>
            <div class="text-xs text-gray-400">{formatBytes(sigFile.size)}</div>
          </div>
          <button on:click={() => (sigFile = null)} class="btn-icon text-gray-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      {/if}
    </div>

    <!-- Original file -->
    <div class="panel mb-4">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">원본 파일</h2>
      {#if !originalFile}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="border-2 border-dashed rounded-xl py-8 px-6 text-center cursor-pointer transition
            {origDropActive ? 'border-navy-600 bg-navy-50' : 'border-gray-200 hover:border-gray-300'}"
          on:dragover|preventDefault={() => (origDropActive = true)}
          on:dragleave={() => (origDropActive = false)}
          on:drop={(e) => { e.preventDefault(); origDropActive = false; const f = e.dataTransfer?.files[0]; if (f) originalFile = f; }}
          on:click={() => origInput.click()}
        >
          <svg class="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div class="text-sm text-gray-500">원본 파일을 끌어다 놓거나 클릭</div>
          <div class="text-xs text-gray-400 mt-1">서명 시 사용한 원본 파일</div>
        </div>
        <input bind:this={origInput} type="file" class="hidden"
          on:change={(e) => { const f = e.currentTarget.files?.[0]; if (f) originalFile = f; }} />
      {:else}
        <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <svg class="w-6 h-6 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-slate-800 truncate">{originalFile.name}</div>
            <div class="text-xs text-gray-400">{formatBytes(originalFile.size)}</div>
          </div>
          <button on:click={() => (originalFile = null)} class="btn-icon text-gray-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      {/if}
    </div>

    <button
      class="btn-primary w-full"
      disabled={!sigFile || !originalFile || state === 'verifying'}
      on:click={verify}
    >
      {#if state === 'verifying'}
        <div class="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
        검증 중…
      {:else}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        서명 검증
      {/if}
    </button>
  {/if}
</div>

{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}
