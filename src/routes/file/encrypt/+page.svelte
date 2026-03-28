<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { loadIdentity, saveFileRecord, getAllExpiredIdentities, type IdentityRecord } from '$lib/storage/keystore';
  import { getAllContacts, type Contact } from '$lib/storage/contacts';
  import { encryptForRecipients, decryptEnveloped, decryptAndInspect, packPkisFile, unpackPkisFile, compressData, decompressData } from '$lib/crypto/cms';
  import { generateIdenticon } from '$lib/crypto/identicon';
  import { unsealKey } from '$lib/crypto/protection';
  import { downloadFile, retrieveLaunchedFile } from '$lib/fileHandler';

  let identity: IdentityRecord | null = null;
  let contacts: Contact[] = [];
  let selectedFile: File | null = null;
  let recipients: Set<number> = new Set();
  let includeSelf = true;
  let encrypting = false;
  let done = false;
  let error = '';
  let dropActive = false;
  let fileInput: HTMLInputElement;
  let tab: 'encrypt' | 'decrypt' = 'encrypt';
  let encryptMessage = '';
  let compressBeforeEncrypt = true;

  // Decrypt state
  let decryptFile: File | null = null;
  let decryptDropActive = false;
  let decryptDone = false;
  let decryptError = '';
  let decrypting = false;
  let decryptUsedArchivedKey = false;
  let decryptSignerInfo: { name: string; signingTime?: string; message?: string; fingerprint?: string; valid?: boolean } | null = null;

  // Unlock method
  let unlockMethod: 'biometric' | 'password' = 'biometric';
  let password = '';
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
    contacts = await getAllContacts();
    unlockMethod = identity.sealedKey.method === 'webauthn' ? 'biometric' : 'password';
    const launched = retrieveLaunchedFile();
    if (launched) {
      const f = new File([launched.data], launched.name, { type: launched.type });
      if (launched.name.endsWith('.pkis')) {
        tab = 'decrypt';
        decryptFile = f;
      } else {
        selectedFile = f;
      }
    }
  });

  function toggleRecipient(id: number | undefined) {
    if (id === undefined) return;
    if (recipients.has(id)) recipients.delete(id);
    else recipients.add(id);
    recipients = new Set(recipients);
  }

  function getCertDer(b64: string): ArrayBuffer {
    const bin = atob(b64);
    return Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }

  async function encrypt() {
    if (!selectedFile || !identity) return;
    error = '';
    encrypting = true;
    try {
      const recipientCerts: ArrayBuffer[] = [];
      if (includeSelf) recipientCerts.push(getCertDer(identity.certDer));
      for (const id of recipients) {
        const c = contacts.find(c => c.id === id);
        if (c) recipientCerts.push(getCertDer(c.certDer));
      }
      if (recipientCerts.length === 0) {
        error = '수신자를 한 명 이상 선택하세요.';
        encrypting = false;
        return;
      }

      let fileData = await selectedFile.arrayBuffer();
      if (compressBeforeEncrypt) {
        fileData = await compressData(fileData);
      }
      const result = await encryptForRecipients(fileData, recipientCerts);
      const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
      const outName = `${baseName}.pkis`;
      const packed = packPkisFile('encrypted', result.der, selectedFile.name, selectedFile.type, encryptMessage.trim() || undefined);
      downloadFile(packed, outName, 'application/pkis');

      await saveFileRecord({
        name: outName,
        originalName: selectedFile.name,
        type: 'encrypted',
        size: packed.byteLength,
        createdAt: new Date().toISOString(),
        recipientCount: recipientCerts.length,
        data: packed
      });

      done = true;
      showToast('암호화가 완료되었습니다.', 'success');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      encrypting = false;
    }
  }

  async function decrypt() {
    if (!decryptFile || !identity) return;
    decryptError = '';
    decrypting = true;
    try {
      // Unseal to raw PKCS8 bytes (NOT CryptoKey) — decryptEnveloped needs raw bytes for ECDH import
      const pkcs8 = await unsealKey({
        sealed: identity.sealedKey,
        passwordBackup: identity.passwordBackup ?? undefined,
        password: unlockMethod === 'password' ? password : undefined,
        preferPassword: unlockMethod === 'password'
      });

      const certDer = getCertDer(identity.certDer);
      let rawData = await decryptFile.arrayBuffer();

      // Check if file is a PKIS container and unwrap
      let containerMsg: string | undefined;
      let innerFilename: string | undefined;
      try {
        const pkis = unpackPkisFile(rawData);
        rawData = pkis.payload;
        containerMsg = pkis.message;
        innerFilename = pkis.filename;
      } catch { /* not a container, use raw */ }

      const decrypted = await decryptAndInspect(rawData, pkcs8, certDer);
      decryptSignerInfo = null;

      if (decrypted.isSigned && decrypted.verifyResult) {
        const vr = decrypted.verifyResult;
        decryptSignerInfo = {
          name: vr.signerCommonName,
          signingTime: vr.signingTime,
          message: vr.message || containerMsg,
          fingerprint: vr.signerFingerprint,
          valid: vr.valid
        };
      }

      // Try decompression (files encrypted with compression option)
      let finalData = decrypted.plaintext;
      try { finalData = await decompressData(decrypted.plaintext); } catch { /* not compressed */ }

      const baseName = (innerFilename ?? decryptFile.name).replace(/\.pkis$/, '');
      const blob = new Blob([finalData]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = baseName || 'decrypted';
      a.click();
      URL.revokeObjectURL(url);
      decryptDone = true;
      showToast('복호화가 완료되었습니다.', 'success');

      // Check if current cert fingerprint is in archived list
      // (meaning this file was encrypted for an older version of the identity)
      const expired = await getAllExpiredIdentities();
      decryptUsedArchivedKey = expired.some(e => e.fingerprint === identity!.fingerprint);
    } catch (e) {
      decryptError = e instanceof Error ? e.message : String(e);
    } finally {
      decrypting = false;
    }
  }

  function handleDecryptDrop(e: DragEvent) {
    e.preventDefault();
    decryptDropActive = false;
    const file = e.dataTransfer?.files[0];
    if (file) { decryptFile = file; decryptDone = false; decryptError = ''; }
  }
</script>

<svelte:head>
  <title>파일 암호화 — KeyID</title>
</svelte:head>

<div class="px-4 md:px-6 pt-6 pb-24 w-full">
  <!-- Header -->
  <div class="flex items-center gap-3 mb-6">
    <button on:click={() => goto(base + '/')} class="btn-icon">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <div>
      <h1 class="text-xl font-bold text-slate-800">파일 암호화</h1>
      <p class="text-sm text-gray-400">암호화 및 복호화</p>
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
    <button
      class="flex-1 py-2 rounded-lg text-sm font-medium transition"
      class:bg-white={tab === 'encrypt'} class:shadow-sm={tab === 'encrypt'}
      class:text-navy-600={tab === 'encrypt'} class:text-gray-500={tab !== 'encrypt'}
      on:click={() => (tab = 'encrypt')}
    >암호화</button>
    <button
      class="flex-1 py-2 rounded-lg text-sm font-medium transition"
      class:bg-white={tab === 'decrypt'} class:shadow-sm={tab === 'decrypt'}
      class:text-navy-600={tab === 'decrypt'} class:text-gray-500={tab !== 'decrypt'}
      on:click={() => (tab = 'decrypt')}
    >복호화</button>
  </div>

  {#if tab === 'encrypt'}
    <!-- ── Encrypt ── -->
    {#if done}
      <div class="panel text-center space-y-4">
        <div class="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto">
          <svg class="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <div class="font-bold text-lg text-slate-800">암호화 완료</div>
        <p class="text-sm text-gray-500">.pkis 파일을 선택한 수신자에게 전달하세요.</p>
        <div class="flex gap-3">
          <button on:click={() => { done = false; selectedFile = null; }} class="btn-secondary flex-1">다른 파일</button>
          <button on:click={() => goto(base + '/files')} class="btn-primary flex-1">파일 목록</button>
        </div>
      </div>
    {:else}
      <div class="panel mb-4">
        <h2 class="text-sm font-semibold text-gray-700 mb-3">암호화할 파일</h2>
        {#if !selectedFile}
          <button
            class="w-full border-2 border-dashed rounded-xl py-8 px-6 text-center transition
              {dropActive ? 'border-navy-600 bg-navy-50' : 'border-gray-200 hover:border-gray-300'}"
            on:dragover|preventDefault={() => (dropActive = true)}
            on:dragleave={() => (dropActive = false)}
            on:drop={(e) => { e.preventDefault(); dropActive = false; const f = e.dataTransfer?.files[0]; if (f) selectedFile = f; }}
            on:click={() => fileInput.click()}
          >
            <svg class="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <div class="text-sm text-gray-500">파일을 끌어다 놓거나 클릭하여 선택</div>
          </button>
          <input bind:this={fileInput} type="file" class="hidden"
            on:change={(e) => { const f = e.currentTarget.files?.[0]; if (f) selectedFile = f; }} />
        {:else}
          <div class="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
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

      <div class="panel mb-4">
        <h2 class="text-sm font-semibold text-gray-700 mb-3">수신자 선택</h2>
        <label class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer mb-2">
          <input type="checkbox" bind:checked={includeSelf} class="w-4 h-4 accent-navy-600" />
          <div class="flex-1">
            <div class="font-medium text-sm text-slate-800">{identity?.commonName ?? '나'} (나)</div>
            <div class="text-xs text-gray-400">{identity?.email ?? ''}</div>
          </div>
        </label>
        {#each contacts as c}
          <label class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer">
            <input type="checkbox"
              checked={c.id !== undefined && recipients.has(c.id)}
              on:change={() => toggleRecipient(c.id)}
              class="w-4 h-4 accent-navy-600" />
            <div class="flex-1">
              <div class="font-medium text-sm text-slate-800">{c.commonName}</div>
              <div class="text-xs text-gray-400">{c.email}</div>
            </div>
          </label>
        {/each}
        {#if contacts.length === 0}
          <p class="text-xs text-gray-400 text-center py-3">연락처가 없습니다.</p>
        {/if}
      </div>

      <!-- Message for recipients -->
      <div class="panel mb-4">
        <h2 class="text-sm font-semibold text-gray-700 mb-2">
          메시지 <span class="font-normal text-xs text-gray-400">(선택)</span>
        </h2>
        <textarea class="input w-full resize-none" rows="3"
          placeholder="수신자에게 전달할 메시지 (파일 용도 설명 등)"
          maxlength="256" bind:value={encryptMessage}></textarea>
        <div class="text-right text-xs mt-1 text-gray-400">{encryptMessage.length}/256</div>
      </div>

      <!-- Compression option -->
      <div class="panel mb-4">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" bind:checked={compressBeforeEncrypt} class="w-4 h-4 accent-navy-600" />
          <div>
            <div class="text-sm font-semibold text-gray-700">암호화 전 압축</div>
            <div class="text-xs text-gray-400 mt-0.5">파일 크기를 줄인 후 암호화합니다 (권장)</div>
          </div>
        </label>
      </div>

      {#if error}
        <div class="p-4 bg-red-50 rounded-xl text-sm text-red-600 mb-4">{error}</div>
      {/if}

      <button class="btn-primary w-full" disabled={!selectedFile || encrypting} on:click={encrypt}>
        {#if encrypting}
          <div class="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
          암호화 중…
        {:else}
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          암호화하기
        {/if}
      </button>
    {/if}

  {:else}
    <!-- ── Decrypt ── -->

    <!-- File picker with drag & drop -->
    <div class="panel mb-4">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">복호화할 파일 (.pkis)</h2>
      {#if !decryptFile}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="w-full border-2 border-dashed rounded-xl py-8 px-6 text-center cursor-pointer transition
            {decryptDropActive ? 'border-navy-600 bg-navy-50' : 'border-gray-200 hover:border-gray-300'}"
          on:dragover|preventDefault={() => (decryptDropActive = true)}
          on:dragleave={() => (decryptDropActive = false)}
          on:drop={handleDecryptDrop}
          on:click={() => {
            const i = document.createElement('input');
            i.type = 'file'; i.accept = '.pkis';
            i.onchange = () => { if (i.files?.[0]) { decryptFile = i.files[0]; decryptDone = false; decryptError = ''; } };
            i.click();
          }}
        >
          <svg class="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
          </svg>
          <div class="text-sm text-gray-500">파일을 끌어다 놓거나 클릭하여 선택</div>
          <div class="text-xs text-gray-400 mt-1">.pkis 암호화 파일</div>
        </div>
      {:else}
        <div class="flex items-center gap-3 p-4 bg-purple-50 rounded-xl">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-slate-800 truncate">{decryptFile.name}</div>
            <div class="text-xs text-gray-400">{formatBytes(decryptFile.size)}</div>
          </div>
          <button on:click={() => { decryptFile = null; decryptDone = false; decryptError = ''; }} class="btn-icon text-gray-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      {/if}
    </div>

    <!-- Key unlock -->
    <div class="panel mb-4">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">키 잠금 해제</h2>

      {#if showMethodToggle}
        <div class="flex gap-2 p-1 bg-gray-100 rounded-xl mb-3">
          <button
            class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition"
            class:bg-white={unlockMethod === 'biometric'} class:shadow-sm={unlockMethod === 'biometric'}
            class:text-navy-600={unlockMethod === 'biometric'} class:text-gray-500={unlockMethod !== 'biometric'}
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
            class:bg-white={unlockMethod === 'password'} class:shadow-sm={unlockMethod === 'password'}
            class:text-navy-600={unlockMethod === 'password'} class:text-gray-500={unlockMethod !== 'password'}
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

      {#if unlockMethod === 'password' || identity?.sealedKey.method === 'password'}
        <input class="input" type="password" placeholder="개인 키 비밀번호"
          bind:value={password}
          on:keydown={(e) => e.key === 'Enter' && decryptFile && decrypt()} />
      {:else}
        <div class="flex items-center gap-3 p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/>
          </svg>
          복호화 버튼을 누르면 지문 인증을 요청합니다
        </div>
      {/if}
    </div>

    {#if decryptError}
      <div class="p-4 bg-red-50 rounded-xl text-sm text-red-600 mb-4">{decryptError}</div>
    {/if}

    {#if decryptDone}
      <div class="p-4 bg-green-50 rounded-xl text-sm text-green-700 mb-4 text-center font-semibold">
        복호화 완료 — 파일이 다운로드되었습니다.
      </div>

      {#if decryptSignerInfo}
        <!-- Signer info from inner SignedData -->
        <div class="panel mb-4 flex items-start gap-4">
          <img
            src={generateIdenticon(decryptSignerInfo.name)}
            alt={decryptSignerInfo.name}
            class="w-12 h-12 rounded-full object-cover flex-shrink-0"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-semibold text-slate-800 text-sm">{decryptSignerInfo.name}</span>
              {#if decryptSignerInfo.valid}
                <span class="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">서명 유효</span>
              {:else}
                <span class="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">서명 무효</span>
              {/if}
            </div>
            {#if decryptSignerInfo.signingTime}
              <div class="text-xs text-gray-400">{new Date(decryptSignerInfo.signingTime).toLocaleString('ko-KR')}</div>
            {/if}
            {#if decryptSignerInfo.message}
              <div class="mt-2 p-2 bg-blue-50 rounded-lg text-sm text-blue-700 italic">
                "{decryptSignerInfo.message}"
              </div>
            {/if}
          </div>
        </div>
      {/if}

      {#if decryptUsedArchivedKey}
        <div class="flex items-center gap-2 p-3 rounded-xl text-sm mb-4"
          style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.3); color:#fbbf24">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <span>이 파일은 <strong>이전 버전 신원</strong>으로 암호화된 파일입니다. 현재 신원이 갱신되었습니다.</span>
        </div>
      {/if}
    {/if}

    <button class="btn-primary w-full" disabled={!decryptFile || decrypting} on:click={decrypt}>
      {#if decrypting}
        <div class="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
        {unlockMethod === 'biometric' ? '지문 인증 중…' : '복호화 중…'}
      {:else}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
        </svg>
        복호화하기
      {/if}
    </button>
  {/if}
</div>

{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}
