<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import {
    loadIdentity, saveFileRecord, getAllExpiredIdentities,
    type IdentityRecord, type ExpiredIdentityRecord
  } from '$lib/storage/keystore';
  import { unsealKey } from '$lib/crypto/protection';
  import { importPrivateKeyPkcs8 } from '$lib/crypto/keygen';
  import { signData } from '$lib/crypto/cms';
  import { downloadFile, retrieveLaunchedFile } from '$lib/fileHandler';
  import { page } from '$app/stores';

  let identity: IdentityRecord | null = null;
  let archivedIdentities: ExpiredIdentityRecord[] = [];

  // Signer selection: 'current' = active identity, 'archived' = past identity
  let signerMode: 'current' | 'archived' = 'current';
  let selectedArchivedId: number | null = null;
  let archivedPassword = '';
  $: selectedArchived = archivedIdentities.find(a => a.id === selectedArchivedId) ?? null;

  let selectedFile: File | null = null;
  let password = '';
  let signing = false;
  let done = false;
  let signResult: { fileName: string; sigFile: string; signerName: string } | null = null;
  let error = '';
  let dropActive = false;
  let fileInput: HTMLInputElement;

  // Method toggle: biometric or password (current identity only)
  let unlockMethod: 'biometric' | 'password' = 'biometric';

  $: hasBiometric = identity?.sealedKey.method === 'webauthn';
  $: hasPasswordOption = identity?.sealedKey.method === 'password' || !!identity?.passwordBackup;
  $: showMethodToggle = hasBiometric && hasPasswordOption;

  let toast = { visible: false, msg: '', type: 'info' as 'success' | 'error' | 'info' };
  function showToast(msg: string, type: typeof toast.type = 'info') {
    toast = { visible: true, msg, type };
    setTimeout(() => (toast = { ...toast, visible: false }), 3200);
  }

  onMount(async () => {
    identity = await loadIdentity();
    if (!identity) { goto(base + '/'); return; }
    unlockMethod = identity.sealedKey.method === 'webauthn' ? 'biometric' : 'password';
    archivedIdentities = (await getAllExpiredIdentities()).filter(a => !!a.sealedKey);
    // Pre-select archived identity from query param (from identity page)
    const archivedParam = $page.url.searchParams.get('archived');
    if (archivedParam) {
      const id = parseInt(archivedParam);
      const found = archivedIdentities.find(a => a.id === id);
      if (found) {
        signerMode = 'archived';
        selectedArchivedId = id;
      }
    }
    const launched = retrieveLaunchedFile();
    if (launched) selectedFile = new File([launched.data], launched.name, { type: launched.type });
  });

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dropActive = false;
    const file = e.dataTransfer?.files[0];
    if (file) selectedFile = file;
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }

  async function sign() {
    if (!selectedFile) return;
    error = '';
    signing = true;
    try {
      let pkcs8: ArrayBuffer;
      let certDer: ArrayBuffer;
      let signerName: string;

      if (signerMode === 'archived' && selectedArchived?.sealedKey) {
        // Sign with archived identity (password only)
        pkcs8 = await unsealKey({
          sealed: selectedArchived.sealedKey,
          password: archivedPassword,
          preferPassword: true
        });
        const bin = atob(selectedArchived.certDer);
        certDer = Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
        signerName = selectedArchived.commonName;
      } else {
        if (!identity) return;
        pkcs8 = await unsealKey({
          sealed: identity.sealedKey,
          passwordBackup: identity.passwordBackup ?? undefined,
          password: unlockMethod === 'password' ? password : undefined,
          preferPassword: unlockMethod === 'password'
        });
        const bin = atob(identity.certDer);
        certDer = Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
        signerName = identity.commonName;
      }

      const privateKey = await importPrivateKeyPkcs8(pkcs8);
      const fileData = await selectedFile.arrayBuffer();
      const result = await signData(fileData, privateKey, certDer);

      const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
      const sigFileName = `${baseName}.pkis-sig`;
      downloadFile(result.der, sigFileName, 'application/pkis-sig');

      await saveFileRecord({
        name: sigFileName,
        originalName: selectedFile.name,
        type: 'signed',
        size: result.der.byteLength,
        createdAt: new Date().toISOString(),
        signerName,
        data: result.der
      });

      signResult = { fileName: selectedFile.name, sigFile: sigFileName, signerName };
      done = true;
      showToast('서명이 완료되었습니다.', 'success');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      signing = false;
    }
  }

  function reset() {
    selectedFile = null;
    password = '';
    archivedPassword = '';
    done = false;
    signResult = null;
    error = '';
  }
