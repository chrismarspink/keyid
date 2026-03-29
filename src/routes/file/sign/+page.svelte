<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import {
    loadIdentity, saveFileRecord, getAllExpiredIdentities,
    type IdentityRecord, type ExpiredIdentityRecord
  } from '$lib/storage/keystore';
  import { getAllContacts, type Contact } from '$lib/storage/contacts';
  import { unsealKey } from '$lib/crypto/protection';
  import { importPrivateKeyPkcs8 } from '$lib/crypto/keygen';
  import { signData, signThenEncrypt, signDataEmbedded, addCoSignerInfo, encryptForRecipients, packPkisFile } from '$lib/crypto/cms';
  import { generateIdenticon } from '$lib/crypto/identicon';
  import { downloadFile, retrieveLaunchedFile } from '$lib/fileHandler';
  import { encodeToQRFrames } from '$lib/qr/bcur';
  import { supabase } from '$lib/supabase';
  import QRCode from '../../../components/QRCode.svelte';
  import { page } from '$app/stores';

  let identity: IdentityRecord | null = null;
  let archivedIdentities: ExpiredIdentityRecord[] = [];
  let contacts: Contact[] = [];

  // Operation mode
  let mode: 'sign' | 'sign-encrypt' | 'request' = 'sign';
  // Signature type (only applies to mode === 'sign')
  let sigMode: 'detached' | 'embedded' = 'detached';

  // Signer
  let signerMode: 'current' | 'archived' = 'current';
  let selectedArchivedId: number | null = null;
  let archivedPassword = '';
  $: selectedArchived = archivedIdentities.find(a => a.id === selectedArchivedId) ?? null;

  // Recipients (for sign+encrypt)
  let recipients: Set<number> = new Set();
  let includeSelf = true;

  // File & message
  let selectedFile: File | null = null;
  let message = '';
  let signing = false;
  let done = false;
  let signResult: { fileName: string; sigFile: string; signerName: string; mode: string } | null = null;
  let error = '';
  let dropActive = false;
  let fileInput: HTMLInputElement;

  // Key unlock
  let unlockMethod: 'biometric' | 'password' = 'biometric';
  $: hasBiometric = identity?.sealedKey.method === 'webauthn';
  $: hasPasswordOption = identity?.sealedKey.method === 'password' || !!identity?.passwordBackup;
  $: showMethodToggle = hasBiometric && hasPasswordOption;
  let password = '';

  // ── 서명 요청 모드 ──────────────────────────────────────────────────
  let requestId = '';
  let reqsignBuffer: ArrayBuffer | null = null;
  let qrFrames: string[] = [];
  let qrFrameIndex = 0;
  let qrInterval: ReturnType<typeof setInterval> | null = null;
  let waitingForSig = false;
  let receivedSigBuffer: ArrayBuffer | null = null;
  let receivedSigName = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reqChannel: any = null;

  $: currentQRFrame = qrFrames[qrFrameIndex] ?? '';

  function stopQRAnimation() {
    if (qrInterval) { clearInterval(qrInterval); qrInterval = null; }
  }

  function stopChannel() {
    if (reqChannel) { supabase.removeChannel(reqChannel); reqChannel = null; }
  }

  // ── 공동 서명 (co-sign) ─────────────────────────────────────────────
  let addCosigner = false;
  let cosignerContactId: number | null = null;
  let cosignMessage = '';
  let cosignBuffer: ArrayBuffer | null = null;
  let cosignQrFrames: string[] = [];
  let cosignQrFrameIndex = 0;
  let cosignQrInterval: ReturnType<typeof setInterval> | null = null;
  let cosignRequestId = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cosignChannel: any = null;
  let pendingSignedDataDer: ArrayBuffer | null = null;
  let pendingRecipients: ArrayBuffer[] = [];
  let pendingOutputName = '';

  $: currentCosignQRFrame = cosignQrFrames[cosignQrFrameIndex] ?? '';

  function stopCosignQRAnimation() {
    if (cosignQrInterval) { clearInterval(cosignQrInterval); cosignQrInterval = null; }
  }

  function stopCosignChannel() {
    if (cosignChannel) { supabase.removeChannel(cosignChannel); cosignChannel = null; }
  }

  onDestroy(() => { stopQRAnimation(); stopChannel(); stopCosignQRAnimation(); stopCosignChannel(); });

  let toast = { visible: false, msg: '', type: 'info' as 'success' | 'error' | 'info' };
  function showToast(msg: string, type: typeof toast.type = 'info') {
    toast = { visible: true, msg, type };
    setTimeout(() => (toast = { ...toast, visible: false }), 3200);
  }

  onMount(async () => {
    identity = await loadIdentity();
    if (!identity) { goto(base + '/'); return; }
    unlockMethod = identity.sealedKey.method === 'webauthn' ? 'biometric' : 'password';
    [archivedIdentities, contacts] = await Promise.all([
      getAllExpiredIdentities().then(a => a.filter(x => !!x.sealedKey)),
      getAllContacts()
    ]);
    const archivedParam = $page.url.searchParams.get('archived');
    if (archivedParam) {
      const id = parseInt(archivedParam);
      const found = archivedIdentities.find(a => a.id === id);
      if (found) { signerMode = 'archived'; selectedArchivedId = id; }
    }
    const launched = retrieveLaunchedFile();
    if (launched) selectedFile = new File([launched.data], launched.name, { type: launched.type });
  });

  function handleDrop(e: DragEvent) {
    e.preventDefault(); dropActive = false;
    const file = e.dataTransfer?.files[0];
    if (file) selectedFile = file;
  }

  function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }

  function getCertDer(b64: string): ArrayBuffer {
    const bin = atob(b64);
    return Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
  }

  function toggleRecipient(id: number | undefined) {
    if (id === undefined) return;
    if (recipients.has(id)) recipients.delete(id);
    else recipients.add(id);
    recipients = new Set(recipients);
  }

  async function doSign() {
    if (!selectedFile) return;
    error = '';
    signing = true;
    try {
      let pkcs8: ArrayBuffer;
      let certDer: ArrayBuffer;
      let signerName: string;

      if (signerMode === 'archived' && selectedArchived?.sealedKey) {
        pkcs8 = await unsealKey({ sealed: selectedArchived.sealedKey, password: archivedPassword, preferPassword: true });
        certDer = getCertDer(selectedArchived.certDer);
        signerName = selectedArchived.commonName;
      } else {
        if (!identity) return;
        pkcs8 = await unsealKey({
          sealed: identity.sealedKey,
          passwordBackup: identity.passwordBackup ?? undefined,
          password: unlockMethod === 'password' ? password : undefined,
          preferPassword: unlockMethod === 'password'
        });
        certDer = getCertDer(identity.certDer);
        signerName = identity.commonName;
      }

      const privateKey = await importPrivateKeyPkcs8(pkcs8);
      const fileData = await selectedFile.arrayBuffer();
      const msg = message.trim() || undefined;

      const baseName = selectedFile.name.replace(/\.[^.]+$/, '');

      if (mode === 'sign') {
        if (sigMode === 'embedded') {
          // p7m-style: original file embedded inside the signature
          const result = await signDataEmbedded(fileData, privateKey, certDer, msg);

          if (addCosigner && cosignerContactId !== null) {
            pendingSignedDataDer = result.der;
            pendingOutputName = `${baseName}.pkis-sig`;
            pendingRecipients = [];
            await startCosignRequest(fileData);
            return;
          }

          const packed = packPkisFile('signed', result.der, selectedFile.name, selectedFile.type, msg, { embedded: true });
          const sigFileName = `${baseName}.pkis-sig`;
          downloadFile(packed, sigFileName, 'application/pkis-sig');
          await saveFileRecord({
            name: sigFileName, originalName: selectedFile.name, type: 'signed',
            size: packed.byteLength, createdAt: new Date().toISOString(),
            signerName, embedded: true, data: packed
          });
          signResult = { fileName: selectedFile.name, sigFile: sigFileName, signerName, mode: '포함 서명' };
        } else {
          // p7s-style: detached signature, original file separate
          const result = await signData(fileData, privateKey, certDer, msg);

          if (addCosigner && cosignerContactId !== null) {
            pendingSignedDataDer = result.der;
            pendingOutputName = `${baseName}.pkis-sig`;
            pendingRecipients = [];
            await startCosignRequest(fileData);
            return;
          }

          const packed = packPkisFile('signed', result.der, selectedFile.name, selectedFile.type, msg);
          const sigFileName = `${baseName}.pkis-sig`;
          downloadFile(packed, sigFileName, 'application/pkis-sig');
          await saveFileRecord({
            name: sigFileName, originalName: selectedFile.name, type: 'signed',
            size: packed.byteLength, createdAt: new Date().toISOString(),
            signerName, data: packed
          });
          signResult = { fileName: selectedFile.name, sigFile: sigFileName, signerName, mode: '서명' };
        }
      } else {
        // sign + encrypt
        const recipientCerts: ArrayBuffer[] = [];
        if (includeSelf && identity) recipientCerts.push(getCertDer(identity.certDer));
        for (const id of recipients) {
          const c = contacts.find(c => c.id === id);
          if (c) recipientCerts.push(getCertDer(c.certDer));
        }
        if (recipientCerts.length === 0) { error = '수신자를 한 명 이상 선택하세요.'; signing = false; return; }

        if (addCosigner && cosignerContactId !== null) {
          const embedded = await signDataEmbedded(fileData, privateKey, certDer, msg);
          pendingSignedDataDer = embedded.der;
          pendingOutputName = `${baseName}.pkis`;
          pendingRecipients = recipientCerts;
          await startCosignRequest(fileData);
          return;
        }

        const result = await signThenEncrypt(fileData, privateKey, certDer, recipientCerts, msg);
        const packed = packPkisFile('signed-encrypted', result.der, selectedFile.name, selectedFile.type, msg);
        const outName = `${baseName}.pkis`;
        downloadFile(packed, outName, 'application/pkis');
        await saveFileRecord({
          name: outName, originalName: selectedFile.name, type: 'encrypted',
          size: packed.byteLength, createdAt: new Date().toISOString(),
          signerName, recipientCount: recipientCerts.length, data: packed
        });
        signResult = { fileName: selectedFile.name, sigFile: outName, signerName, mode: '서명+암호화' };
      }

      done = true;
      showToast('완료되었습니다.', 'success');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      signing = false;
    }
  }

  // ── 서명 요청 생성 ──────────────────────────────────────────────────
  async function doCreateRequest() {
    if (!selectedFile || !identity) return;
    error = '';
    signing = true;
    try {
      const fileData = await selectedFile.arrayBuffer();
      requestId = crypto.randomUUID();
      const msg = message.trim() || undefined;

      const packed = packPkisFile(
        'reqsign',
        fileData,
        selectedFile.name,
        selectedFile.type,
        msg,
        { requestId, requesterCert: identity.certDer }
      );
      reqsignBuffer = packed;
      receivedSigBuffer = null;
      receivedSigName = selectedFile.name.replace(/\.[^.]+$/, '') + '.pkis-sig';

      // Encode to QR frames
      qrFrames = encodeToQRFrames(new Uint8Array(packed));
      qrFrameIndex = 0;
      stopQRAnimation();
      if (qrFrames.length > 1) {
        qrInterval = setInterval(() => {
          qrFrameIndex = (qrFrameIndex + 1) % qrFrames.length;
        }, 500);
      }

      // Subscribe to Supabase realtime channel
      stopChannel();
      waitingForSig = true;
      reqChannel = supabase.channel('reqsign-' + requestId);
      reqChannel
        .on('broadcast', { event: 'signed' }, (data: { payload?: { sig?: string } }) => {
          const sigBase64 = data.payload?.sig;
          if (sigBase64) {
            const bin = atob(sigBase64);
            receivedSigBuffer = Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
            waitingForSig = false;
            stopQRAnimation();
            showToast('서명을 수신했습니다!', 'success');
          }
        })
        .subscribe();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      signing = false;
    }
  }

  function downloadReqsign() {
    if (!reqsignBuffer || !selectedFile) return;
    const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
    downloadFile(reqsignBuffer, `${baseName}.pkis-reqsign`, 'application/octet-stream');
  }

  function downloadReceivedSig() {
    if (!receivedSigBuffer) return;
    downloadFile(receivedSigBuffer, receivedSigName, 'application/pkis-sig');
  }

  function reset() {
    selectedFile = null; password = ''; archivedPassword = '';
    message = ''; done = false; signResult = null; error = '';
    stopQRAnimation(); stopChannel();
    reqsignBuffer = null; qrFrames = []; receivedSigBuffer = null; waitingForSig = false; requestId = '';
    addCosigner = false; cosignerContactId = null; cosignMessage = '';
    stopCosignQRAnimation(); stopCosignChannel();
    cosignBuffer = null; cosignQrFrames = []; pendingSignedDataDer = null; pendingRecipients = []; pendingOutputName = '';
  }

  function arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async function startCosignRequest(fileData: ArrayBuffer) {
    if (!identity || !selectedFile) return;
    cosignRequestId = crypto.randomUUID();
    const cmsg = cosignMessage.trim() || undefined;

    const packed = packPkisFile(
      'cosign',
      fileData,
      selectedFile.name,
      selectedFile.type,
      cmsg,
      { requestId: cosignRequestId, requesterCert: identity.certDer }
    );
    cosignBuffer = packed;

    cosignQrFrames = encodeToQRFrames(new Uint8Array(packed));
    cosignQrFrameIndex = 0;
    stopCosignQRAnimation();
    if (cosignQrFrames.length > 1) {
      cosignQrInterval = setInterval(() => {
        cosignQrFrameIndex = (cosignQrFrameIndex + 1) % cosignQrFrames.length;
      }, 500);
    }

    stopCosignChannel();
    cosignChannel = supabase.channel('cosign-' + cosignRequestId);
    cosignChannel
      .on('broadcast', { event: 'cosigned' }, async (data: { payload?: { signerInfo?: string; cert?: string } }) => {
        const siBase64 = data.payload?.signerInfo;
        const certBase64 = data.payload?.cert;
        if (siBase64 && certBase64) {
          try {
            await finalizeCosign(siBase64, certBase64);
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
          }
        }
      })
      .subscribe();
  }

  async function finalizeCosign(siBase64: string, certBase64: string) {
    if (!pendingSignedDataDer || !selectedFile || !identity) return;

    const b64ToAb = (b64: string) => {
      const bin = atob(b64);
      return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
    };

    const signerInfoDer = b64ToAb(siBase64);
    const cosignerCertDer = b64ToAb(certBase64);
    const mergedCmsDer = addCoSignerInfo(pendingSignedDataDer, signerInfoDer, cosignerCertDer);
    const msg = message.trim() || undefined;
    const signerName = identity.commonName;

    let packed: ArrayBuffer;
    const outputName = pendingOutputName;

    if (pendingRecipients.length > 0) {
      const encResult = await encryptForRecipients(mergedCmsDer, pendingRecipients);
      packed = packPkisFile('signed-encrypted', encResult.der, selectedFile.name, selectedFile.type, msg);
      await saveFileRecord({
        name: outputName, originalName: selectedFile.name, type: 'encrypted',
        size: packed.byteLength, createdAt: new Date().toISOString(),
        signerName, recipientCount: pendingRecipients.length, data: packed
      });
      signResult = { fileName: selectedFile.name, sigFile: outputName, signerName, mode: '공동서명+암호화' };
    } else {
      packed = packPkisFile('signed', mergedCmsDer, selectedFile.name, selectedFile.type, msg);
      await saveFileRecord({
        name: outputName, originalName: selectedFile.name, type: 'signed',
        size: packed.byteLength, createdAt: new Date().toISOString(),
        signerName, data: packed
      });
      signResult = { fileName: selectedFile.name, sigFile: outputName, signerName, mode: '공동서명' };
    }

    downloadFile(packed, outputName, outputName.endsWith('.pkis') ? 'application/pkis' : 'application/pkis-sig');

    stopCosignQRAnimation();
    stopCosignChannel();
    cosignBuffer = null;
    pendingSignedDataDer = null;
    showToast('공동 서명이 완료되었습니다!', 'success');
    done = true;
  }

  $: signerAvatar = signerMode === 'archived' && selectedArchived
    ? (selectedArchived.avatar || generateIdenticon(selectedArchived.commonName + (selectedArchived.email ?? '')))
    : (identity?.avatar || generateIdenticon((identity?.commonName ?? '') + (identity?.email ?? '')));
