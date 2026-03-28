<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import IDCardWide from '$components/IDCardWide.svelte';
  import QRCode from '$components/QRCode.svelte';
  import {
    loadIdentity, saveIdentity, deleteIdentity,
    archiveIdentity, getAllExpiredIdentities,
    type IdentityRecord, type ExpiredIdentityRecord
  } from '$lib/storage/keystore';
  import { certDerToPem, renewCertSameKey, generateSelfSignedCert } from '$lib/crypto/cert';
  import { generateKeyPair, exportPrivateKeyPkcs8 } from '$lib/crypto/keygen';
  import {
    isWebAuthnPRFSupported, sealWithWebAuthn, sealWithPassword,
    unsealKey, type SealedKey
  } from '$lib/crypto/protection';
  import { generateIdenticon } from '$lib/crypto/identicon';
  import { renderCardToPng } from '$lib/share/card';
  import { downloadFile } from '$lib/fileHandler';

  // Avatar editing
  let avatarInput: HTMLInputElement;
  let updatingAvatar = false;

  async function resizeAvatar(file: File): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxSz = 256;
        const scale = Math.min(maxSz / img.width, maxSz / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = url;
    });
  }

  async function handleAvatarChange(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file || !identity) return;
    updatingAvatar = true;
    try {
      const dataUrl = await resizeAvatar(file);
      const updated = { ...identity, avatar: dataUrl };
      await saveIdentity(updated);
      identity = updated;
      showToast('사진이 업데이트되었습니다.', 'success');
    } finally {
      updatingAvatar = false;
    }
  }

  async function removeAvatar() {
    if (!identity) return;
    const updated = { ...identity, avatar: generateIdenticon(identity.commonName + identity.email) };
    await saveIdentity(updated);
    identity = updated;
    showToast('아이콘으로 변경되었습니다.', 'info');
  }

  let identity: IdentityRecord | null = null;
  let expiredIdentities: ExpiredIdentityRecord[] = [];
  let loading = true;
  let showQR = false;
  let qrData = '';  // single QR string for stable rendering
  let showDeleteConfirm = false;
  let toast = { visible: false, msg: '', type: 'info' as 'success' | 'error' | 'info' };

  // Renewal state
  let showRenewDialog = false;
  let renewMode: 'same-key' | 'new-key' | null = null;
  let renewYears = 1;
  let renewPassword = '';
  let renewNewPassword = '';
  let renewNewPasswordConfirm = '';
  let renewUnlockMethod: 'biometric' | 'password' = 'biometric';
  let renewing = false;
  let renewError = '';
  let webAuthnAvailable = false;

  function showToast(msg: string, type: typeof toast.type = 'info') {
    toast = { visible: true, msg, type };
    setTimeout(() => (toast = { ...toast, visible: false }), 3200);
  }

  onMount(async () => {
    [identity, expiredIdentities, webAuthnAvailable] = await Promise.all([
      loadIdentity(),
      getAllExpiredIdentities(),
      isWebAuthnPRFSupported()
    ]);
    if (identity) {
      renewUnlockMethod = identity.sealedKey.method === 'webauthn' ? 'biometric' : 'password';
    }
    loading = false;
  });

  function openRenewDialog() {
    renewMode = null;
    renewPassword = '';
    renewNewPassword = '';
    renewNewPasswordConfirm = '';
    renewError = '';
    showRenewDialog = true;
  }

  async function performRenewal() {
    if (!identity || !renewMode) return;
    renewError = '';
    renewing = true;
    try {
      // Unlock current private key
      const pkcs8 = await unsealKey({
        sealed: identity.sealedKey,
        passwordBackup: identity.passwordBackup ?? undefined,
        password: renewUnlockMethod === 'password' ? renewPassword : undefined,
        preferPassword: renewUnlockMethod === 'password'
      });

      // Archive current identity before replacing — preserve key for reuse (password only)
      const archivedSealedKey: SealedKey | null =
        identity.passwordBackup ??
        (identity.sealedKey.method === 'password' ? identity.sealedKey : null);
      await archiveIdentity({
        commonName: identity.commonName,
        email: identity.email,
        organization: identity.organization,
        country: identity.country,
        certDer: identity.certDer,
        fingerprint: identity.fingerprint,
        notBefore: identity.notBefore,
        notAfter: identity.notAfter,
        serialNumber: identity.serialNumber,
        revokedAt: new Date().toISOString(),
        avatar: identity.avatar ?? null,
        sealedKey: archivedSealedKey
      });

      let newPkcs8 = pkcs8;
      let newCertResult: Awaited<ReturnType<typeof generateSelfSignedCert>>;

      if (renewMode === 'same-key') {
        // Reuse existing key, just issue new cert with extended validity
        const currentCertDer = getCertDerBytes();
        if (!currentCertDer) throw new Error('인증서를 읽을 수 없습니다.');
        newCertResult = await renewCertSameKey(pkcs8, currentCertDer, {
          commonName: identity.commonName,
          email: identity.email || undefined,
          phone: identity.phone || undefined,
          organization: identity.organization || undefined,
          country: identity.country || undefined
        }, renewYears, identity.avatar || generateIdenticon(identity.commonName + identity.email));
      } else {
        // Generate entirely new key pair
        const keyPair = await generateKeyPair();
        newPkcs8 = await exportPrivateKeyPkcs8(keyPair.privateKey);
        newCertResult = await generateSelfSignedCert(keyPair, {
          commonName: identity.commonName,
          email: identity.email || undefined,
          phone: identity.phone || undefined,
          organization: identity.organization || undefined,
          country: identity.country || undefined
        }, undefined, identity.avatar || generateIdenticon(identity.commonName + identity.email));
      }

      // Seal the (possibly new) private key
      let sealedKey: SealedKey;
      let passwordBackup: SealedKey | null = null;
      if (identity.sealedKey.method === 'webauthn' && renewUnlockMethod === 'biometric') {
        sealedKey = await sealWithWebAuthn(newPkcs8, identity.email || identity.commonName, identity.commonName);
        if (renewNewPassword.length >= 8) {
          passwordBackup = await sealWithPassword(newPkcs8, renewNewPassword);
        } else if (identity.passwordBackup) {
          // Re-seal backup if we have new pkcs8 for new-key mode, otherwise keep old backup
          // For same-key, the pkcs8 is same so old backup still works — keep it
          passwordBackup = renewMode === 'same-key' ? (identity.passwordBackup ?? null) : null;
        }
      } else {
        const pw = renewNewPassword.length >= 8 ? renewNewPassword : renewPassword;
        sealedKey = await sealWithPassword(newPkcs8, pw);
      }

      const certB64 = btoa(
        Array.from(new Uint8Array(newCertResult.certDer), (b) => String.fromCharCode(b)).join('')
      );

      const updated: IdentityRecord = {
        ...identity,
        certDer: certB64,
        fingerprint: newCertResult.fingerprint,
        notBefore: newCertResult.notBefore,
        notAfter: newCertResult.notAfter,
        serialNumber: newCertResult.serialNumber,
        sealedKey,
        passwordBackup,
        avatar: identity.avatar || generateIdenticon(identity.commonName + identity.email)
      };
      await saveIdentity(updated);
      identity = updated;
      expiredIdentities = await getAllExpiredIdentities();
      showRenewDialog = false;
      showToast(renewMode === 'same-key' ? '인증서가 갱신되었습니다.' : '새 키로 신원이 재발급되었습니다.', 'success');
    } catch (e) {
      renewError = e instanceof Error ? e.message : String(e);
    } finally {
      renewing = false;
    }
  }

  function getCertDer(): ArrayBuffer | null {
    return getCertDerBytes();
  }

  function getCertDerBytes(): ArrayBuffer | null {
    if (!identity) return null;
    const binary = atob(identity.certDer);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function downloadCert() {
    const der = getCertDer();
    if (!der) return;
    const name = identity!.commonName.replace(/\s+/g, '_');
    downloadFile(der, `${name}.pkis-cert`, 'application/pkis-cert');
    showToast('인증서를 다운로드했습니다.', 'success');
  }

  async function downloadCertPem() {
    const der = getCertDer();
    if (!der) return;
    const pem = certDerToPem(der);
    const blob = new Blob([pem], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${identity!.commonName.replace(/\s+/g, '_')}.pem`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('PEM 인증서를 다운로드했습니다.', 'success');
  }

  async function shareCard() {
    if (!identity) return;
    try {
      const png = await renderCardToPng({
        commonName: identity.commonName,
        email: identity.email,
        organization: identity.organization,
        country: identity.country,
        fingerprint: identity.fingerprint,
        notAfter: identity.notAfter,
        avatar: identity.avatar,
        trustLevel: 'self'
      });
      // Try native share first
      if (navigator.share && navigator.canShare) {
        const bin = atob(png.split(',')[1]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const file = new File([arr], 'keyid-card.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'KeyID 인증서' });
          return;
        }
      }
      // Fallback: download image
      const a = document.createElement('a');
      a.href = png;
      a.download = 'keyid-card.png';
      a.click();
      showToast('카드 이미지를 저장했습니다.', 'success');
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') {
        showToast('공유 실패: ' + String(e), 'error');
      }
    }
  }

  function toBase64Url(buf: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  function openQR() {
    const der = getCertDer();
    if (!der) return;
    qrData = `KID:${toBase64Url(der)}`;
    showQR = true;
  }

  function closeQR() {
    showQR = false;
  }

  async function confirmDelete() {
    await deleteIdentity();
    goto(base + '/');
  }

  $: certShortFp = identity?.fingerprint
    ? identity.fingerprint.split(':').slice(0, 4).join(':') + '…'
    : '';
</script>

<svelte:head>
  <title>내 신원 — KeyID</title>
</svelte:head>

{#if loading}
  <div class="flex items-center justify-center min-h-screen">
    <div class="w-8 h-8 rounded-full border-2 border-navy-600 border-t-transparent animate-spin"></div>
  </div>
{:else if !identity}
  <div class="flex flex-col items-center justify-center min-h-screen gap-4 px-4 text-center">
    <p class="text-gray-500">신원이 없습니다.</p>
    <a href="{base}/" class="btn-primary">신원 만들기</a>
  </div>
{:else}
  <div class="px-4 pt-6 pb-4 max-w-2xl mx-auto">
    <div class="flex items-center justify-between mb-5">
      <div>
        <h1 class="text-xl font-bold text-slate-800">내 신원</h1>
        <p class="text-sm text-gray-400">디지털 서명 인증서</p>
      </div>
    </div>

    <!-- Wide card + avatar edit -->
    <div class="mb-3 overflow-x-auto relative">
      <IDCardWide
        commonName={identity.commonName}
        email={identity.email}
        organization={identity.organization}
        country={identity.country}
        fingerprint={identity.fingerprint}
        notBefore={identity.notBefore}
        notAfter={identity.notAfter}
        serialNumber={identity.serialNumber}
        avatar={identity.avatar}
        trustLevel="self"
        on:share={shareCard}
        on:download={downloadCert}
        on:qr={openQR}
      />
    </div>
    <!-- Avatar edit controls -->
    <div class="flex items-center gap-2 mb-5">
      <button
        class="btn-secondary text-xs py-1.5 px-3"
        on:click={() => avatarInput.click()}
        disabled={updatingAvatar}
      >
        {updatingAvatar ? '저장 중…' : '📷 사진 변경'}
      </button>
      {#if identity.avatar && !identity.avatar.startsWith('data:image/svg')}
        <button class="btn-secondary text-xs py-1.5 px-3" on:click={removeAvatar}>
          아이콘으로 초기화
        </button>
      {/if}
      <input bind:this={avatarInput} type="file" accept="image/*" class="hidden"
        on:change={handleAvatarChange} />
    </div>

    <!-- Details panel -->
    <div class="panel mb-4">
      <h2 class="font-semibold text-slate-700 mb-3">인증서 세부 정보</h2>
      <dl class="space-y-2 text-sm">
        <div class="flex gap-3">
          <dt class="w-24 text-gray-400 flex-shrink-0">이름</dt>
          <dd class="text-slate-700 font-medium">{identity.commonName}</dd>
        </div>
        {#if identity.email}
          <div class="flex gap-3">
            <dt class="w-24 text-gray-400 flex-shrink-0">이메일</dt>
            <dd class="text-slate-700">{identity.email}</dd>
          </div>
        {/if}
        {#if identity.phone}
          <div class="flex gap-3">
            <dt class="w-24 text-gray-400 flex-shrink-0">전화번호</dt>
            <dd class="text-slate-700">{identity.phone}</dd>
          </div>
        {/if}
        {#if identity.organization}
          <div class="flex gap-3">
            <dt class="w-24 text-gray-400 flex-shrink-0">소속</dt>
            <dd class="text-slate-700">{identity.organization}</dd>
          </div>
        {/if}
        <div class="flex gap-3">
          <dt class="w-24 text-gray-400 flex-shrink-0">국가</dt>
          <dd class="text-slate-700">{identity.country}</dd>
        </div>
        <div class="flex gap-3">
          <dt class="w-24 text-gray-400 flex-shrink-0">발급일</dt>
          <dd class="text-slate-700">{new Date(identity.notBefore).toLocaleDateString('ko-KR')}</dd>
        </div>
        <div class="flex gap-3">
          <dt class="w-24 text-gray-400 flex-shrink-0">만료일</dt>
          <dd class="text-slate-700">{new Date(identity.notAfter).toLocaleDateString('ko-KR')}</dd>
        </div>
        <div class="flex gap-3">
          <dt class="w-24 text-gray-400 flex-shrink-0">보호 방법</dt>
          <dd class="text-slate-700">
            {identity.sealedKey.method === 'webauthn' ? '지문 인증 (WebAuthn PRF)' : '비밀번호 (PBKDF2)'}
          </dd>
        </div>
        <div class="flex gap-3">
          <dt class="w-24 text-gray-400 flex-shrink-0">일련번호</dt>
          <dd class="font-mono text-xs text-gray-500 break-all">{identity.serialNumber}</dd>
        </div>
        <div class="flex gap-3 pt-1">
          <dt class="w-24 text-gray-400 flex-shrink-0 pt-1">지문</dt>
          <dd class="font-mono text-xs text-gray-500 break-all leading-relaxed">{identity.fingerprint}</dd>
        </div>
      </dl>
    </div>

    <!-- Action buttons -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <button class="btn-secondary text-sm py-2.5" on:click={downloadCert}>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        .pkis-cert 저장
      </button>
      <button class="btn-secondary text-sm py-2.5" on:click={downloadCertPem}>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        PEM 저장
      </button>
      <button class="btn-secondary text-sm py-2.5" on:click={openQR}>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
        </svg>
        QR 공유
      </button>
      <button class="btn-secondary text-sm py-2.5" on:click={shareCard}>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
        </svg>
        카드 공유
      </button>
    </div>

    <!-- Renewal -->
    <div class="panel mb-4">
      <h3 class="font-semibold mb-1" style="color:var(--text)">신원 갱신</h3>
      <p class="text-sm mb-3" style="color:var(--text-muted)">
        인증서를 갱신하거나 새 키를 발급합니다. 기존 인증서는 만료 신원으로 보관됩니다.
      </p>
      <button class="btn-secondary text-sm py-2 px-4" on:click={openRenewDialog}>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        신원 갱신
      </button>
    </div>

    <!-- Archived identities -->
    {#if expiredIdentities.length > 0}
      <div class="panel mb-4">
        <h3 class="font-semibold mb-3" style="color:var(--text)">보관된 과거 신원 ({expiredIdentities.length})</h3>
        <p class="text-xs mb-3" style="color:var(--text-muted)">
          과거 신원은 서명·암호화 시 선택 사용할 수 있습니다 (백업 비밀번호 필요).
        </p>
        <div class="space-y-2">
          {#each expiredIdentities as expired}
            <div class="rounded-xl p-3" style="background:rgba(0,0,0,0.2); border:1px solid var(--border)">
              <div class="flex items-center gap-3">
                <!-- Avatar -->
                <div class="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                  {#if expired.avatar}
                    <img src={expired.avatar} alt={expired.commonName} class="w-full h-full object-cover" />
                  {:else}
                    <div class="w-full h-full flex items-center justify-center text-sm font-bold"
                      style="background:linear-gradient(135deg,#2d3748,#1a202c); color:#a0aec0">
                      {expired.commonName[0]?.toUpperCase() ?? '?'}
                    </div>
                  {/if}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm truncate" style="color:var(--text)">{expired.commonName}</div>
                  <div class="text-xs font-mono truncate" style="color:var(--text-muted)">
                    {expired.fingerprint.split(':').slice(0,4).join(':')}…
                  </div>
                  <div class="text-xs mt-0.5" style="color:var(--text-dim)">
                    만료 {new Date(expired.notAfter).toLocaleDateString('ko-KR')} ·
                    폐지 {new Date(expired.revokedAt).toLocaleDateString('ko-KR')}
                  </div>
                </div>
                <div class="flex flex-col gap-1 flex-shrink-0">
                  {#if expired.sealedKey}
                    <a href="{base}/file/sign?archived={expired.id}"
                      class="text-xs px-2.5 py-1 rounded-lg font-medium"
                      style="background:rgba(59,130,246,0.15); color:#60a5fa">
                      서명
                    </a>
                  {:else}
                    <span class="text-xs px-2 py-1 rounded-lg" style="color:var(--text-dim); background:rgba(0,0,0,0.2)">
                      키 없음
                    </span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Danger zone -->
    <div class="panel" style="border:1px solid rgba(239,68,68,0.3)">
      <h3 class="font-semibold mb-2" style="color:#f87171">위험 구역</h3>
      <p class="text-sm mb-3" style="color:var(--text-muted)">신원을 삭제하면 개인 키가 영구 삭제됩니다. 되돌릴 수 없습니다.</p>
      <button class="btn-danger text-sm py-2 px-4" on:click={() => (showDeleteConfirm = true)}>
        신원 삭제
      </button>
    </div>
  </div>
{/if}

<!-- Renewal Modal -->
{#if showRenewDialog && identity}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog">
    <div class="rounded-2xl p-6 max-w-sm w-full" style="background:var(--bg-panel); border:1px solid var(--border-mid)">
      <h3 class="font-bold text-lg mb-1" style="color:var(--text)">신원 갱신</h3>
      <p class="text-sm mb-5" style="color:var(--text-muted)">갱신 방식을 선택하세요.</p>

      {#if !renewMode}
        <!-- Mode selection -->
        <div class="space-y-3 mb-5">
          <button
            class="w-full text-left p-4 rounded-xl border-2 transition"
            style="border-color:var(--border-mid); background:var(--bg)"
            on:click={() => (renewMode = 'same-key')}
          >
            <div class="font-semibold text-sm mb-1" style="color:var(--text)">🔑 키 유지 갱신</div>
            <div class="text-xs" style="color:var(--text-muted)">기존 키를 유지하고 인증서 유효기간 연장 (1년 단위)</div>
          </button>
          <button
            class="w-full text-left p-4 rounded-xl border-2 transition"
            style="border-color:var(--border-mid); background:var(--bg)"
            on:click={() => (renewMode = 'new-key')}
          >
            <div class="font-semibold text-sm mb-1" style="color:var(--text)">✨ 새 키 발급</div>
            <div class="text-xs" style="color:var(--text-muted)">새 키 쌍과 인증서를 발급. 기존 서명 파일과의 호환성은 유지됨</div>
          </button>
        </div>
        <button class="btn-secondary w-full" on:click={() => (showRenewDialog = false)}>취소</button>

      {:else}
        <!-- Unlock current key -->
        <div class="space-y-3 mb-4">
          <p class="text-sm font-medium" style="color:var(--text)">
            {renewMode === 'same-key' ? '키 유지 갱신' : '새 키 발급'} — 현재 키 인증
          </p>

          {#if renewMode === 'same-key'}
            <div>
              <p class="text-xs mb-1.5" style="color:var(--text-muted)">연장 기간</p>
              <div class="flex gap-1.5">
                {#each [1, 2, 3] as y}
                  <button
                    class="flex-1 py-1.5 rounded-lg text-sm font-semibold transition"
                    style={renewYears === y
                      ? 'background:#1d6ef5; color:white'
                      : 'background:var(--bg); color:var(--text-muted); border:1px solid var(--border-mid)'}
                    on:click={() => (renewYears = y)}
                  >{y}년</button>
                {/each}
              </div>
            </div>
          {/if}

          {#if identity.sealedKey.method === 'webauthn' && identity.passwordBackup}
            <div class="flex rounded-lg overflow-hidden" style="border:1px solid var(--border-mid)">
              <button
                class="flex-1 py-2 text-xs font-semibold transition"
                style={renewUnlockMethod === 'biometric'
                  ? 'background:#1d6ef5; color:white'
                  : 'background:var(--bg); color:var(--text-muted)'}
                on:click={() => (renewUnlockMethod = 'biometric')}
              >지문</button>
              <button
                class="flex-1 py-2 text-xs font-semibold transition"
                style={renewUnlockMethod === 'password'
                  ? 'background:#1d6ef5; color:white'
                  : 'background:var(--bg); color:var(--text-muted)'}
                on:click={() => (renewUnlockMethod = 'password')}
              >비밀번호</button>
            </div>
          {/if}

          {#if identity.sealedKey.method === 'password' || renewUnlockMethod === 'password'}
            <input
              class="input"
              type="password"
              placeholder="현재 비밀번호"
              bind:value={renewPassword}
            />
          {:else}
            <p class="text-xs p-3 rounded-lg" style="background:rgba(29,110,245,0.1); color:#93c5fd">
              지문 인증으로 잠금 해제합니다.
            </p>
          {/if}

          <!-- Optional: new password for new-key or change password -->
          {#if renewMode === 'new-key'}
            <div style="border-top:1px solid var(--border); padding-top:12px">
              <p class="text-xs mb-2" style="color:var(--text-muted)">새 키 보호 비밀번호 (기존과 다르게 하려면 입력)</p>
              <input class="input mb-2" type="password" placeholder="새 비밀번호 (선택)" bind:value={renewNewPassword} />
              {#if renewNewPassword.length > 0}
                <input class="input" type="password" placeholder="새 비밀번호 확인" bind:value={renewNewPasswordConfirm} />
              {/if}
            </div>
          {/if}
        </div>

        {#if renewError}
          <p class="text-sm mb-3" style="color:#f87171">{renewError}</p>
        {/if}

        <div class="flex gap-3">
          <button class="btn-secondary flex-1" on:click={() => (renewMode = null)} disabled={renewing}>이전</button>
          <button
            class="btn-primary flex-1"
            on:click={performRenewal}
            disabled={renewing}
          >
            {#if renewing}
              <div class="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
            {:else}
              갱신
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- QR Modal -->
{#if showQR}
  <div
    class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    on:click={closeQR}
    role="dialog"
    aria-label="QR 코드"
  >
    <div
      class="rounded-3xl p-6 max-w-sm w-full text-center"
      style="background:var(--bg-panel); border:1px solid var(--border-mid)"
      on:click|stopPropagation
      role="presentation"
    >
      <h3 class="font-bold text-slate-800 mb-1">인증서 QR 코드</h3>
      <p class="text-sm text-gray-400 mb-4">스캔하면 연락처에 추가됩니다</p>
      {#if qrData}
        <div class="flex justify-center mb-3">
          <QRCode data={qrData} size={260} />
        </div>
      {/if}
      <button class="btn-secondary w-full" on:click={closeQR}>닫기</button>
    </div>
  </div>
{/if}

<!-- Delete confirm modal -->
{#if showDeleteConfirm}
  <div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog">
    <div class="rounded-3xl p-6 max-w-sm w-full" style="background:var(--bg-panel); border:1px solid var(--border-mid)">
      <h3 class="font-bold text-slate-800 mb-2">신원 삭제</h3>
      <p class="text-sm text-gray-500 mb-5">
        정말 삭제하시겠습니까? 개인 키와 인증서가 영구 삭제되며 복구할 수 없습니다.
      </p>
      <div class="flex gap-3">
        <button class="btn-secondary flex-1" on:click={() => (showDeleteConfirm = false)}>취소</button>
        <button class="btn-danger flex-1" on:click={confirmDelete}>삭제</button>
      </div>
    </div>
  </div>
{/if}

<!-- Toast -->
{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}
