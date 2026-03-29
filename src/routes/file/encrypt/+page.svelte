<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { loadIdentity, saveFileRecord, getAllExpiredIdentities, type IdentityRecord } from '$lib/storage/keystore';
  import { getAllContacts, type Contact } from '$lib/storage/contacts';
  import { encryptForRecipients, decryptEnveloped, decryptAndInspect, packPkisFile, unpackPkisFile, compressData, decompressData } from '$lib/crypto/cms';
  import { encryptApprovalGated, unlockGatedPayload, unpackApprovalPayload } from '$lib/crypto/approval';
  import { generateIdenticon } from '$lib/crypto/identicon';
  import { unsealKey } from '$lib/crypto/protection';
  import { downloadFile, retrieveLaunchedFile } from '$lib/fileHandler';
  import { supabase } from '$lib/supabase';
  import { pendingViewerFiles } from '$lib/viewerStore';

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

  // Approval-gated encrypt
  let approvalGated = false;
  let approverContactId: number | null = null;
  // Viewer-only policy
  let viewerOnly = false;

  // Decrypt state
  let decryptFile: File | null = null;
  let decryptDropActive = false;
  let decryptDone = false;
  let decryptError = '';
  let decrypting = false;
  let decryptUsedArchivedKey = false;
  let decryptSignerInfo: { name: string; signingTime?: string; message?: string; fingerprint?: string; valid?: boolean } | null = null;
  let decryptedBytes: Uint8Array | null = null;
  let decryptedFilename = '';
  let decryptedMimeType = '';

  // Gated decrypt state
  let isGated = false;
  let gatedPayload: ArrayBuffer | null = null;
  let gatedApproverName = '';
  let gatedFilename = '';
  let gatedMimeType = '';
  let approvalRequestId = '';
  let awaitingApproval = false;
  let gateKeyEnvDer: ArrayBuffer | null = null;
  let approvalChannel: ReturnType<typeof supabase.channel> | null = null;
  // Enforced viewer-only from decrypted PKIS metadata
  let decryptViewerOnly = false;

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
        setDecryptFile(f);
      } else {
        selectedFile = f;
      }
    }
  });

  onDestroy(() => {
    if (approvalChannel) { supabase.removeChannel(approvalChannel); approvalChannel = null; }
  });

  function setDecryptFile(f: File | null) {
    decryptFile = f;
    decryptDone = false;
    decryptError = '';
    decryptSignerInfo = null;
    decryptedBytes = null;
    // Reset gated state
    isGated = false;
    gatedPayload = null;
    gateKeyEnvDer = null;
    awaitingApproval = false;
    approvalRequestId = '';
    if (approvalChannel) { supabase.removeChannel(approvalChannel); approvalChannel = null; }
    decryptViewerOnly = false;
  }

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

  function toB64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function fromB64(b64: string): ArrayBuffer {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
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
      if (compressBeforeEncrypt) fileData = await compressData(fileData);

      const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
      const outName = `${baseName}.pkis`;
      let packed: ArrayBuffer;

      if (approvalGated) {
        const approverContact = contacts.find(c => c.id === approverContactId);
        if (!approverContact) { error = '승인자를 선택하세요.'; encrypting = false; return; }
        const approverCert = getCertDer(approverContact.certDer);
        const payload = await encryptApprovalGated(fileData, recipientCerts, approverCert);
        packed = packPkisFile('gated', payload, selectedFile.name, selectedFile.type, encryptMessage.trim() || undefined, {
          approverId: approverContact.fingerprint ?? approverContact.email,
          approverName: approverContact.commonName,
          viewerOnly
        });
      } else {
        const result = await encryptForRecipients(fileData, recipientCerts);
        packed = packPkisFile('encrypted', result.der, selectedFile.name, selectedFile.type, encryptMessage.trim() || undefined, {
          viewerOnly
        });
      }

      downloadFile(packed, outName, 'application/pkis');
      await saveFileRecord({
        name: outName,
        originalName: selectedFile.name,
        type: approvalGated ? 'gated' : 'encrypted',
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
      let rawData = await decryptFile.arrayBuffer();

      // Check if PKIS container
      let pkisType: string | undefined;
      let containerMsg: string | undefined;
      let innerFilename: string | undefined;
      let innerMimeType: string | undefined;
      try {
        const pkis = unpackPkisFile(rawData);
        pkisType = pkis.type;
        rawData = pkis.payload;
        containerMsg = pkis.message;
        innerFilename = pkis.filename;
        innerMimeType = pkis.mimeType;

        // Handle approval-gated files
        if (pkis.type === 'gated') {
          isGated = true;
          gatedPayload = pkis.payload;
          gatedApproverName = pkis.approverName ?? '';
          gatedFilename = pkis.filename ?? decryptFile.name.replace(/\.pkis$/, '');
          gatedMimeType = pkis.mimeType ?? '';
          decryptViewerOnly = pkis.viewerOnly ?? false;
          decrypting = false;
          return;
        }
        decryptViewerOnly = pkis.viewerOnly ?? false;
      } catch { /* not a container, use raw */ }

      // Normal decrypt
      const pkcs8 = await unsealKey({
        sealed: identity.sealedKey,
        passwordBackup: identity.passwordBackup ?? undefined,
        password: unlockMethod === 'password' ? password : undefined,
        preferPassword: unlockMethod === 'password'
      });

      const certDer = getCertDer(identity.certDer);
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

      let finalData = decrypted.plaintext;
      try { finalData = await decompressData(decrypted.plaintext); } catch { /* not compressed */ }

      const filename = innerFilename ?? decryptFile.name.replace(/\.pkis$/, '');
      decryptedBytes = new Uint8Array(finalData);
      decryptedFilename = filename;
      decryptedMimeType = innerMimeType ?? '';

      if (decryptViewerOnly) {
        // Viewer-only: open in viewer immediately, no download
        pendingViewerFiles.set([{ name: filename, data: new Uint8Array(finalData), mimeType: innerMimeType ?? '' }]);
        goto(base + '/file/view');
        return;
      }

      // Download
      const blob = new Blob([finalData]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'decrypted'; a.click();
      URL.revokeObjectURL(url);

      decryptDone = true;
      showToast('복호화가 완료되었습니다.', 'success');

      const expired = await getAllExpiredIdentities();
      decryptUsedArchivedKey = expired.some(e => e.fingerprint === identity!.fingerprint);
    } catch (e) {
      decryptError = e instanceof Error ? e.message : String(e);
    } finally {
      decrypting = false;
    }
  }

  async function generateApprovalRequest() {
    if (!gatedPayload || !identity) return;
    try {
      const { approvalCmsDer } = unpackApprovalPayload(gatedPayload);
      approvalRequestId = crypto.randomUUID();

      const packed = packPkisFile('approval-req', approvalCmsDer, gatedFilename, gatedMimeType, undefined, {
        requestId: approvalRequestId,
        requesterCert: identity.certDer,
        approverId: identity.fingerprint ?? identity.email,
        approverName: gatedApproverName
      });

      const reqName = gatedFilename.replace(/\.[^.]+$/, '') + '.pkis-req';
      downloadFile(packed, reqName, 'application/pkis-req');

      // Listen for approver's response
      awaitingApproval = true;
      approvalChannel = supabase.channel('approval-' + approvalRequestId);
      approvalChannel
        .on('broadcast', { event: 'approved' }, (msg: { payload: { gateKeyEnv: string } }) => {
          gateKeyEnvDer = fromB64(msg.payload.gateKeyEnv);
          showToast('승인이 완료되었습니다. 복호화하세요.', 'success');
        })
        .subscribe();

      showToast('승인 요청 파일이 다운로드되었습니다. 승인자에게 전달하세요.', 'info');
    } catch (e) {
      decryptError = e instanceof Error ? e.message : String(e);
    }
  }

  async function decryptGated() {
    if (!gatedPayload || !gateKeyEnvDer || !identity) return;
    decryptError = '';
    decrypting = true;
    try {
      const pkcs8 = await unsealKey({
        sealed: identity.sealedKey,
        passwordBackup: identity.passwordBackup ?? undefined,
        password: unlockMethod === 'password' ? password : undefined,
        preferPassword: unlockMethod === 'password'
      });
      const certDer = getCertDer(identity.certDer);

      const innerCmsDer = await unlockGatedPayload(gatedPayload, gateKeyEnvDer, pkcs8, certDer);
      const decrypted = await decryptEnveloped(innerCmsDer, pkcs8, certDer);

      let finalData = decrypted.plaintext;
      try { finalData = await decompressData(finalData); } catch {}

      decryptedBytes = new Uint8Array(finalData);
      decryptedFilename = gatedFilename;
      decryptedMimeType = gatedMimeType;

      if (approvalChannel) { supabase.removeChannel(approvalChannel); approvalChannel = null; }

      if (decryptViewerOnly) {
        // Viewer-only: open in viewer immediately, no download
        pendingViewerFiles.set([{ name: gatedFilename, data: new Uint8Array(finalData), mimeType: gatedMimeType }]);
        goto(base + '/file/view');
        return;
      }

      // Download
      const blob = new Blob([finalData]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = gatedFilename || 'decrypted'; a.click();
      URL.revokeObjectURL(url);

      decryptDone = true;
      showToast('복호화가 완료되었습니다.', 'success');
    } catch (e) {
      decryptError = e instanceof Error ? e.message : String(e);
    } finally {
      decrypting = false;
    }
  }

  function openInViewer() {
    if (!decryptedBytes) return;
    pendingViewerFiles.set([{ name: decryptedFilename, data: decryptedBytes, mimeType: decryptedMimeType }]);
    goto(base + '/file/view');
  }

  $: isPdf = decryptedFilename.toLowerCase().endsWith('.pdf') || decryptedMimeType === 'application/pdf';
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

      <!-- Options -->
      <div class="panel mb-4 space-y-3">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" bind:checked={compressBeforeEncrypt} class="w-4 h-4 accent-navy-600" />
          <div>
            <div class="text-sm font-semibold text-gray-700">암호화 전 압축</div>
            <div class="text-xs text-gray-400 mt-0.5">파일 크기를 줄인 후 암호화합니다 (권장)</div>
          </div>
        </label>

        <div class="border-t border-gray-100 pt-3">
          <label class="flex items-center gap-3 cursor-pointer mb-3">
            <input type="checkbox" bind:checked={viewerOnly} class="w-4 h-4 accent-navy-600" />
            <div>
              <div class="text-sm font-semibold text-gray-700">뷰어 전용 모드</div>
              <div class="text-xs text-gray-400 mt-0.5">수신자가 파일을 저장할 수 없고 보안 뷰어로만 볼 수 있습니다 (PDF 필수)</div>
            </div>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" bind:checked={approvalGated} class="w-4 h-4 accent-navy-600" />
            <div>
              <div class="text-sm font-semibold text-gray-700">승인 후 복호화</div>
              <div class="text-xs text-gray-400 mt-0.5">지정된 승인자의 승인 없이는 열 수 없습니다</div>
            </div>
          </label>

          {#if approvalGated}
            <div class="mt-3 ml-7">
              <div class="text-xs text-gray-500 mb-2">승인자 선택</div>
              {#if contacts.length === 0}
                <p class="text-xs text-gray-400">연락처에 승인자를 먼저 추가하세요.</p>
              {:else}
                <div class="space-y-1 max-h-40 overflow-y-auto">
                  {#each contacts as c}
                    <label class="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input type="radio" name="approver" value={c.id} bind:group={approverContactId}
                        class="w-4 h-4 accent-navy-600" />
                      <div>
                        <div class="text-sm font-medium text-slate-800">{c.commonName}</div>
                        <div class="text-xs text-gray-400">{c.email}</div>
                      </div>
                    </label>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
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

    <div class="panel mb-4">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">복호화할 파일 (.pkis)</h2>
      {#if !decryptFile}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="w-full border-2 border-dashed rounded-xl py-8 px-6 text-center cursor-pointer transition
            {decryptDropActive ? 'border-navy-600 bg-navy-50' : 'border-gray-200 hover:border-gray-300'}"
          on:dragover|preventDefault={() => (decryptDropActive = true)}
          on:dragleave={() => (decryptDropActive = false)}
          on:drop={(e) => { e.preventDefault(); decryptDropActive = false; const f = e.dataTransfer?.files[0]; if (f) setDecryptFile(f); }}
          on:click={() => {
            const i = document.createElement('input');
            i.type = 'file'; i.accept = '.pkis';
            i.onchange = () => { if (i.files?.[0]) setDecryptFile(i.files[0]); };
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
          <button on:click={() => setDecryptFile(null)} class="btn-icon text-gray-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      {/if}
    </div>

    <!-- Gated file info -->
    {#if isGated && !decryptDone}
      <div class="panel mb-4" style="border:1px solid rgba(245,158,11,0.3); background:rgba(245,158,11,0.06)">
        <div class="flex items-start gap-3">
          <svg class="w-8 h-8 flex-shrink-0 mt-0.5" style="color:#f59e0b" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          <div class="flex-1">
            <div class="font-semibold text-sm" style="color:#92400e">승인 후 복호화 파일</div>
            <div class="text-xs mt-1" style="color:#b45309">
              이 파일은 <strong>{gatedApproverName || '지정된 승인자'}</strong>의 승인이 있어야 복호화할 수 있습니다.
            </div>
          </div>
        </div>

        {#if !awaitingApproval}
          <button class="btn-primary w-full mt-4" on:click={generateApprovalRequest}>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            승인 요청 파일 만들기
          </button>
        {:else if !gateKeyEnvDer}
          <div class="flex items-center gap-2 mt-4 p-3 rounded-xl" style="background:rgba(59,130,246,0.1)">
            <div class="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0" style="border-color:#3b82f6;border-top-color:transparent"></div>
            <div class="text-xs" style="color:#3b82f6">
              승인자의 응답을 기다리는 중입니다… 승인 요청 파일을 <strong>{gatedApproverName}</strong>에게 전달하세요.
            </div>
          </div>
        {:else}
          <div class="mt-3 p-3 rounded-xl text-xs text-green-700" style="background:rgba(16,185,129,0.1)">
            승인이 완료되었습니다. 아래에서 복호화하세요.
          </div>
        {/if}
      </div>
    {/if}

    <!-- Key unlock (only for non-gated or gated-with-approval) -->
    {#if (!isGated || gateKeyEnvDer) && !decryptDone}
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
            on:keydown={(e) => e.key === 'Enter' && decryptFile && (isGated ? decryptGated() : decrypt())} />
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
    {/if}

    {#if decryptError}
      <div class="p-4 bg-red-50 rounded-xl text-sm text-red-600 mb-4">{decryptError}</div>
    {/if}

    {#if decryptDone}
      <div class="p-4 bg-green-50 rounded-xl text-sm text-green-700 mb-4 text-center font-semibold">
        복호화 완료 — 파일이 다운로드되었습니다.
      </div>

      {#if decryptViewerOnly}
        <div class="flex items-center gap-2 p-3 rounded-xl text-xs mb-3" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);color:#6366f1">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          이 파일은 <strong>뷰어 전용</strong>으로 암호화되었습니다. 파일 저장이 제한됩니다.
        </div>
      {/if}

      {#if isPdf && decryptedBytes}
        <button class="btn-primary w-full mb-4" on:click={openInViewer}>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>
          보안 PDF 뷰어로 열기
        </button>
      {/if}

      {#if decryptSignerInfo}
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
          <span>이 파일은 <strong>이전 버전 신원</strong>으로 암호화된 파일입니다.</span>
        </div>
      {/if}
    {/if}

    <!-- Decrypt button -->
    {#if !decryptDone}
      {#if isGated && gateKeyEnvDer}
        <button class="btn-primary w-full" disabled={decrypting} on:click={decryptGated}>
          {#if decrypting}
            <div class="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
            {unlockMethod === 'biometric' ? '지문 인증 중…' : '복호화 중…'}
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
            </svg>
            승인된 파일 복호화하기
          {/if}
        </button>
      {:else if !isGated}
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
    {/if}
  {/if}
</div>

{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}
