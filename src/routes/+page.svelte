<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import IDCardWide from '$components/IDCardWide.svelte';
  import { loadIdentity, saveIdentity, loadSettings, type IdentityRecord } from '$lib/storage/keystore';
  import { generateKeyPair, exportPrivateKeyPkcs8, exportPublicKeySpki } from '$lib/crypto/keygen';
  import { generateSelfSignedCert } from '$lib/crypto/cert';
  import { generateCSR } from '$lib/crypto/csr';
  import { generateIdenticon } from '$lib/crypto/identicon';
  import {
    isWebAuthnPRFSupported,
    sealWithWebAuthn,
    sealWithPassword,
    type ProtectionMethod,
    type SealedKey
  } from '$lib/crypto/protection';

  let identity: IdentityRecord | null = null;
  let loading = true;
  let step: 'check' | 'form' | 'protect' | 'generating' | 'done' = 'check';

  // Form fields
  let form = {
    commonName: '',
    email: '',
    phone: '',
    organization: '',
    country: 'KR'
  };

  // Protection
  let protectMethod: ProtectionMethod = 'password';
  let webAuthnAvailable = false;
  let password = '';
  let passwordConfirm = '';
  let backupPassword = '';
  let backupPasswordConfirm = '';
  let formError = '';

  // Avatar
  let avatarDataUrl = '';
  let avatarInput: HTMLInputElement;

  // ── Business card scan ──────────────────────────────────────────
  let scanMode: 'manual' | 'card' = 'manual';
  let cardStep: 'capture' | 'processing' | 'review' = 'capture';
  let cardInput: HTMLInputElement;
  let cardImageFile: File | null = null;
  let cardPreviewUrl = '';
  let cardCroppedUrl = '';       // data URL used for avatar
  let cardOcrStage = '';
  let cardOcrPct = 0;
  let cardError = '';
  let cardElapsed = 0;
  let _cardTimer: ReturnType<typeof setInterval> | null = null;
  let cardDebugLog: string[] = [];
  let cardParsed = { name: '', email: '', phone: '', organization: '' };

  async function processCard() {
    if (!cardImageFile) return;
    cardError = '';
    cardStep = 'processing';
    cardOcrStage = '이미지 로드 중…';
    cardOcrPct = 0;
    cardElapsed = 0;
    if (_cardTimer) clearInterval(_cardTimer);
    _cardTimer = setInterval(() => { cardElapsed += 1; }, 1000);

    try {
      // Load image element
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('이미지 로드 실패'));
        img.src = cardPreviewUrl;
      });

      cardDebugLog = [];
      const { cropCard, tryCropEnhanced, runOCR, parseBizCard, makeLogotype } = await import('$lib/cardocr');

      // 1. Raw canvas — instant, no blocking
      cardOcrStage = '텍스트 인식 준비 중…';
      cardOcrPct = 5;
      const rawCanvas = await cropCard(img);
      cardCroppedUrl = rawCanvas.toDataURL('image/jpeg', 0.85);

      // 2. OCR on raw canvas (starts immediately)
      const ocrPromise = runOCR(rawCanvas, (stage, pct) => {
        cardOcrStage = stage;
        cardOcrPct = pct;
      }, (line) => {
        cardDebugLog = [...cardDebugLog, line];
      }).then(result => {
        // Use the card-derived logotype as avatar immediately
        if (result.logotype) cardCroppedUrl = result.logotype;
        return result;
      });

      // 2b. jscanify perspective crop runs in parallel (best-effort, may lose race)
      const enhancedPromise = tryCropEnhanced(img);

      const { text, logotype } = await ocrPromise;

      // If jscanify finished, regenerate logotype from the perspective-corrected version
      const enhanced = await Promise.race([enhancedPromise, Promise.resolve(null)]);
      if (enhanced) {
        cardCroppedUrl = makeLogotype(enhanced);
      } else if (logotype) {
        cardCroppedUrl = logotype;
      }

      // 3. Parse
      cardParsed = parseBizCard(text);
      cardStep = 'review';
    } catch (e) {
      cardError = e instanceof Error ? e.message : String(e);
      cardStep = 'capture';
    } finally {
      if (_cardTimer) { clearInterval(_cardTimer); _cardTimer = null; }
    }
  }

  function applyCardData() {
    form.commonName   = cardParsed.name         || form.commonName;
    form.email        = cardParsed.email        || form.email;
    form.phone        = cardParsed.phone        || form.phone;
    form.organization = cardParsed.organization || form.organization;
    // cardCroppedUrl is already the 256×256 logotype-ready image
    if (cardCroppedUrl) avatarDataUrl = cardCroppedUrl;
    scanMode = 'manual';
    cardStep = 'capture';
  }

  function resetCardScan() {
    if (_cardTimer) { clearInterval(_cardTimer); _cardTimer = null; }
    cardStep = 'capture';
    cardImageFile = null;
    if (cardPreviewUrl) URL.revokeObjectURL(cardPreviewUrl);
    cardPreviewUrl = '';
    cardCroppedUrl = '';
    cardError = '';
    cardElapsed = 0;
    cardParsed = { name: '', email: '', phone: '', organization: '' };
  }

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

  // Toast
  let toastMsg = '';
  let toastType: 'success' | 'error' | 'info' = 'info';
  let toastVisible = false;

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
    toastMsg = msg;
    toastType = type;
    toastVisible = true;
    setTimeout(() => (toastVisible = false), 3200);
  }

  onMount(async () => {
    const [id, settings] = await Promise.all([loadIdentity(), loadSettings()]);
    identity = id;
    if (identity) {
      step = 'done';
    } else {
      step = 'form';
      form.country = settings.defaultCountry || 'KR';
    }
    webAuthnAvailable = await isWebAuthnPRFSupported();
    if (webAuthnAvailable) protectMethod = 'webauthn';
    loading = false;
  });

  // CSR download from creation form
  let downloadingCSR = false;
  async function downloadCSRFromForm() {
    if (!form.commonName.trim()) { formError = '이름을 입력하세요.'; return; }
    formError = '';
    downloadingCSR = true;
    try {
      const kp = await generateKeyPair();
      const result = await generateCSR(kp, {
        commonName: form.commonName.trim(),
        email: form.email.trim() || undefined,
        organization: form.organization.trim() || undefined,
        country: form.country.trim() || undefined
      });
      const blob = new Blob([result.csrDer], { type: 'application/pkcs10' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.commonName.trim().replace(/\s+/g, '_')}.csr`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast('CSR 신청서가 다운로드되었습니다.', 'success');
    } catch (e) {
      showToast('CSR 생성 실패: ' + String(e), 'error');
    } finally {
      downloadingCSR = false;
    }
  }

  function validateForm(): boolean {
    if (!form.commonName.trim()) {
      formError = '이름을 입력하세요.';
      return false;
    }
    if (protectMethod === 'password') {
      if (password.length < 8) {
        formError = '비밀번호는 8자 이상이어야 합니다.';
        return false;
      }
      if (password !== passwordConfirm) {
        formError = '비밀번호가 일치하지 않습니다.';
        return false;
      }
    }
    formError = '';
    return true;
  }

  async function createIdentity() {
    if (!validateForm()) return;
    step = 'generating';
    try {
      // 1. Generate key pair
      const keyPair = await generateKeyPair();

      // 2. Self-sign certificate
      const { certDer, fingerprint, notBefore, notAfter, serialNumber } =
        await generateSelfSignedCert(keyPair, {
          commonName: form.commonName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          organization: form.organization.trim(),
          country: form.country.trim() || 'KR'
        }, undefined, avatarDataUrl || generateIdenticon(form.commonName.trim() + form.email.trim()));

      // 3. Export and seal private key
      const pkcs8 = await exportPrivateKeyPkcs8(keyPair.privateKey);
      let sealedKey: SealedKey;
      let passwordBackup: SealedKey | null = null;
      if (protectMethod === 'webauthn') {
        sealedKey = await sealWithWebAuthn(pkcs8, form.email || form.commonName, form.commonName);
        // Also create a password backup if provided
        if (backupPassword.length >= 8) {
          passwordBackup = await sealWithPassword(pkcs8, backupPassword);
        }
      } else {
        sealedKey = await sealWithPassword(pkcs8, password);
      }

      // 4. Encode cert as base64
      const certB64 = btoa(
        Array.from(new Uint8Array(certDer), (b) => String.fromCharCode(b)).join('')
      );

      // 5. Store identity
      const record: IdentityRecord = {
        id: 'self',
        commonName: form.commonName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        organization: form.organization.trim(),
        country: form.country.trim() || 'KR',
        certDer: certB64,
        fingerprint,
        notBefore,
        notAfter,
        serialNumber,
        sealedKey,
        passwordBackup,
        createdAt: new Date().toISOString(),
        avatar: avatarDataUrl || generateIdenticon(form.commonName + form.email)
      };
      await saveIdentity(record);
      identity = record;
      step = 'done';
      showToast('신원이 생성되었습니다!', 'success');
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes('PRF') ||
        msg.includes('지문') ||
        protectMethod === 'webauthn'
      ) {
        // Fall back to password
        protectMethod = 'password';
        step = 'protect';
        formError = '지문 인증을 사용할 수 없습니다. 비밀번호를 사용하세요.';
      } else {
        formError = `생성 실패: ${msg}`;
        step = 'form';
      }
    }
  }
</script>

<svelte:head>
  <title>KeyID — 디지털 신원</title>
</svelte:head>

{#if loading}
  <div class="flex items-center justify-center min-h-screen">
    <div class="w-8 h-8 rounded-full border-2 border-navy-600 border-t-transparent animate-spin"></div>
  </div>

{:else if step === 'done' && identity}
  <!-- ── Home: show identity card + quick actions ─ -->
  <div class="px-4 pt-6 pb-4 max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-5">
      <div>
        <h1 class="text-xl font-bold" style="color:var(--text)">내 신원</h1>
        <p class="text-sm" style="color:var(--text-muted)">디지털 서명 인증서</p>
      </div>
      <button on:click={() => goto(base + '/identity')} class="btn-secondary text-sm py-2 px-4">
        자세히 보기
      </button>
    </div>

    <!-- ID Card — full width -->
    <div class="panel overflow-hidden mb-4" style="padding:0">
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
        showActions={false}
      />
    </div>

    <!-- 4 action widgets — uniform 2-column grid -->
    <div class="grid grid-cols-2 gap-3">
      <a href="{base}/file/sign" class="panel flex items-center gap-3 cursor-pointer transition-colors"
        style="border-color:transparent"
        onmouseenter="this.style.borderColor='#3b82f6'"
        onmouseleave="this.style.borderColor='transparent'">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:rgba(29,110,245,0.15)">
          <svg class="w-5 h-5" style="color:#60a5fa" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-sm truncate" style="color:var(--text)">파일 서명</div>
          <div class="text-xs mt-0.5 truncate" style="color:var(--text-muted)">디지털 서명 생성</div>
        </div>
      </a>

      <a href="{base}/file/encrypt" class="panel flex items-center gap-3 cursor-pointer transition-colors"
        style="border-color:transparent"
        onmouseenter="this.style.borderColor='#a855f7'"
        onmouseleave="this.style.borderColor='transparent'">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:rgba(168,85,247,0.15)">
          <svg class="w-5 h-5" style="color:#c084fc" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-sm truncate" style="color:var(--text)">파일 암호화</div>
          <div class="text-xs mt-0.5 truncate" style="color:var(--text-muted)">수신자에게 암호화</div>
        </div>
      </a>

      <a href="{base}/contacts" class="panel flex items-center gap-3 cursor-pointer transition-colors"
        style="border-color:transparent"
        onmouseenter="this.style.borderColor='#22c55e'"
        onmouseleave="this.style.borderColor='transparent'">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:rgba(34,197,94,0.12)">
          <svg class="w-5 h-5" style="color:#4ade80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-sm truncate" style="color:var(--text)">연락처</div>
          <div class="text-xs mt-0.5 truncate" style="color:var(--text-muted)">인증서 관리</div>
        </div>
      </a>

      <a href="{base}/request" class="panel flex items-center gap-3 cursor-pointer transition-colors"
        style="border-color:transparent"
        onmouseenter="this.style.borderColor='#f59e0b'"
        onmouseleave="this.style.borderColor='transparent'">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:rgba(245,158,11,0.12)">
          <svg class="w-5 h-5" style="color:#fbbf24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-sm truncate" style="color:var(--text)">서명 요청</div>
          <div class="text-xs mt-0.5 truncate" style="color:var(--text-muted)">요청 처리</div>
        </div>
      </a>
    </div>
  </div>

{:else if step === 'form'}
  <!-- ── Setup Wizard: step 1 ──────────────────── -->
  <div class="flex items-center justify-center min-h-screen px-4 py-10">
    <div class="w-full max-w-md">
      <!-- Hero -->
      <div class="text-center mb-8">
        <div
          class="w-20 h-20 rounded-3xl flex items-center justify-center text-yellow-400 font-bold text-4xl mx-auto mb-4 shadow-card"
          style="background:linear-gradient(135deg,#1a3a6b,#102445)"
        >K</div>
        <h1 class="text-2xl font-bold text-slate-800">KeyID에 오신 것을 환영합니다</h1>
        <p class="text-gray-500 mt-2">나만의 디지털 신원 인증서를 만드세요.</p>
      </div>

      <!-- Mode toggle -->
      <div class="flex gap-1 mb-4 rounded-xl p-1" style="background:var(--bg-panel)">
        <button
          class="flex-1 py-2 rounded-lg text-sm font-medium transition"
          style={scanMode === 'manual'
            ? 'background:var(--bg-input);color:var(--text)'
            : 'color:var(--text-muted)'}
          on:click={() => { scanMode = 'manual'; }}
        >직접 입력</button>
        <button
          class="flex-1 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1.5"
          style={scanMode === 'card'
            ? 'background:var(--bg-input);color:var(--text)'
            : 'color:var(--text-muted)'}
          on:click={() => { scanMode = 'card'; }}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
          </svg>
          명함 스캔
        </button>
      </div>

      {#if scanMode === 'card'}
        <!-- ── Card scan UI ── -->
        <div class="panel space-y-4">
          {#if cardStep === 'capture'}
            <div class="text-center">
              <p class="text-sm mb-4" style="color:var(--text-muted)">명함 사진을 찍거나 이미지를 선택하세요</p>

              {#if cardImageFile && cardPreviewUrl}
                <div class="mb-4 rounded-xl overflow-hidden border" style="border-color:var(--border)">
                  <img src={cardPreviewUrl} alt="명함 미리보기" class="w-full object-contain max-h-48" />
                </div>
                {#if cardError}
                  <p class="text-sm text-red-500 mb-3">{cardError}</p>
                {/if}
                <div class="flex gap-3">
                  <button class="btn-secondary flex-1 text-sm" on:click={resetCardScan}>다시 선택</button>
                  <button class="btn-primary flex-1 text-sm" on:click={processCard}>스캔 시작</button>
                </div>
              {:else}
                <button
                  class="w-full border-2 border-dashed rounded-xl py-10 px-4 flex flex-col items-center gap-3 transition"
                  style="border-color:var(--border-mid); color:var(--text-muted)"
                  on:click={() => cardInput.click()}
                >
                  <svg class="w-12 h-12 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                  </svg>
                  <span class="text-sm font-medium">명함 이미지 선택</span>
                  <span class="text-xs opacity-60">카메라 촬영 또는 갤러리에서 선택</span>
                </button>
                <input
                  bind:this={cardInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  class="hidden"
                  on:change={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (!f) return;
                    cardImageFile = f;
                    if (cardPreviewUrl) URL.revokeObjectURL(cardPreviewUrl);
                    cardPreviewUrl = URL.createObjectURL(f);
                  }}
                />
              {/if}
            </div>

          {:else if cardStep === 'processing'}
            <div class="text-center py-4 space-y-4">
              <div class="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mx-auto"
                style="border-color:var(--navy); border-top-color:transparent"></div>
              <p class="text-sm font-medium" style="color:var(--text)">{cardOcrStage}</p>
              <div class="rounded-full h-2 overflow-hidden" style="background:var(--bg-panel)">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  style="width:{cardOcrPct}%; background:var(--navy)"
                ></div>
              </div>
              <p class="text-xs font-mono" style="color:var(--text-muted)">
                경과: {cardElapsed}초
              </p>
              {#if cardElapsed >= 8}
                <p class="text-xs" style="color:var(--text-muted)">
                  OCR 서버와 통신 중입니다. 네트워크 상태에 따라 10~20초 소요됩니다.
                </p>
              {/if}
              {#if cardElapsed >= 40}
                <button class="btn-secondary text-xs py-1.5 px-3 mx-auto" on:click={resetCardScan}>
                  취소하고 다시 시도
                </button>
              {/if}

              <!-- 디버그 로그 패널 -->
              {#if cardDebugLog.length > 0}
                <div class="text-left rounded-lg overflow-hidden" style="background:#0d1117; border:1px solid #30363d">
                  <div class="px-3 py-1.5 text-xs font-mono font-bold" style="background:#161b22; color:#58a6ff">
                    DEBUG LOG ({cardDebugLog.length}줄)
                  </div>
                  <div class="px-3 py-2 space-y-0.5 max-h-48 overflow-y-auto">
                    {#each cardDebugLog as line}
                      <div class="text-xs font-mono leading-snug" style="color:#e6edf3; white-space:pre-wrap; word-break:break-all">{line}</div>
                    {/each}
                  </div>
                </div>
              {:else}
                <div class="text-xs font-mono rounded p-2" style="background:#0d1117; color:#6e7681">
                  대기 중 — 로그 없음
                </div>
              {/if}
            </div>

          {:else if cardStep === 'review'}
            {#if cardCroppedUrl}
              <div class="rounded-xl overflow-hidden border mb-1" style="border-color:var(--border)">
                <img src={cardCroppedUrl} alt="보정된 명함" class="w-full object-contain max-h-36" />
              </div>
              <p class="text-xs mb-3" style="color:var(--text-muted)">
                * 이 이미지가 신원 로고타입으로 사용됩니다. 직접 수정 가능합니다.
              </p>
            {/if}
            <div class="space-y-3">
              <div>
                <label class="label" for="cn-card">이름</label>
                <input id="cn-card" class="input" type="text" bind:value={cardParsed.name} placeholder="인식 실패 시 직접 입력" />
              </div>
              <div>
                <label class="label" for="email-card">이메일</label>
                <input id="email-card" class="input" type="email" bind:value={cardParsed.email} placeholder="hong@example.com" />
              </div>
              <div>
                <label class="label" for="phone-card">전화번호</label>
                <input id="phone-card" class="input" type="tel" bind:value={cardParsed.phone} placeholder="010-1234-5678" />
              </div>
              <div>
                <label class="label" for="org-card">소속 / 기관</label>
                <input id="org-card" class="input" type="text" bind:value={cardParsed.organization} placeholder="회사명" />
              </div>
            </div>
            <div class="flex gap-3 pt-1">
              <button class="btn-secondary flex-1 text-sm" on:click={resetCardScan}>다시 스캔</button>
              <button
                class="btn-primary flex-1 text-sm"
                disabled={!cardParsed.name.trim()}
                on:click={applyCardData}
              >이 정보로 시작</button>
            </div>
            {#if !cardParsed.name.trim()}
              <p class="text-xs text-center" style="color:var(--text-muted)">이름을 입력해야 계속할 수 있습니다</p>
            {/if}
          {/if}
        </div>
      {:else}

      <div class="panel space-y-4">
        <!-- Avatar upload -->
        <div class="flex flex-col items-center gap-3 mb-4">
          <div class="relative w-20 h-20">
            {#if avatarDataUrl}
              <img src={avatarDataUrl} alt="avatar" class="w-20 h-20 rounded-full object-cover border-2 border-blue-400" />
            {:else}
              <div class="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold border-2 border-dashed"
                style="background:rgba(59,130,246,0.1); border-color:var(--border-mid); color:var(--text-muted)">
                {form.commonName ? form.commonName[0].toUpperCase() : '?'}
              </div>
            {/if}
            <button
              type="button"
              class="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center"
              style="background:#1d6ef5"
              on:click={() => avatarInput.click()}
            >
              <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </button>
          </div>
          <p class="text-xs" style="color:var(--text-muted)">
            사진 없으면 자동 아이콘 생성
          </p>
          <input
            bind:this={avatarInput}
            type="file"
            accept="image/*"
            class="hidden"
            on:change={async (e) => {
              const f = e.currentTarget.files?.[0];
              if (f) avatarDataUrl = await resizeAvatar(f);
            }}
          />
        </div>

        <div>
          <label class="label" for="cn">이름 <span class="text-red-400">*</span></label>
          <input
            id="cn"
            class="input"
            type="text"
            placeholder="홍길동"
            bind:value={form.commonName}
            maxlength="64"
          />
        </div>
        <div>
          <label class="label" for="email">이메일</label>
          <input
            id="email"
            class="input"
            type="email"
            placeholder="hong@example.com"
            bind:value={form.email}
          />
        </div>
        <div>
          <label class="label" for="phone">전화번호</label>
          <input
            id="phone"
            class="input"
            type="tel"
            placeholder="+821012345678"
            bind:value={form.phone}
          />
        </div>
        <div>
          <label class="label" for="org">소속 / 기관</label>
          <input
            id="org"
            class="input"
            type="text"
            placeholder="회사 또는 개인"
            bind:value={form.organization}
            maxlength="64"
          />
        </div>
        <div>
          <label class="label" for="country">국가 코드</label>
          <input
            id="country"
            class="input"
            type="text"
            placeholder="KR"
            bind:value={form.country}
            maxlength="2"
          />
        </div>

        {#if formError}
          <p class="text-sm text-red-500">{formError}</p>
        {/if}

        <button
          class="btn-primary w-full"
          on:click={() => {
            if (!form.commonName.trim()) { formError = '이름을 입력하세요.'; return; }
            formError = '';
            step = 'protect';
          }}
        >
          다음: 키 보호 방법 선택
        </button>

        <!-- CSR option -->
        <div class="border-t border-gray-100 pt-3 text-center">
          <p class="text-xs text-gray-400 mb-2">또는 CA에 제출할 인증서 신청서(CSR)만 생성</p>
          <button
            class="btn-secondary text-sm py-2"
            on:click={downloadCSRFromForm}
            disabled={downloadingCSR}
          >
            {downloadingCSR ? 'CSR 생성 중…' : 'CSR 신청서 다운로드'}
          </button>
        </div>
      </div>
      {/if}<!-- end scanMode -->
    </div>
  </div>

{:else if step === 'protect'}
  <!-- ── Setup Wizard: step 2 ──────────────────── -->
  <div class="flex items-center justify-center min-h-screen px-4 py-10">
    <div class="w-full max-w-md">
      <div class="text-center mb-6">
        <h2 class="text-xl font-bold text-slate-800">개인 키 보호</h2>
        <p class="text-gray-500 text-sm mt-1">키를 안전하게 암호화합니다</p>
      </div>

      <div class="panel space-y-4">
        <!-- Method picker -->
        <div class="grid grid-cols-2 gap-3">
          {#if webAuthnAvailable}
            <button
              class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition text-center"
              class:border-navy-600={protectMethod === 'webauthn'}
              class:bg-navy-50={protectMethod === 'webauthn'}
              class:border-gray-200={protectMethod !== 'webauthn'}
              on:click={() => (protectMethod = 'webauthn')}
            >
              <span class="text-2xl">👆</span>
              <div class="text-sm font-semibold text-slate-700">지문 인증</div>
              <div class="text-xs text-gray-400">생체 인증 사용</div>
            </button>
          {/if}
          <button
            class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition text-center"
            class:border-navy-600={protectMethod === 'password'}
            class:bg-navy-50={protectMethod === 'password'}
            class:border-gray-200={protectMethod !== 'password'}
            class:col-span-2={!webAuthnAvailable}
            on:click={() => (protectMethod = 'password')}
          >
            <span class="text-2xl">🔑</span>
            <div class="text-sm font-semibold text-slate-700">비밀번호</div>
            <div class="text-xs text-gray-400">비밀번호로 보호</div>
          </button>
        </div>

        {#if protectMethod === 'password'}
          <div>
            <label class="label" for="pw">비밀번호 <span class="text-red-400">*</span></label>
            <input
              id="pw"
              class="input"
              type="password"
              placeholder="8자 이상"
              bind:value={password}
            />
          </div>
          <div>
            <label class="label" for="pw2">비밀번호 확인</label>
            <input
              id="pw2"
              class="input"
              type="password"
              placeholder="동일한 비밀번호 입력"
              bind:value={passwordConfirm}
            />
          </div>
        {:else}
          <div class="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
            <strong>지문 인증</strong>을 사용하면 기기의 생체 인식 센서로 개인 키를 보호합니다.
            다음 단계에서 지문 등록을 요청합니다.
          </div>
          <!-- Optional backup password -->
          <div class="border-t border-gray-100 pt-4">
            <p class="text-xs text-gray-500 mb-3">비밀번호 백업 (선택사항) — 지문을 사용할 수 없을 때 대안으로 사용</p>
            <div class="space-y-3">
              <input
                class="input text-sm"
                type="password"
                placeholder="백업 비밀번호 (8자 이상, 선택)"
                bind:value={backupPassword}
              />
              {#if backupPassword.length > 0}
                <input
                  class="input text-sm"
                  type="password"
                  placeholder="백업 비밀번호 확인"
                  bind:value={backupPasswordConfirm}
                />
              {/if}
            </div>
          </div>
        {/if}

        {#if formError}
          <p class="text-sm text-red-500">{formError}</p>
        {/if}

        <div class="flex gap-3">
          <button
            class="btn-secondary flex-1"
            on:click={() => { step = 'form'; formError = ''; }}
          >이전</button>
          <button
            class="btn-primary flex-1"
            on:click={createIdentity}
          >
            신원 생성
          </button>
        </div>
      </div>
    </div>
  </div>

{:else if step === 'generating'}
  <div class="flex flex-col items-center justify-center min-h-screen gap-4">
    <div class="w-12 h-12 rounded-full border-4 border-navy-600 border-t-transparent animate-spin"></div>
    <p class="text-gray-600 font-medium">인증서를 생성하는 중…</p>
    <p class="text-sm text-gray-400">
      {protectMethod === 'webauthn' ? '지문 인증을 완료해 주세요.' : '잠시 기다려 주세요.'}
    </p>
  </div>
{/if}

<!-- Toast -->
{#if toastVisible}
  <div class="toast toast-{toastType}" role="alert">{toastMsg}</div>
{/if}
