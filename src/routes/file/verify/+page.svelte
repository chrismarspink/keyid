<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { verifySignature } from '$lib/crypto/cms';
  import { unpackPkisFile } from '$lib/crypto/cms';
  import { generateIdenticon } from '$lib/crypto/identicon';
  import { retrieveLaunchedFile } from '$lib/fileHandler';
  import { isExpiredIdentityFingerprint, loadIdentity, getAllExpiredIdentities } from '$lib/storage/keystore';
  import { getContactByFingerprint } from '$lib/storage/contacts';

  let sigFile: File | null = null;
  let originalFile: File | null = null;
  let sigDropActive = false;
  let origDropActive = false;
  let sigInput: HTMLInputElement;
  let origInput: HTMLInputElement;

  type VerifyState = 'idle' | 'verifying' | 'valid' | 'invalid' | 'error';
  let state: VerifyState = 'idle';

  interface VerifyDisplayResult {
    signerName: string;
    signerAvatar: string;
    signerOrg?: string;
    signerEmail?: string;
    signingTime?: string;
    digest: string;
    message?: string;
    isArchivedSigner: boolean;
  }
  let verifyResult: VerifyDisplayResult | null = null;
  let errorMsg = '';

  let toast = { visible: false, msg: '', type: 'info' as 'success' | 'error' | 'info' };
  function showToast(msg: string, type: typeof toast.type = 'info') {
    toast = { visible: true, msg, type };
    setTimeout(() => (toast = { ...toast, visible: false }), 3200);
  }

  onMount(() => {
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
    const launched = retrieveLaunchedFile();
    if (launched) {
      sigFile = new File([launched.data], launched.name, { type: launched.type });
    }
  });

  function formatBytes(n: number) {
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
      // Unpack PKIS container if present
      let sigDer = await sigFile.arrayBuffer();
      let containerMsg: string | undefined;
      try {
        const pkis = unpackPkisFile(sigDer);
        sigDer = pkis.payload;
        containerMsg = pkis.message;
      } catch { /* raw DER */ }

      const fileData = await originalFile.arrayBuffer();
      const result = await verifySignature(sigDer, fileData);

      // Resolve signer avatar & details
      let signerAvatar = generateIdenticon(result.signerCommonName);
      let signerOrg: string | undefined;
      let signerEmail: string | undefined;
      let isArchivedSigner = false;

      if (result.signerFingerprint) {
        // Check own identity
        const ownIdentity = await loadIdentity();
        if (ownIdentity?.fingerprint === result.signerFingerprint) {
          signerAvatar = ownIdentity.avatar || generateIdenticon(ownIdentity.commonName + ownIdentity.email);
          signerOrg = ownIdentity.organization;
          signerEmail = ownIdentity.email;
        } else {
          // Check contacts
          const contact = await getContactByFingerprint(result.signerFingerprint);
          if (contact) {
            signerAvatar = contact.avatar || generateIdenticon(contact.commonName + contact.email);
            signerOrg = contact.organization;
            signerEmail = contact.email;
          } else {
            // Check archived identities
            const archived = await getAllExpiredIdentities();
            const archMatch = archived.find(a => a.fingerprint === result.signerFingerprint);
            if (archMatch) {
              signerAvatar = archMatch.avatar || generateIdenticon(archMatch.commonName + (archMatch.email ?? ''));
              signerOrg = archMatch.organization;
              signerEmail = archMatch.email;
              isArchivedSigner = true;
            }
          }
          if (!isArchivedSigner) {
            isArchivedSigner = await isExpiredIdentityFingerprint(result.signerFingerprint);
          }
        }
      }

      verifyResult = {
        signerName: result.signerCommonName,
        signerAvatar,
        signerOrg,
        signerEmail,
        signingTime: result.signingTime,
        digest: result.contentDigest,
        message: result.message || containerMsg,
        isArchivedSigner
      };
      state = result.valid ? 'valid' : 'invalid';
      if (!result.valid && result.error) errorMsg = result.error;
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
  }
</script>