</script>

<svelte:head>
  <title>파일 서명 — KeyID</title>
</svelte:head>

<div class="max-w-xl mx-auto px-4 pt-6 pb-10">
  <div class="flex items-center gap-3 mb-6">
    <button on:click={() => goto(base + '/')} class="btn-icon">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <div>
      <h1 class="text-xl font-bold text-slate-800">파일 서명</h1>
      <p class="text-sm text-gray-400">디지털 서명 생성 (.pkis-sig)</p>
    </div>
  </div>

  {#if done && signResult}
    <div class="panel text-center space-y-4">
      <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <div>
        <div class="font-bold text-lg text-slate-800">서명 완료</div>
        <div class="text-sm text-gray-500 mt-1">{signResult.fileName}</div>
        <div class="text-xs text-gray-400 mt-1">→ {signResult.sigFile} 다운로드됨</div>
      </div>
      <p class="text-sm text-gray-500">서명 파일과 원본 파일을 함께 상대방에게 전달하세요.</p>
      <div class="flex gap-3">
        <button on:click={reset} class="btn-secondary flex-1">다른 파일 서명</button>
        <button on:click={() => goto(base + '/files')} class="btn-primary flex-1">파일 목록</button>
      </div>
    </div>
  {:else}
    <!-- File picker -->
    <div class="panel mb-4">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">서명할 파일</h2>
      {#if !selectedFile}
        <button
          class="w-full border-2 border-dashed rounded-xl py-10 px-6 text-center transition
            {dropActive ? 'border-navy-600 bg-navy-50' : 'border-gray-200 hover:border-gray-300'}"
          on:dragover|preventDefault={() => (dropActive = true)}
          on:dragleave={() => (dropActive = false)}
          on:drop={handleDrop}
          on:click={() => fileInput.click()}
        >
          <svg class="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
          </svg>
          <div class="text-sm text-gray-500">파일을 끌어다 놓거나 클릭하여 선택</div>
          <div class="text-xs text-gray-400 mt-1">모든 파일 형식 지원</div>
        </button>
        <input bind:this={fileInput} type="file" class="hidden"
          on:change={(e) => { const f = e.currentTarget.files?.[0]; if (f) selectedFile = f; }} />
      {:else}
        <div class="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
          <svg class="w-8 h-8 text-navy-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-slate-800 truncate">{selectedFile.name}</div>
            <div class="text-xs text-gray-400">{formatBytes(selectedFile.size)}</div>
          </div>
          <button on:click={() => (selectedFile = null)} class="btn-icon text-gray-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      {/if}
    </div>

    <!-- Signer selection (if archived identities exist) -->
    {#if archivedIdentities.length > 0}
      <div class="panel mb-4">
        <h2 class="text-sm font-semibold mb-3" style="color:var(--text)">서명자 선택</h2>
        <div class="space-y-2">
          <!-- Current -->
          <button
            class="w-full flex items-center gap-3 p-3 rounded-xl transition text-left"
            style={signerMode === 'current'
              ? 'background:rgba(59,130,246,0.15); border:1px solid #3b82f6'
              : 'background:var(--bg); border:1px solid var(--border-mid)'}
            on:click={() => { signerMode = 'current'; selectedArchivedId = null; }}
          >
            <div class="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
              {#if identity?.avatar}
                <img src={identity.avatar} alt="" class="w-full h-full object-cover" />
              {:else}
                <div class="w-full h-full flex items-center justify-center text-xs font-bold"
                  style="background:#1d6ef5; color:white">{identity?.commonName[0] ?? '?'}</div>
              {/if}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate" style="color:var(--text)">{identity?.commonName}</div>
              <div class="text-xs" style="color:var(--text-muted)">현재 신원 (활성)</div>
            </div>
            {#if signerMode === 'current'}
              <div class="w-4 h-4 rounded-full flex-shrink-0" style="background:#3b82f6"></div>
            {/if}
          </button>

          <!-- Archived -->
          {#each archivedIdentities as arch}
            <button
              class="w-full flex items-center gap-3 p-3 rounded-xl transition text-left"
              style={signerMode === 'archived' && selectedArchivedId === arch.id
                ? 'background:rgba(245,158,11,0.15); border:1px solid #f59e0b'
                : 'background:var(--bg); border:1px solid var(--border-mid)'}
              on:click={() => { signerMode = 'archived'; selectedArchivedId = arch.id ?? null; }}
            >
              <div class="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                {#if arch.avatar}
                  <img src={arch.avatar} alt="" class="w-full h-full object-cover" />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-xs font-bold"
                    style="background:#78716c; color:white">{arch.commonName[0] ?? '?'}</div>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate" style="color:var(--text)">{arch.commonName}</div>
                <div class="text-xs" style="color:var(--text-muted)">
                  폐지됨 · {new Date(arch.revokedAt).toLocaleDateString('ko-KR')}
                </div>
              </div>
              {#if signerMode === 'archived' && selectedArchivedId === arch.id}
                <div class="w-4 h-4 rounded-full flex-shrink-0" style="background:#f59e0b"></div>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Key unlock method -->
    <div class="panel mb-4">
      <h2 class="text-sm font-semibold mb-3" style="color:var(--text)">키 잠금 해제</h2>

      {#if showMethodToggle}
        <div class="flex gap-2 p-1 bg-gray-100 rounded-xl mb-3">
          <button
            class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition"
            class:bg-white={unlockMethod === 'biometric'}
            class:shadow-sm={unlockMethod === 'biometric'}
            class:text-navy-600={unlockMethod === 'biometric'}
            class:text-gray-500={unlockMethod !== 'biometric'}
            on:click={() => (unlockMethod = 'biometric')}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/>
            </svg>
            지문 인증
          </button>
          <button
            class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition"
            class:bg-white={unlockMethod === 'password'}
            class:shadow-sm={unlockMethod === 'password'}
            class:text-navy-600={unlockMethod === 'password'}
            class:text-gray-500={unlockMethod !== 'password'}
            on:click={() => (unlockMethod = 'password')}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
            비밀번호
          </button>
        </div>
      {/if}

      {#if signerMode === 'archived'}
        <!-- Archived identity: password only -->
        <div class="p-3 rounded-xl text-sm mb-2" style="background:rgba(245,158,11,0.1); color:#fbbf24">
          ⚠️ 보관된 신원은 백업 비밀번호로만 사용할 수 있습니다.
        </div>
        <input
          class="input"
          type="password"
          placeholder="백업 비밀번호"
          bind:value={archivedPassword}
          on:keydown={(e) => e.key === 'Enter' && selectedFile && sign()}
        />
      {:else if unlockMethod === 'password' || identity?.sealedKey.method === 'password'}
        <input
          class="input"
          type="password"
          placeholder="개인 키 비밀번호"
          bind:value={password}
          on:keydown={(e) => e.key === 'Enter' && selectedFile && sign()}
        />
      {:else}
        <div class="flex items-center gap-3 p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/>
          </svg>
          서명 버튼을 누르면 지문 인증을 요청합니다
        </div>
      {/if}
    </div>

    {#if error}
      <div class="p-4 bg-red-50 rounded-xl text-sm text-red-600 mb-4">{error}</div>
    {/if}

    <button class="btn-primary w-full" disabled={!selectedFile || signing} on:click={sign}>
      {#if signing}
        <div class="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
        {unlockMethod === 'biometric' ? '지문 인증 중…' : '서명 중…'}
      {:else}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
        </svg>
        서명하기
      {/if}
    </button>
  {/if}
</div>

{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}
