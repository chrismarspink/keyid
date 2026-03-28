<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import {
    loadSettings, saveSettings, type AppSettings,
    getAllCACerts, addCACert, deleteCACert, type CACertRecord,
    getAllApprovalChains, saveApprovalChain, updateApprovalChain, deleteApprovalChain,
    type ApprovalChain, type ApprovalStep
  } from '$lib/storage/keystore';
  import { loadIdentity, type IdentityRecord } from '$lib/storage/keystore';
  import { getAllContacts, type Contact } from '$lib/storage/contacts';
  import { parseCertificate, certDerToPem } from '$lib/crypto/cert';
  import { generateCSR } from '$lib/crypto/csr';
  import { generateKeyPair, exportPrivateKeyPkcs8 } from '$lib/crypto/keygen';
  import { unsealKey } from '$lib/crypto/protection';

  let settings: AppSettings = { algorithm: 'ecdsa-p256', validityYears: 3, defaultCountry: 'KR' };
  let caCerts: CACertRecord[] = [];
  let identity: IdentityRecord | null = null;
  let contacts: Contact[] = [];
  let loading = true;

  // Approval chains (결제 라인)
  let approvalChains: ApprovalChain[] = [];
  let showChainEditor = false;
  let editingChain: ApprovalChain | null = null;
  let chainName = '';
  let chainSteps: ApprovalStep[] = [];
  let chainError = '';

  // CA cert upload
  let caFileInput: HTMLInputElement;
  let caImportError = '';

  // CSR
  let showCSRDialog = false;
  let csrMode: 'current-key' | 'new-key' = 'current-key';
  let csrPassword = '';
  let csrResult = '';
  let csrDerBlob: Blob | null = null;
  let generatingCSR = false;
  let csrError = '';

  // Toast
  let toast = { visible: false, msg: '', type: 'info' as 'success' | 'error' | 'info' };
  function showToast(msg: string, type: typeof toast.type = 'info') {
    toast = { visible: true, msg, type };
    setTimeout(() => (toast = { ...toast, visible: false }), 3200);
  }

  onMount(async () => {
    [settings, caCerts, identity, approvalChains, contacts] = await Promise.all([
      loadSettings(),
      getAllCACerts(),
      loadIdentity(),
      getAllApprovalChains(),
      getAllContacts()
    ]);
    loading = false;
  });

  async function saveSettingsAndToast() {
    await saveSettings(settings);
    showToast('설정이 저장되었습니다.', 'success');
  }

  // ─── CA cert import ───────────────────────────────────────────────────────

  async function importCACert(file: File) {
    caImportError = '';
    try {
      const buf = await file.arrayBuffer();
      let derBuf: ArrayBuffer;

      // Detect PEM vs DER
      const text = new TextDecoder().decode(buf.slice(0, 64));
      if (text.startsWith('-----BEGIN')) {
        const pem = new TextDecoder().decode(buf);
        const b64 = pem
          .replace(/-----BEGIN CERTIFICATE-----/, '')
          .replace(/-----END CERTIFICATE-----/, '')
          .replace(/\s+/g, '');
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        derBuf = bytes.buffer;
      } else {
        derBuf = buf;
      }

      const parsed = await parseCertificate(derBuf);
      const certB64 = btoa(
        Array.from(new Uint8Array(derBuf), (b) => String.fromCharCode(b)).join('')
      );
      const pem = certDerToPem(derBuf);

      await addCACert({
        name: parsed.commonName || file.name,
        certDer: certB64,
        fingerprint: parsed.fingerprint,
        notBefore: parsed.notBefore,
        notAfter: parsed.notAfter,
        pem,
        addedAt: new Date().toISOString()
      });
      caCerts = await getAllCACerts();
      showToast('CA 인증서를 등록했습니다.', 'success');
    } catch (e) {
      caImportError = 'CA 인증서 가져오기 실패: ' + String(e);
    }
  }

  async function removeCACert(id: number) {
    await deleteCACert(id);
    caCerts = await getAllCACerts();
    showToast('CA 인증서를 삭제했습니다.', 'info');
  }

  // ─── CSR generation ───────────────────────────────────────────────────────

  async function generateCSRFromCurrent() {
    if (!identity) return;
    csrError = '';
    generatingCSR = true;
    try {
      let pkcs8: ArrayBuffer;
      if (csrMode === 'current-key') {
        pkcs8 = await unsealKey({
          sealed: identity.sealedKey,
          passwordBackup: identity.passwordBackup ?? undefined,
          password: csrPassword || undefined,
          preferPassword: !!csrPassword
        });
      } else {
        // New key pair
        const kp = await generateKeyPair();
        pkcs8 = await exportPrivateKeyPkcs8(kp.privateKey);
        // Use the new key pair directly for CSR
        const result = await generateCSR(kp, {
          commonName: identity.commonName,
          organization: identity.organization || undefined,
          country: identity.country || undefined,
          email: identity.email || undefined
        });
        csrResult = result.csrPem;
        csrDerBlob = new Blob([result.csrDer], { type: 'application/pkcs10' });
        showCSRDialog = true;
        return;
      }

      // Import the private key back to CryptoKey
      const privateKey = await window.crypto.subtle.importKey(
        'pkcs8',
        pkcs8,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
      );
      const spkiBuf = await window.crypto.subtle.exportKey('spki', (await window.crypto.subtle.importKey(
        'pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']
      )));
      const publicKey = await window.crypto.subtle.importKey(
        'spki', spkiBuf, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']
      );

      const result = await generateCSR(
        { privateKey, publicKey },
        {
          commonName: identity.commonName,
          organization: identity.organization || undefined,
          country: identity.country || undefined,
          email: identity.email || undefined
        }
      );
      csrResult = result.csrPem;
      csrDerBlob = new Blob([result.csrDer], { type: 'application/pkcs10' });
    } catch (e) {
      csrError = e instanceof Error ? e.message : String(e);
    } finally {
      generatingCSR = false;
    }
  }

  function downloadCSR() {
    if (!csrDerBlob || !identity) return;
    const url = URL.createObjectURL(csrDerBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${identity.commonName.replace(/\s+/g, '_')}.csr`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function copyCSR() {
    navigator.clipboard.writeText(csrResult).then(() => showToast('클립보드에 복사됨', 'success'));
  }

  function notAfterDate(d: string) { return d ? new Date(d).toLocaleDateString('ko-KR') : ''; }
  function isExpired(d: string) { return d ? new Date(d) < new Date() : false; }

  function handleCaFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) importCACert(file);
    input.value = '';
  }

  // ─── Approval chain editor ────────────────────────────────────────────────

  function openNewChain() {
    editingChain = null;
    chainName = '';
    chainSteps = [];
    chainError = '';
    showChainEditor = true;
  }

  function openEditChain(chain: ApprovalChain) {
    editingChain = chain;
    chainName = chain.name;
    chainSteps = [...chain.steps];
    chainError = '';
    showChainEditor = true;
  }

  function addChainStep(contactId: number) {
    const c = contacts.find(x => x.id === contactId);
    if (!c || !c.id) return;
    if (chainSteps.some(s => s.contactId === contactId)) return; // no duplicates
    chainSteps = [...chainSteps, { contactId: c.id, name: c.commonName, fingerprint: c.fingerprint }];
  }

  function removeChainStep(idx: number) {
    chainSteps = chainSteps.filter((_, i) => i !== idx);
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= chainSteps.length) return;
    const arr = [...chainSteps];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    chainSteps = arr;
  }

  async function saveChain() {
    if (!chainName.trim()) { chainError = '이름을 입력하세요.'; return; }
    if (chainSteps.length < 2) { chainError = '결제자를 2명 이상 추가하세요.'; return; }
    const record = { name: chainName.trim(), steps: chainSteps, createdAt: new Date().toISOString() };
    if (editingChain?.id != null) {
      await updateApprovalChain({ ...record, id: editingChain.id });
    } else {
      await saveApprovalChain(record);
    }
    approvalChains = await getAllApprovalChains();
    showChainEditor = false;
    showToast('결제 라인이 저장되었습니다.', 'success');
  }

  async function removeChain(id: number) {
    await deleteApprovalChain(id);
    approvalChains = await getAllApprovalChains();
    showToast('결제 라인이 삭제되었습니다.', 'info');
  }
</script>

<svelte:head>
  <title>설정 — KeyID</title>
</svelte:head>

<div class="px-4 pt-6 pb-24 max-w-2xl mx-auto">
  <h1 class="text-xl font-bold text-slate-800 mb-6">설정</h1>

  {#if loading}
    <div class="flex justify-center py-12">
      <div class="w-8 h-8 rounded-full border-2 border-navy-600 border-t-transparent animate-spin"></div>
    </div>
  {:else}

  <!-- ── Certificate Defaults ─────────────────────────────────────── -->
  <section class="panel mb-4">
    <h2 class="font-semibold text-slate-700 mb-4">인증서 기본값</h2>

    <div class="space-y-4">
      <!-- Algorithm -->
      <div>
        <label class="block text-sm text-gray-500 mb-1.5">서명 알고리즘</label>
        <div class="flex gap-2">
          <button
            class="flex-1 py-2.5 rounded-xl border text-sm font-medium transition"
            class:border-navy-600={settings.algorithm === 'ecdsa-p256'}
            class:bg-navy-50={settings.algorithm === 'ecdsa-p256'}
            class:text-navy-700={settings.algorithm === 'ecdsa-p256'}
            class:border-gray-200={settings.algorithm !== 'ecdsa-p256'}
            class:text-gray-500={settings.algorithm !== 'ecdsa-p256'}
            on:click={() => { settings.algorithm = 'ecdsa-p256'; saveSettingsAndToast(); }}
          >
            ECDSA P-256
            <span class="ml-1 text-xs text-green-600">(권장)</span>
          </button>
          <button
            class="flex-1 py-2.5 rounded-xl border text-sm font-medium transition border-gray-200 text-gray-400 cursor-not-allowed"
            title="RSA-2048는 향후 지원 예정"
            disabled
          >
            RSA-2048
            <span class="ml-1 text-xs text-gray-400">(준비 중)</span>
          </button>
        </div>
        <p class="text-xs text-gray-400 mt-1.5">
          ECDSA P-256: 키 길이 256비트, 빠른 서명, 작은 서명 크기. WebAuthn 호환.
        </p>
      </div>

      <!-- Validity -->
      <div>
        <label class="block text-sm text-gray-500 mb-1.5">기본 유효기간</label>
        <div class="flex gap-2">
          {#each [1, 2, 3, 5] as yr}
            <button
              class="flex-1 py-2.5 rounded-xl border text-sm font-medium transition"
              class:border-navy-600={settings.validityYears === yr}
              class:bg-navy-50={settings.validityYears === yr}
              class:text-navy-700={settings.validityYears === yr}
              class:border-gray-200={settings.validityYears !== yr}
              class:text-gray-500={settings.validityYears !== yr}
              on:click={() => { settings.validityYears = yr; saveSettingsAndToast(); }}
            >{yr}년</button>
          {/each}
        </div>
      </div>

      <!-- Country -->
      <div>
        <label class="block text-sm text-gray-500 mb-1.5">기본 국가 코드</label>
        <input
          class="input"
          maxlength="2"
          placeholder="예: KR, US, JP"
          bind:value={settings.defaultCountry}
          on:change={saveSettingsAndToast}
          style="text-transform:uppercase"
        />
        <p class="text-xs text-gray-400 mt-1">ISO 3166-1 Alpha-2 코드 (2자리)</p>
      </div>
    </div>
  </section>

  <!-- ── CSR Generation ───────────────────────────────────────────── -->
  <section class="panel mb-4">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="font-semibold text-slate-700">인증서 신청서 (CSR)</h2>
        <p class="text-xs text-gray-400 mt-0.5">CA에 제출할 PKCS#10 CSR 생성</p>
      </div>
    </div>

    {#if !identity}
      <div class="text-sm text-gray-400 text-center py-4">
        신원 인증서가 없습니다.
        <a href="{base}/" class="text-navy-600 underline">신원 생성하기</a>
      </div>
    {:else}
      <div class="space-y-3">
        <div>
          <label class="block text-sm text-gray-500 mb-1.5">CSR 키</label>
          <div class="flex gap-2">
            <button
              class="flex-1 py-2.5 rounded-xl border text-sm font-medium transition"
              class:border-navy-600={csrMode === 'current-key'}
              class:bg-navy-50={csrMode === 'current-key'}
              class:text-navy-700={csrMode === 'current-key'}
              class:border-gray-200={csrMode !== 'current-key'}
              class:text-gray-500={csrMode !== 'current-key'}
              on:click={() => (csrMode = 'current-key')}
            >현재 키 사용</button>
            <button
              class="flex-1 py-2.5 rounded-xl border text-sm font-medium transition"
              class:border-navy-600={csrMode === 'new-key'}
              class:bg-navy-50={csrMode === 'new-key'}
              class:text-navy-700={csrMode === 'new-key'}
              class:border-gray-200={csrMode !== 'new-key'}
              class:text-gray-500={csrMode !== 'new-key'}
              on:click={() => (csrMode = 'new-key')}
            >새 키 생성</button>
          </div>
        </div>

        {#if csrMode === 'current-key' && identity.sealedKey.method === 'password'}
          <div>
            <label class="block text-sm text-gray-500 mb-1">키 비밀번호</label>
            <input class="input" type="password" placeholder="비밀번호" bind:value={csrPassword} />
          </div>
        {:else if csrMode === 'current-key' && identity.sealedKey.method === 'webauthn'}
          <p class="text-xs text-gray-400">생체인증으로 키를 잠금 해제합니다.</p>
          {#if identity.passwordBackup}
            <div>
              <label class="block text-sm text-gray-500 mb-1">백업 비밀번호 (선택)</label>
              <input class="input" type="password" placeholder="백업 비밀번호" bind:value={csrPassword} />
            </div>
          {/if}
        {/if}

        {#if csrError}
          <p class="text-sm text-red-500">{csrError}</p>
        {/if}

        <button
          class="btn-primary w-full"
          on:click={generateCSRFromCurrent}
          disabled={generatingCSR}
        >
          {generatingCSR ? 'CSR 생성 중…' : 'CSR 생성'}
        </button>

        {#if csrResult}
          <div class="rounded-xl bg-gray-50 border border-gray-200 p-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium text-gray-600">PKCS#10 CSR</span>
              <div class="flex gap-2">
                <button class="text-xs text-navy-600 hover:underline" on:click={copyCSR}>복사</button>
                <button class="text-xs text-navy-600 hover:underline" on:click={downloadCSR}>다운로드</button>
              </div>
            </div>
            <pre class="text-xs text-gray-500 overflow-x-auto whitespace-pre-wrap break-all">{csrResult}</pre>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- ── CA Certificates ─────────────────────────────────────────── -->
  <section class="panel mb-4">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="font-semibold text-slate-700">CA 인증서</h2>
        <p class="text-xs text-gray-400 mt-0.5">신뢰할 CA 인증서 등록</p>
      </div>
      <button class="btn-primary text-sm py-2" on:click={() => caFileInput.click()}>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        추가
      </button>
    </div>

    <input
      bind:this={caFileInput}
      type="file"
      accept=".pem,.cer,.crt,.der"
      class="hidden"
      on:change={handleCaFileChange}
    />

    {#if caImportError}
      <p class="text-sm text-red-500 mb-3">{caImportError}</p>
    {/if}

    {#if caCerts.length === 0}
      <div class="text-center py-8 text-gray-400 text-sm">
        등록된 CA 인증서가 없습니다.<br/>
        <span class="text-xs">.pem, .cer, .crt, .der 파일을 가져오세요.</span>
      </div>
    {:else}
      <div class="space-y-2">
        {#each caCerts as ca}
          {@const expired = isExpired(ca.notAfter)}
          <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <div class="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <svg class="w-5 h-5 text-navy-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-slate-700 truncate">{ca.name}</div>
              <div class="text-xs text-gray-400">
                만료: <span class:text-red-500={expired}>{notAfterDate(ca.notAfter)}</span>
                {#if expired}<span class="text-red-500 ml-1">(만료됨)</span>{/if}
              </div>
            </div>
            <button
              class="text-gray-300 hover:text-red-500 transition"
              on:click={() => ca.id !== undefined && removeCACert(ca.id)}
              title="삭제"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- ── Approval Chains (결제 라인) ──────────────────────────────────── -->
  <section class="panel mb-4">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="font-semibold text-slate-700">결제 라인</h2>
        <p class="text-xs text-gray-400 mt-0.5">순서 지정 다중 서명 (결재/승인 체인)</p>
      </div>
      <button class="btn-primary text-sm py-2" on:click={openNewChain} disabled={contacts.length === 0}>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        추가
      </button>
    </div>

    {#if contacts.length === 0}
      <p class="text-xs text-center text-gray-400 py-4">
        결제 라인을 만들려면 먼저 연락처를 추가하세요.
      </p>
    {:else if approvalChains.length === 0}
      <p class="text-xs text-center text-gray-400 py-4">등록된 결제 라인이 없습니다.</p>
    {:else}
      <div class="space-y-2">
        {#each approvalChains as chain}
          <div class="p-3 rounded-xl" style="background:rgba(0,0,0,0.15); border:1px solid var(--border)">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-sm" style="color:var(--text)">{chain.name}</span>
              <div class="flex gap-2">
                <button class="text-xs px-2 py-1 rounded-lg" style="color:#60a5fa; background:rgba(59,130,246,0.1)"
                  on:click={() => openEditChain(chain)}>편집</button>
                <button class="text-xs px-2 py-1 rounded-lg" style="color:#f87171; background:rgba(239,68,68,0.1)"
                  on:click={() => chain.id != null && removeChain(chain.id)}>삭제</button>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-1">
              {#each chain.steps as step, i}
                <span class="text-xs px-2 py-0.5 rounded-full" style="background:rgba(29,110,245,0.15); color:#93c5fd">
                  {i + 1}. {step.name}
                </span>
                {#if i < chain.steps.length - 1}
                  <svg class="w-3 h-3 flex-shrink-0" style="color:var(--text-dim)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- ── App Info ────────────────────────────────────────────────── -->
  <section class="panel">
    <h2 class="font-semibold text-slate-700 mb-3">앱 정보</h2>
    <div class="space-y-2 text-sm text-gray-500">
      <div class="flex justify-between"><span>버전</span><span class="font-mono">v0.1.0</span></div>
      <div class="flex justify-between"><span>알고리즘</span><span class="font-mono">ECDSA P-256 / SHA-256</span></div>
      <div class="flex justify-between"><span>인증서 형식</span><span class="font-mono">X.509 v3</span></div>
      <div class="flex justify-between"><span>저장소</span><span class="font-mono">IndexedDB (로컬)</span></div>
    </div>
  </section>

  {/if}
</div>

<!-- ── Approval Chain Editor Modal ─────────────────────────────── -->
{#if showChainEditor}
  <div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog">
    <div class="rounded-2xl p-6 w-full max-w-sm" style="background:var(--bg-panel); border:1px solid var(--border-mid)">
      <h3 class="font-bold text-lg mb-4" style="color:var(--text)">
        {editingChain ? '결제 라인 편집' : '결제 라인 추가'}
      </h3>

      <div class="space-y-4">
        <div>
          <label class="text-sm mb-1 block" style="color:var(--text-muted)">라인 이름</label>
          <input class="input" placeholder="예: 구매 결재 라인" bind:value={chainName} />
        </div>

        <!-- Step list -->
        {#if chainSteps.length > 0}
          <div class="space-y-1">
            <p class="text-xs mb-2" style="color:var(--text-muted)">결재 순서 (위→아래)</p>
            {#each chainSteps as step, i}
              <div class="flex items-center gap-2 p-2 rounded-lg" style="background:rgba(0,0,0,0.2)">
                <span class="text-xs w-5 text-center font-bold" style="color:#60a5fa">{i + 1}</span>
                <span class="flex-1 text-sm truncate" style="color:var(--text)">{step.name}</span>
                <button class="text-gray-500 hover:text-blue-400" on:click={() => moveStep(i, -1)} disabled={i === 0}>
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
                  </svg>
                </button>
                <button class="text-gray-500 hover:text-blue-400" on:click={() => moveStep(i, 1)} disabled={i === chainSteps.length - 1}>
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                <button class="text-gray-500 hover:text-red-400" on:click={() => removeChainStep(i)}>
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Add contact -->
        <div>
          <p class="text-xs mb-1.5" style="color:var(--text-muted)">결재자 추가 (연락처에서 선택)</p>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            {#each contacts.filter(c => !chainSteps.some(s => s.contactId === c.id)) as c}
              <button
                class="w-full flex items-center gap-2 p-2 rounded-lg text-left transition"
                style="background:rgba(0,0,0,0.2)"
                on:click={() => c.id != null && addChainStep(c.id)}
              >
                <span class="text-sm flex-1 truncate" style="color:var(--text)">{c.commonName}</span>
                <span class="text-xs" style="color:var(--text-muted)">{c.email}</span>
                <svg class="w-4 h-4 flex-shrink-0" style="color:#60a5fa" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
              </button>
            {/each}
            {#if contacts.filter(c => !chainSteps.some(s => s.contactId === c.id)).length === 0}
              <p class="text-xs text-center py-2" style="color:var(--text-dim)">모든 연락처가 추가됨</p>
            {/if}
          </div>
        </div>

        {#if chainError}
          <p class="text-sm" style="color:#f87171">{chainError}</p>
        {/if}

        <div class="flex gap-3 pt-1">
          <button class="btn-secondary flex-1" on:click={() => (showChainEditor = false)}>취소</button>
          <button class="btn-primary flex-1" on:click={saveChain}>저장</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Toast -->
{#if toast.visible}
  <div
    class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white transition-all"
    class:bg-green-600={toast.type === 'success'}
    class:bg-red-600={toast.type === 'error'}
    class:bg-slate-700={toast.type === 'info'}
  >{toast.msg}</div>
{/if}