<svelte:head>
  <title>서명 검증 — KeyID</title>
</svelte:head>

<div class="px-4 md:px-6 pt-6 pb-24 w-full">
  <!-- Header -->
  <div class="flex items-center gap-3 mb-6">
    <button on:click={() => goto(base + '/files')} class="btn-icon">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <div>
      <h1 class="text-xl font-bold" style="color:var(--text)">서명 검증</h1>
      <p class="text-sm" style="color:var(--text-muted)">디지털 서명 유효성 확인</p>
    </div>
  </div>

  {#if state === 'valid' && verifyResult}
    <!-- ── Valid result ── -->
    <div class="max-w-2xl">
      <!-- Signer card -->
      <div class="panel mb-4">
        <div class="flex items-center gap-4 mb-4">
          <div class="relative flex-shrink-0">
            <img
              src={verifyResult.signerAvatar}
              alt={verifyResult.signerName}
              class="w-20 h-20 rounded-2xl object-cover shadow-lg"
            />
            <!-- Verified badge -->
            <div class="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shadow">
              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xl font-bold" style="color:var(--text)">{verifyResult.signerName}</span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background:rgba(34,197,94,0.2);color:#4ade80">
                서명 유효
              </span>
            </div>
            {#if verifyResult.signerOrg}
              <div class="text-sm mt-0.5" style="color:var(--text-muted)">{verifyResult.signerOrg}</div>
            {/if}
            {#if verifyResult.signerEmail}
              <div class="text-xs" style="color:var(--text-dim)">{verifyResult.signerEmail}</div>
            {/if}
            {#if verifyResult.signingTime}
              <div class="text-xs mt-1" style="color:var(--text-muted)">
                서명 시각: {new Date(verifyResult.signingTime).toLocaleString('ko-KR')}
              </div>
            {/if}
          </div>
        </div>

        {#if verifyResult.isArchivedSigner}
          <div class="flex items-start gap-2 p-3 rounded-xl text-sm mb-3"
            style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#fbbf24">
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <span><strong>만료/폐지된 신원</strong>으로 서명된 파일입니다. 서명 자체는 유효하나 신원이 갱신되었습니다.</span>
          </div>
        {/if}

        {#if verifyResult.message}
          <!-- Message from ContentHint -->
          <div class="p-4 rounded-xl" style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.2)">
            <div class="flex items-center gap-2 mb-1.5">
              <svg class="w-4 h-4" style="color:var(--navy-light)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
              <span class="text-xs font-semibold" style="color:var(--navy-light)">서명자 메시지</span>
            </div>
            <p class="text-sm italic" style="color:var(--text)">"{verifyResult.message}"</p>
          </div>
        {/if}
      </div>

      <!-- File details -->
      <div class="panel mb-4">
        <h3 class="text-sm font-semibold mb-3" style="color:var(--text)">파일 정보</h3>
        <div class="space-y-2 text-sm">
          <div class="flex gap-3">
            <span class="w-24 flex-shrink-0" style="color:var(--text-muted)">원본 파일</span>
            <span class="font-medium truncate" style="color:var(--text)">{originalFile?.name}</span>
          </div>
          <div class="flex gap-3">
            <span class="w-24 flex-shrink-0" style="color:var(--text-muted)">SHA-256</span>
            <span class="font-mono text-xs break-all" style="color:var(--text-dim)">{verifyResult.digest}</span>
          </div>
        </div>
      </div>

      <button on:click={reset} class="btn-secondary w-full">다른 파일 검증</button>
    </div>

  {:else if state === 'invalid' || state === 'error'}
    <!-- ── Invalid / Error ── -->
    <div class="panel max-w-lg text-center space-y-4">
      <div class="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
        <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </div>
      <div>
        <div class="font-bold text-lg text-red-400">
          {state === 'invalid' ? '서명 무효' : '검증 오류'}
        </div>
        <p class="text-sm mt-1" style="color:var(--text-muted)">
          {state === 'invalid'
            ? '서명이 유효하지 않습니다. 파일이 변조되었거나 잘못된 원본 파일입니다.'
            : errorMsg}
        </p>
        {#if state === 'invalid' && verifyResult}
          <p class="text-sm mt-1" style="color:var(--text-muted)">서명자: {verifyResult.signerName}</p>
        {/if}
      </div>
      <button on:click={reset} class="btn-secondary w-full">다시 시도</button>
    </div>

  {:else}
    <!-- ── Input ── -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">

      <!-- Signature file -->
      <div class="panel">
        <h2 class="text-sm font-semibold mb-3" style="color:var(--text)">서명 파일 (.pkis-sig)</h2>
        {#if !sigFile}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="border-2 border-dashed rounded-xl py-10 px-6 text-center cursor-pointer transition"
            style={sigDropActive ? 'border-color:var(--navy);background:rgba(29,110,245,0.08)' : 'border-color:var(--border-mid)'}
            on:dragover|preventDefault={() => (sigDropActive = true)}
            on:dragleave={() => (sigDropActive = false)}
            on:drop={(e) => { e.preventDefault(); sigDropActive = false; const f = e.dataTransfer?.files[0]; if (f) sigFile = f; }}
            on:click={() => sigInput.click()}
          >
            <svg class="w-10 h-10 mx-auto mb-2" style="color:var(--text-dim)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div class="text-sm" style="color:var(--text-muted)">서명 파일을 끌어다 놓거나 클릭</div>
            <div class="text-xs mt-1" style="color:var(--text-dim)">.pkis-sig</div>
          </div>
          <input bind:this={sigInput} type="file" accept=".pkis-sig,.pkis" class="hidden"
            on:change={(e) => { const f = e.currentTarget.files?.[0]; if (f) sigFile = f; }} />
        {:else}
          <div class="flex items-center gap-3 p-3 rounded-xl" style="background:rgba(59,130,246,0.1)">
            <svg class="w-6 h-6 flex-shrink-0" style="color:var(--navy-light)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate" style="color:var(--text)">{sigFile.name}</div>
              <div class="text-xs" style="color:var(--text-muted)">{formatBytes(sigFile.size)}</div>
            </div>
            <button on:click={() => (sigFile = null)} class="btn-icon" style="color:var(--text-dim)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>

      <!-- Original file -->
      <div class="panel">
        <h2 class="text-sm font-semibold mb-3" style="color:var(--text)">원본 파일</h2>
        {#if !originalFile}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="border-2 border-dashed rounded-xl py-10 px-6 text-center cursor-pointer transition"
            style={origDropActive ? 'border-color:var(--navy);background:rgba(29,110,245,0.08)' : 'border-color:var(--border-mid)'}
            on:dragover|preventDefault={() => (origDropActive = true)}
            on:dragleave={() => (origDropActive = false)}
            on:drop={(e) => { e.preventDefault(); origDropActive = false; const f = e.dataTransfer?.files[0]; if (f) originalFile = f; }}
            on:click={() => origInput.click()}
          >
            <svg class="w-10 h-10 mx-auto mb-2" style="color:var(--text-dim)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <div class="text-sm" style="color:var(--text-muted)">원본 파일을 끌어다 놓거나 클릭</div>
          </div>
          <input bind:this={origInput} type="file" class="hidden"
            on:change={(e) => { const f = e.currentTarget.files?.[0]; if (f) originalFile = f; }} />
        {:else}
          <div class="flex items-center gap-3 p-3 rounded-xl" style="background:var(--bg-hover)">
            <svg class="w-6 h-6 flex-shrink-0" style="color:var(--text-muted)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate" style="color:var(--text)">{originalFile.name}</div>
              <div class="text-xs" style="color:var(--text-muted)">{formatBytes(originalFile.size)}</div>
            </div>
            <button on:click={() => (originalFile = null)} class="btn-icon" style="color:var(--text-dim)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>

      <!-- Verify button spanning both columns -->
      <div class="lg:col-span-2">
        <button
          class="btn-primary w-full max-w-sm"
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
      </div>

    </div>
  {/if}
</div>

{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}