</script>

<svelte:head>
  <title>파일 서명 — KeyID</title>
</svelte:head>

<div class="px-4 md:px-6 pt-6 pb-24 w-full">
  <!-- Header -->
  <div class="flex items-center gap-3 mb-5">
    <button on:click={() => goto(base + '/files')} class="btn-icon">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <div>
      <h1 class="text-xl font-bold" style="color:var(--text)">파일 서명</h1>
      <p class="text-sm" style="color:var(--text-muted)">서명 / 서명+암호화 / 서명 요청</p>
    </div>
  </div>

  {#if done && signResult}
    <!-- ── Done ── -->
    <div class="panel max-w-lg mx-auto text-center space-y-4">
      <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <div>
        <div class="font-bold text-lg" style="color:var(--text)">{signResult.mode} 완료</div>
        <div class="text-sm mt-1" style="color:var(--text-muted)">{signResult.fileName}</div>
        <div class="text-xs mt-0.5" style="color:var(--text-dim)">→ {signResult.sigFile} 다운로드됨</div>
      </div>
      {#if signResult.mode === '서명'}
        <p class="text-sm" style="color:var(--text-muted)">서명 파일(.pkis-sig)과 원본 파일을 함께 상대방에게 전달하세요.</p>
      {:else if signResult.mode === '포함 서명'}
        <p class="text-sm" style="color:var(--text-muted)">서명 파일(.pkis-sig) 하나만 전달하세요. 원본이 내장되어 있습니다.</p>
      {/if}
      <div class="flex gap-3">
        <button on:click={reset} class="btn-secondary flex-1">다른 파일</button>
        <button on:click={() => goto(base + '/files')} class="btn-primary flex-1">파일 목록</button>
      </div>
    </div>

  {:else if cosignBuffer !== null}
    <!-- ── 공동 서명 대기 화면 ── -->
    <div class="max-w-lg mx-auto space-y-4">
      <!-- 상태 배너 -->
      <div class="panel flex items-center gap-3">
        <div class="w-5 h-5 rounded-full border-2 flex-shrink-0 animate-spin"
          style="border-color:var(--navy);border-top-color:transparent"></div>
        <div>
          <div class="text-sm font-medium" style="color:var(--text)">공동 서명 대기 중…</div>
          <div class="text-xs" style="color:var(--text-muted)">상대방이 서명하면 자동으로 완료됩니다.</div>
        </div>
      </div>

      <!-- QR 코드 -->
      <div class="panel text-center space-y-3">
        <h2 class="text-sm font-semibold" style="color:var(--text)">QR로 공유</h2>
        <p class="text-xs" style="color:var(--text-muted)">
          상대방이 QR을 스캔하거나 아래 파일을 받아 서명하세요.
        </p>
        <div class="flex justify-center">
          <QRCode data={currentCosignQRFrame} size={240} />
        </div>
        {#if cosignQrFrames.length > 1}
          <div class="text-xs" style="color:var(--text-dim)">
            프레임 {cosignQrFrameIndex + 1} / {cosignQrFrames.length} — 애니메이션 QR
          </div>
        {/if}
        <button on:click={() => {
          if (cosignBuffer && selectedFile) {
            const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
            downloadFile(cosignBuffer, `${baseName}.pkis-cosign`, 'application/octet-stream');
          }
        }} class="btn-secondary w-full">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          .pkis-cosign 파일로 공유
        </button>
      </div>

      <!-- 요청 내용 -->
      <div class="panel text-sm space-y-2">
        <div class="flex justify-between">
          <span style="color:var(--text-muted)">파일</span>
          <span class="font-medium truncate max-w-[60%]" style="color:var(--text)">{selectedFile?.name}</span>
        </div>
        {#if cosignMessage}
          <div class="flex justify-between">
            <span style="color:var(--text-muted)">메시지</span>
            <span class="truncate max-w-[60%]" style="color:var(--text)">{cosignMessage}</span>
          </div>
        {/if}
        <div class="flex justify-between">
          <span style="color:var(--text-muted)">요청 ID</span>
          <span class="text-xs font-mono" style="color:var(--text-dim)">{cosignRequestId.slice(0, 8)}…</span>
        </div>
      </div>

      {#if error}
        <div class="p-4 rounded-xl text-sm text-red-400 bg-red-500/10">{error}</div>
      {/if}

      <button on:click={reset} class="btn-secondary w-full">취소</button>
    </div>

  {:else if mode === 'request' && reqsignBuffer}
    <!-- ── 서명 요청 대기 화면 ── -->
    <div class="max-w-lg mx-auto space-y-4">

      <!-- 상태 배너 -->
      {#if receivedSigBuffer}
        <div class="panel text-center space-y-4">
          <div class="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <svg class="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <div class="font-bold" style="color:var(--text)">서명 수신 완료!</div>
          <p class="text-sm" style="color:var(--text-muted)">서명 파일을 다운로드하세요.</p>
          <button on:click={downloadReceivedSig} class="btn-primary w-full">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {receivedSigName} 다운로드
          </button>
          <button on:click={reset} class="btn-secondary w-full">처음으로</button>
        </div>
      {:else}
        <div class="panel flex items-center gap-3">
          <div class="w-5 h-5 rounded-full border-2 flex-shrink-0 animate-spin"
            style="border-color:var(--navy);border-top-color:transparent"></div>
          <div>
            <div class="text-sm font-medium" style="color:var(--text)">서명 대기 중…</div>
            <div class="text-xs" style="color:var(--text-muted)">상대방이 서명하면 자동으로 수신됩니다.</div>
          </div>
        </div>
      {/if}

      <!-- QR 코드 -->
      {#if !receivedSigBuffer}
        <div class="panel text-center space-y-3">
          <h2 class="text-sm font-semibold" style="color:var(--text)">QR로 공유</h2>
          <p class="text-xs" style="color:var(--text-muted)">
            상대방이 QR을 스캔하거나 아래 파일을 받아 서명할 수 있습니다.
          </p>
          <div class="flex justify-center">
            <QRCode data={currentQRFrame} size={240} />
          </div>
          {#if qrFrames.length > 1}
            <div class="text-xs" style="color:var(--text-dim)">
              프레임 {qrFrameIndex + 1} / {qrFrames.length} — 애니메이션 QR
            </div>
          {/if}
          <button on:click={downloadReqsign} class="btn-secondary w-full">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            .pkis-reqsign 파일로 공유
          </button>
        </div>
      {/if}

      <!-- 요청 내용 요약 -->
      <div class="panel text-sm space-y-2">
        <div class="flex justify-between">
          <span style="color:var(--text-muted)">파일</span>
          <span class="font-medium truncate max-w-[60%]" style="color:var(--text)">{selectedFile?.name}</span>
        </div>
        {#if message}
          <div class="flex justify-between">
            <span style="color:var(--text-muted)">메시지</span>
            <span class="truncate max-w-[60%]" style="color:var(--text)">{message}</span>
          </div>
        {/if}
        <div class="flex justify-between">
          <span style="color:var(--text-muted)">요청 ID</span>
          <span class="text-xs font-mono" style="color:var(--text-dim)">{requestId.slice(0, 8)}…</span>
        </div>
      </div>

      {#if !receivedSigBuffer}
        <button on:click={reset} class="btn-secondary w-full">취소</button>
      {/if}
    </div>

  {:else}
    <!-- ── Mode tabs ── -->
    <div class="flex gap-1 p-1 rounded-xl mb-3" style="background:var(--bg-panel);max-width:360px">
      {#each [['sign','서명만'],['sign-encrypt','서명+암호화'],['request','서명 요청']] as [m, label]}
        <button
          class="flex-1 py-2 rounded-lg text-sm font-medium transition"
          style={mode === m ? 'background:var(--navy);color:#fff' : 'color:var(--text-muted)'}
          on:click={() => { mode = m; reset(); mode = m; }}
        >{label}</button>
      {/each}
    </div>

    <!-- ── Signature type (detached vs embedded, only for sign mode) ── -->
    {#if mode === 'sign'}
      <div class="flex gap-2 mb-5" style="max-width:360px">
        <button
          class="flex-1 py-2 px-3 rounded-xl text-xs font-medium transition text-left"
          style={sigMode === 'detached'
            ? 'background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.4);color:#93c5fd'
            : 'background:var(--bg-panel);border:1px solid var(--border);color:var(--text-muted)'}
          on:click={() => (sigMode = 'detached')}
        >
          <div class="font-semibold">분리 서명 (p7s)</div>
          <div class="text-xs opacity-75 mt-0.5">서명+원본 파일 각각 전달</div>
        </button>
        <button
          class="flex-1 py-2 px-3 rounded-xl text-xs font-medium transition text-left"
          style={sigMode === 'embedded'
            ? 'background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.4);color:#93c5fd'
            : 'background:var(--bg-panel);border:1px solid var(--border);color:var(--text-muted)'}
          on:click={() => (sigMode = 'embedded')}
        >
          <div class="font-semibold">포함 서명 (p7m)</div>
          <div class="text-xs opacity-75 mt-0.5">원본 파일 내장, 서명만 전달</div>
        </button>
      </div>
    {/if}

    <!-- ── Two-column grid on desktop ── -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

      <!-- LEFT: file + message -->
      <div class="space-y-4">

        <!-- File picker -->
        <div class="panel">
          <h2 class="text-sm font-semibold mb-3" style="color:var(--text)">
            {mode === 'request' ? '서명 요청할 파일' : '서명할 파일'}
          </h2>
          {#if !selectedFile}
            <button
              class="w-full border-2 border-dashed rounded-xl py-10 px-6 text-center transition"
              style={dropActive ? 'border-color:var(--navy);background:rgba(29,110,245,0.08)' : 'border-color:var(--border-mid)'}
              on:dragover|preventDefault={() => (dropActive = true)}
              on:dragleave={() => (dropActive = false)}
              on:drop={handleDrop}
              on:click={() => fileInput.click()}
            >
              <svg class="w-10 h-10 mx-auto mb-3" style="color:var(--text-dim)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
              </svg>
              <div class="text-sm" style="color:var(--text-muted)">파일을 끌어다 놓거나 클릭하여 선택</div>
              <div class="text-xs mt-1" style="color:var(--text-dim)">모든 파일 형식 지원</div>
            </button>
            <input bind:this={fileInput} type="file" class="hidden"
              on:change={(e) => { const f = e.currentTarget.files?.[0]; if (f) selectedFile = f; }} />
          {:else}
            <div class="flex items-center gap-3 p-4 rounded-xl" style="background:rgba(59,130,246,0.12)">
              <svg class="w-8 h-8 flex-shrink-0" style="color:var(--navy-light)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate" style="color:var(--text)">{selectedFile.name}</div>
                <div class="text-xs" style="color:var(--text-muted)">{formatBytes(selectedFile.size)}</div>
              </div>
              <button on:click={() => (selectedFile = null)} class="btn-icon" style="color:var(--text-dim)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          {/if}
        </div>

        <!-- Message -->
        <div class="panel">
          <h2 class="text-sm font-semibold mb-2" style="color:var(--text)">
            {#if mode === 'request'}
              요청 메시지 <span class="font-normal text-xs" style="color:var(--text-dim)">(서명자에게 표시)</span>
            {:else}
              메시지 <span class="font-normal text-xs" style="color:var(--text-dim)">(선택, CMS ContentHint)</span>
            {/if}
          </h2>
          <textarea
            class="input w-full resize-none"
            rows="3"
            placeholder={mode === 'request' ? '서명을 요청하는 이유나 내용을 입력하세요' : '수신자에게 전달할 메시지 (파일 용도 설명 등)'}
            maxlength="256"
            bind:value={message}
          ></textarea>
          <div class="text-right text-xs mt-1" style="color:var(--text-dim)">{message.length}/256</div>
        </div>

        <!-- Recipients (sign+encrypt only) -->
        {#if mode === 'sign-encrypt'}
          <div class="panel">
            <h2 class="text-sm font-semibold mb-3" style="color:var(--text)">수신자 선택</h2>
            <label class="flex items-center gap-3 p-3 rounded-xl cursor-pointer mb-2" style="background:var(--bg-hover)">
              <input type="checkbox" bind:checked={includeSelf} class="w-4 h-4 accent-blue-500" />
              <img src={identity?.avatar || generateIdenticon((identity?.commonName ?? '') + (identity?.email ?? ''))}
                alt="" class="w-7 h-7 rounded-full object-cover" />
              <div class="flex-1">
                <div class="text-sm font-medium" style="color:var(--text)">{identity?.commonName ?? '나'} (나)</div>
              </div>
            </label>
            {#each contacts as c}
              <label class="flex items-center gap-3 p-3 rounded-xl cursor-pointer" style="background:var(--bg-hover)">
                <input type="checkbox"
                  checked={c.id !== undefined && recipients.has(c.id)}
                  on:change={() => toggleRecipient(c.id)}
                  class="w-4 h-4 accent-blue-500" />
                <img src={c.avatar || generateIdenticon(c.commonName + c.email)}
                  alt="" class="w-7 h-7 rounded-full object-cover" />
                <div class="flex-1">
                  <div class="text-sm font-medium" style="color:var(--text)">{c.commonName}</div>
                  <div class="text-xs" style="color:var(--text-muted)">{c.email}</div>
                </div>
              </label>
            {/each}
            {#if contacts.length === 0}
              <p class="text-xs text-center py-2" style="color:var(--text-dim)">연락처가 없습니다.</p>
            {/if}
          </div>
        {/if}

        <!-- 공동 서명자 (sign/sign-encrypt only) -->
        {#if mode !== 'request'}
          <div class="panel">
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" bind:checked={addCosigner} class="w-4 h-4 accent-blue-500" />
              <div>
                <div class="text-sm font-semibold" style="color:var(--text)">공동 서명자 추가</div>
                <div class="text-xs" style="color:var(--text-dim)">타인의 서명을 CMS에 함께 포함합니다</div>
              </div>
            </label>
            {#if addCosigner}
              <div class="mt-3 space-y-2">
                {#if contacts.length === 0}
                  <p class="text-xs text-center py-2" style="color:var(--text-dim)">연락처가 없습니다.</p>
                {:else}
                  {#each contacts as c}
                    <button
                      class="w-full flex items-center gap-3 p-3 rounded-xl transition text-left"
                      style={cosignerContactId === c.id
                        ? 'background:rgba(59,130,246,0.15);border:1px solid #3b82f6'
                        : 'background:var(--bg);border:1px solid var(--border-mid)'}
                      on:click={() => { cosignerContactId = c.id ?? null; }}
                    >
                      <img src={c.avatar || generateIdenticon(c.commonName + c.email)}
                        alt="" class="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium truncate" style="color:var(--text)">{c.commonName}</div>
                        <div class="text-xs" style="color:var(--text-muted)">{c.email}</div>
                      </div>
                      {#if cosignerContactId === c.id}
                        <div class="w-3 h-3 rounded-full flex-shrink-0" style="background:#3b82f6"></div>
                      {/if}
                    </button>
                  {/each}
                {/if}
                <textarea
                  class="input w-full resize-none text-sm"
                  rows="2"
                  placeholder="공동 서명자에게 보낼 메시지 (선택)"
                  maxlength="256"
                  bind:value={cosignMessage}
                ></textarea>
              </div>
            {/if}
          </div>
        {/if}

      </div>

      <!-- RIGHT: signer + unlock + action -->
      <div class="space-y-4">

        {#if mode === 'request'}
          <!-- 서명 요청 안내 -->
          <div class="panel space-y-3">
            <h2 class="text-sm font-semibold" style="color:var(--text)">서명 요청 방법</h2>
            <div class="text-xs space-y-2" style="color:var(--text-muted)">
              <div class="flex gap-2">
                <span class="font-bold" style="color:var(--navy)">1.</span>
                <span>파일과 메시지를 입력하고 <strong>요청 생성</strong>을 누르세요.</span>
              </div>
              <div class="flex gap-2">
                <span class="font-bold" style="color:var(--navy)">2.</span>
                <span>생성된 QR을 상대방이 스캔하거나, <code>.pkis-reqsign</code> 파일을 공유하세요.</span>
              </div>
              <div class="flex gap-2">
                <span class="font-bold" style="color:var(--navy)">3.</span>
                <span>상대방이 서명하면 자동으로 수신됩니다.</span>
              </div>
            </div>
            <div class="p-3 rounded-xl text-xs" style="background:rgba(59,130,246,0.08);color:var(--text-muted)">
              <span style="color:var(--navy)">●</span>
              요청자 본인 서명 없이 상대방의 서명만 받을 때 사용합니다.
            </div>
          </div>

          {#if error}
            <div class="p-4 rounded-xl text-sm text-red-400 bg-red-500/10">{error}</div>
          {/if}

          <button class="btn-primary w-full" disabled={!selectedFile || signing} on:click={doCreateRequest}>
            {#if signing}
              <div class="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
              처리 중…
            {:else}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
              </svg>
              서명 요청 생성 및 QR 표시
            {/if}
          </button>

        {:else}
          <!-- Signer selection -->
          <div class="panel">
            <h2 class="text-sm font-semibold mb-3" style="color:var(--text)">서명자</h2>
            <div class="space-y-2">
              <!-- Current -->
              <button
                class="w-full flex items-center gap-3 p-3 rounded-xl transition text-left"
                style={signerMode === 'current'
                  ? 'background:rgba(59,130,246,0.15);border:1px solid #3b82f6'
                  : 'background:var(--bg);border:1px solid var(--border-mid)'}
                on:click={() => { signerMode = 'current'; selectedArchivedId = null; }}
              >
                <img src={identity?.avatar || generateIdenticon((identity?.commonName ?? '') + (identity?.email ?? ''))}
                  alt="" class="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate" style="color:var(--text)">{identity?.commonName}</div>
                  <div class="text-xs" style="color:var(--text-muted)">현재 신원 (활성)</div>
                </div>
                {#if signerMode === 'current'}
                  <div class="w-3 h-3 rounded-full flex-shrink-0" style="background:#3b82f6"></div>
                {/if}
              </button>

              {#each archivedIdentities as arch}
                <button
                  class="w-full flex items-center gap-3 p-3 rounded-xl transition text-left"
                  style={signerMode === 'archived' && selectedArchivedId === arch.id
                    ? 'background:rgba(245,158,11,0.15);border:1px solid #f59e0b'
                    : 'background:var(--bg);border:1px solid var(--border-mid)'}
                  on:click={() => { signerMode = 'archived'; selectedArchivedId = arch.id ?? null; }}
                >
                  <img src={arch.avatar || generateIdenticon(arch.commonName + (arch.email ?? ''))}
                    alt="" class="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium truncate" style="color:var(--text)">{arch.commonName}</div>
                    <div class="text-xs" style="color:var(--text-muted)">
                      폐지됨 · {new Date(arch.revokedAt).toLocaleDateString('ko-KR')}
                    </div>
                  </div>
                  {#if signerMode === 'archived' && selectedArchivedId === arch.id}
                    <div class="w-3 h-3 rounded-full flex-shrink-0" style="background:#f59e0b"></div>
                  {/if}
                </button>
              {/each}
            </div>
          </div>

          <!-- Key unlock -->
          <div class="panel">
            <h2 class="text-sm font-semibold mb-3" style="color:var(--text)">키 잠금 해제</h2>

            {#if showMethodToggle && signerMode === 'current'}
              <div class="flex gap-2 p-1 rounded-xl mb-3" style="background:var(--bg)">
                {#each [['biometric','지문'],['password','비밀번호']] as [m, label]}
                  <button
                    class="flex-1 py-2 rounded-lg text-sm font-medium transition"
                    style={unlockMethod === m ? 'background:var(--navy);color:#fff' : 'color:var(--text-muted)'}
                    on:click={() => { unlockMethod = m; }}
                  >{label}</button>
                {/each}
              </div>
            {/if}

            {#if signerMode === 'archived'}
              <div class="p-3 rounded-xl text-sm mb-2" style="background:rgba(245,158,11,0.1);color:#fbbf24">
                ⚠️ 보관된 신원은 백업 비밀번호로만 서명합니다.
              </div>
              <input class="input" type="password" placeholder="백업 비밀번호" bind:value={archivedPassword} />
            {:else if unlockMethod === 'password' || identity?.sealedKey.method === 'password'}
              <input class="input" type="password" placeholder="개인 키 비밀번호" bind:value={password}
                on:keydown={(e) => e.key === 'Enter' && selectedFile && doSign()} />
            {:else}
              <div class="flex items-center gap-3 p-3 rounded-xl text-sm" style="background:rgba(59,130,246,0.1);color:#60a5fa">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/>
                </svg>
                버튼을 누르면 지문 인증을 요청합니다
              </div>
            {/if}
          </div>

          {#if error}
            <div class="p-4 rounded-xl text-sm text-red-400 bg-red-500/10">{error}</div>
          {/if}

          <button class="btn-primary w-full" disabled={!selectedFile || signing} on:click={doSign}>
            {#if signing}
              <div class="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
              {unlockMethod === 'biometric' && signerMode === 'current' ? '지문 인증 중…' : '처리 중…'}
            {:else}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
              {#if addCosigner && cosignerContactId !== null}
                {mode === 'sign' ? '서명 후 공동서명 요청' : '서명+암호화 후 공동서명 요청'}
              {:else}
                {mode === 'sign' ? '서명하기' : '서명+암호화하기'}
              {/if}
            {/if}
          </button>
        {/if}

      </div>
    </div>
  {/if}
</div>

{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}
