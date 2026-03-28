<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { loadIdentity, type IdentityRecord } from '$lib/storage/keystore';
  import { unsealKey } from '$lib/crypto/protection';
  import { importPrivateKeyPkcs8 } from '$lib/crypto/keygen';
  import { addCountersignature } from '$lib/crypto/countersign';
  import { signData, createCoSignerInfo, unpackPkisFile, packPkisFile } from '$lib/crypto/cms';
  import { downloadFile, retrieveLaunchedFile } from '$lib/fileHandler';
  import { supabase } from '$lib/supabase';

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

  // Parsed request info
  let fileType: 'pkis-req' | 'pkis-reqsign' | 'pkis-cosign' | null = null;
  let reqMeta: { requesterName?: string; purpose?: string; callbackUrl?: string } = {};
  // For reqsign type
  let reqsignInfo: { filename?: string; message?: string; requestId?: string; requesterName?: string } = {};
  // For cosign type
  let cosignInfo: { filename?: string; message?: string; requestId?: string; requesterName?: string } = {};

  function getCertDer(b64: string): ArrayBuffer {
    const bin = atob(b64);
    return Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
  }

  function extractCN(certDerB64: string): string {
    try {
      // Parse minimal: find CN in subject by looking for common name OID bytes
      // We use pkijs inline here to avoid extra import complexity
      // Simple approach: base64 decode and search for UTF8/PrintableString after CN OID
      const der = getCertDer(certDerB64);
      // OID for commonName: 55 04 03
      const bytes = new Uint8Array(der);
      for (let i = 0; i < bytes.length - 3; i++) {
        if (bytes[i] === 0x55 && bytes[i+1] === 0x04 && bytes[i+2] === 0x03) {
          // Next: SET or SEQUENCE wrapper — skip to value
          let j = i + 3;
          // skip tag + length of the value (PrintableString or UTF8String)
          if (j < bytes.length) {
            j++; // skip tag (0x13 PrintableString or 0x0c UTF8String)
            // read length
            const len = bytes[j++];
            return new TextDecoder().decode(bytes.slice(j, j + len));
          }
        }
      }
    } catch { /* ignore */ }
    return '알 수 없음';
  }

  async function parseRequestFile(file: File) {
    fileType = null;
    reqMeta = {};
    reqsignInfo = {};
    cosignInfo = {};

    if (file.name.endsWith('.pkis-reqsign')) {
      try {
        const buf = await file.arrayBuffer();
        const parsed = unpackPkisFile(buf);
        if (parsed.type === 'reqsign') {
          fileType = 'pkis-reqsign';
          reqsignInfo = {
            filename: parsed.filename,
            message: parsed.message,
            requestId: parsed.requestId,
            requesterName: parsed.requesterCert ? extractCN(parsed.requesterCert) : undefined
          };
        } else {
          error = '유효하지 않은 서명 요청 파일입니다.';
        }
      } catch (e) {
        error = '파일을 읽을 수 없습니다: ' + (e instanceof Error ? e.message : String(e));
      }
    } else if (file.name.endsWith('.pkis-cosign')) {
      try {
        const buf = await file.arrayBuffer();
        const parsed = unpackPkisFile(buf);
        if (parsed.type === 'cosign') {
          fileType = 'pkis-cosign';
          cosignInfo = {
            filename: parsed.filename,
            message: parsed.message,
            requestId: parsed.requestId,
            requesterName: parsed.requesterCert ? extractCN(parsed.requesterCert) : undefined
          };
        } else {
          error = '유효하지 않은 공동 서명 요청 파일입니다.';
        }
      } catch (e) {
        error = '파일을 읽을 수 없습니다: ' + (e instanceof Error ? e.message : String(e));
      }
    } else {
      // Legacy .pkis-req (countersignature request)
      fileType = 'pkis-req';
    }
  }

  $: if (requestFile) parseRequestFile(requestFile);

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

  function arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  // Sign a .pkis-reqsign request and publish via Supabase
  async function signReqsign() {
    if (!requestFile || !identity) return;
    error = '';
    signing = true;
    try {
      const pkcs8 = await unsealKey({
        sealed: identity.sealedKey,
        password: identity.sealedKey.method === 'password' ? password : undefined
      });
      const privateKey = await importPrivateKeyPkcs8(pkcs8);
      const certDer = getCertDer(identity.certDer);

      const buf = await requestFile.arrayBuffer();
      const parsed = unpackPkisFile(buf);
      const fileData = parsed.payload;
      const msg = parsed.message;

      // Sign the file
      const result = await signData(fileData, privateKey, certDer, msg);
      const packed = packPkisFile('signed', result.der, parsed.filename, parsed.mimeType, msg);

      // Download locally
      const baseName = (parsed.filename ?? requestFile.name).replace(/\.[^.]+$/, '');
      downloadFile(packed, `${baseName}.pkis-sig`, 'application/pkis-sig');

      // Send via Supabase Broadcast
      if (parsed.requestId) {
        const channel = supabase.channel('reqsign-' + parsed.requestId);
        await new Promise<void>((resolve) => {
          channel.subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              channel.send({
                type: 'broadcast',
                event: 'signed',
                payload: { sig: arrayBufferToBase64(packed) }
              });
              // brief delay then cleanup
              setTimeout(() => { supabase.removeChannel(channel); resolve(); }, 800);
            }
          });
        });
        showToast('서명이 완료되고 요청자에게 전송되었습니다.', 'success');
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

  // Sign a legacy .pkis-req (countersignature)
  async function signLegacy() {
    if (!requestFile || !identity) return;
    error = '';
    signing = true;
    try {
      const pkcs8 = await unsealKey({
        sealed: identity.sealedKey,
        password: identity.sealedKey.method === 'password' ? password : undefined
      });
      const privateKey = await importPrivateKeyPkcs8(pkcs8);
      const certDer = getCertDer(identity.certDer);

      const reqData = await requestFile.arrayBuffer();
      const csResult = await addCountersignature(reqData, privateKey, certDer);

      const baseName = requestFile.name.replace(/\.pkis-req$/, '');
      downloadFile(csResult.der, `${baseName}.pkis-sig`, 'application/pkis-sig');

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

  // Sign a .pkis-cosign request and publish co-signer info via Supabase
  async function signCosign() {
    if (!requestFile || !identity) return;
    error = '';
    signing = true;
    try {
      const pkcs8 = await unsealKey({
        sealed: identity.sealedKey,
        password: identity.sealedKey.method === 'password' ? password : undefined
      });
      const privateKey = await importPrivateKeyPkcs8(pkcs8);
      const certDer = getCertDer(identity.certDer);

      const buf = await requestFile.arrayBuffer();
      const parsed = unpackPkisFile(buf);
      const fileData = parsed.payload;
      const msg = parsed.message;

      const { signerInfoDer, certDer: myCertDer } = await createCoSignerInfo(fileData, privateKey, certDer, msg);

      if (parsed.requestId) {
        const channel = supabase.channel('cosign-' + parsed.requestId);
        await new Promise<void>((resolve) => {
          channel.subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              const toB64 = (buf: ArrayBuffer) => {
                const bytes = new Uint8Array(buf);
                let bin = '';
                for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
                return btoa(bin);
              };
              channel.send({
                type: 'broadcast',
                event: 'cosigned',
                payload: {
                  signerInfo: toB64(signerInfoDer),
                  cert: toB64(myCertDer)
                }
              });
              setTimeout(() => { supabase.removeChannel(channel); resolve(); }, 800);
            }
          });
        });
        showToast('공동 서명이 완료되어 요청자에게 전송되었습니다.', 'success');
      } else {
        showToast('공동 서명이 완료되었습니다.', 'success');
      }
      done = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      signing = false;
    }
  }

  function sign() {
    if (fileType === 'pkis-reqsign') signReqsign();
    else if (fileType === 'pkis-cosign') signCosign();
    else signLegacy();
  }

  function reset() {
    requestFile = null;
    password = '';
    done = false;
    error = '';
    reqMeta = {};
    reqsignInfo = {};
    cosignInfo = {};
    fileType = null;
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
      <h1 class="text-xl font-bold" style="color:var(--text)">서명 요청</h1>
      <p class="text-sm" style="color:var(--text-muted)">외부에서 온 서명 요청 처리</p>
    </div>
  </div>

  {#if done}
    <div class="panel text-center space-y-4">
      <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <div class="font-bold text-lg" style="color:var(--text)">서명 완료</div>
      <p class="text-sm" style="color:var(--text-muted)">서명 파일이 다운로드되었습니다.</p>
      {#if fileType === 'pkis-reqsign' && reqsignInfo.requestId}
        <p class="text-xs" style="color:var(--text-dim)">요청자에게 실시간으로 전달되었습니다.</p>
      {/if}
      {#if fileType === 'pkis-cosign' && cosignInfo.requestId}
        <p class="text-xs" style="color:var(--text-dim)">공동 서명이 요청자의 CMS에 추가되었습니다.</p>
      {/if}
      <div class="flex gap-3">
        <button on:click={reset} class="btn-secondary flex-1">다른 요청 처리</button>
        <button on:click={() => goto(base + '/')} class="btn-primary flex-1">홈으로</button>
      </div>
    </div>

  {:else}
    <!-- Request file -->
    <div class="panel mb-4">
      <h2 class="text-sm font-semibold mb-3" style="color:var(--text)">서명 요청 파일</h2>
      {#if !requestFile}
        <button
          class="w-full border-2 border-dashed rounded-xl py-8 px-6 text-center transition"
          style="border-color:var(--border-mid)"
          on:click={() => {
            const i = document.createElement('input');
            i.type = 'file';
            i.accept = '.pkis-req,.pkis-reqsign,.pkis-cosign';
            i.onchange = () => { if (i.files?.[0]) requestFile = i.files[0]; };
            i.click();
          }}
        >
          <svg class="w-10 h-10 mx-auto mb-2" style="color:var(--text-dim)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div class="text-sm" style="color:var(--text-muted)">.pkis-reqsign, .pkis-cosign 또는 .pkis-req 파일 선택</div>
          <div class="text-xs mt-1" style="color:var(--text-dim)">또는 QR 코드로 스캔하세요</div>
        </button>
      {:else}
        <div class="flex items-center gap-3 p-4 rounded-xl mb-3" style="background:rgba(245,158,11,0.1)">
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate" style="color:var(--text)">{requestFile.name}</div>
            <div class="text-xs" style="color:var(--text-muted)">{formatBytes(requestFile.size)}</div>
          </div>
          <button on:click={() => (requestFile = null)} class="btn-icon" style="color:var(--text-dim)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- reqsign 요청 정보 -->
        {#if fileType === 'pkis-reqsign'}
          <div class="p-4 rounded-xl space-y-2 mb-3" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2)">
            <div class="text-sm font-semibold" style="color:var(--text)">서명 요청 내용</div>
            {#if reqsignInfo.requesterName}
              <div class="flex gap-2 text-sm">
                <span style="color:var(--text-muted)">요청자:</span>
                <span style="color:var(--text)">{reqsignInfo.requesterName}</span>
              </div>
            {/if}
            {#if reqsignInfo.filename}
              <div class="flex gap-2 text-sm">
                <span style="color:var(--text-muted)">파일:</span>
                <span class="truncate" style="color:var(--text)">{reqsignInfo.filename}</span>
              </div>
            {/if}
            {#if reqsignInfo.message}
              <div class="flex gap-2 text-sm">
                <span style="color:var(--text-muted)">메시지:</span>
                <span style="color:var(--text)">{reqsignInfo.message}</span>
              </div>
            {/if}
          </div>
        {/if}

        <!-- cosign 요청 정보 -->
        {#if fileType === 'pkis-cosign'}
          <div class="p-4 rounded-xl space-y-2 mb-3" style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2)">
            <div class="text-sm font-semibold" style="color:var(--text)">공동 서명 요청</div>
            {#if cosignInfo.requesterName}
              <div class="flex gap-2 text-sm">
                <span style="color:var(--text-muted)">요청자:</span>
                <span style="color:var(--text)">{cosignInfo.requesterName}</span>
              </div>
            {/if}
            {#if cosignInfo.filename}
              <div class="flex gap-2 text-sm">
                <span style="color:var(--text-muted)">파일:</span>
                <span class="truncate" style="color:var(--text)">{cosignInfo.filename}</span>
              </div>
            {/if}
            {#if cosignInfo.message}
              <div class="flex gap-2 text-sm">
                <span style="color:var(--text-muted)">메시지:</span>
                <span style="color:var(--text)">{cosignInfo.message}</span>
              </div>
            {/if}
            <div class="text-xs mt-1" style="color:var(--text-dim)">
              서명하면 요청자의 CMS에 내 서명이 추가됩니다.
            </div>
          </div>
        {/if}

        <!-- Warning -->
        <div class="p-4 rounded-xl" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2)">
          <div class="flex gap-2">
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5" style="color:#f59e0b" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <div class="text-sm font-semibold" style="color:var(--text)">서명 전 확인하세요</div>
              <div class="text-xs mt-0.5" style="color:var(--text-muted)">
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
      <div class="p-4 rounded-xl text-sm mb-4" style="background:rgba(239,68,68,0.1);color:#f87171">{error}</div>
    {/if}

    <button
      class="btn-primary w-full"
      disabled={!requestFile || signing || !fileType}
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
